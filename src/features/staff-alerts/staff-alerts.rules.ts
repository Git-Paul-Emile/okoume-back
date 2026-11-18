/** Règles des dossiers d'alerte (17.6), sans accès aux données : testées seules. */

export type AlertLevel = 'info' | 'warning' | 'critical';
export type AlertState = 'new' | 'in_progress' | 'resolved' | 'closed';

/** Type et non interface : une étape doit pouvoir s'enregistrer telle quelle en JSON. */
export type AlertEvent = { at: string; by: string; event: string };
export type AlertEpisode = { openedAt: string; resolvedAt?: string };

/** Situation détectée à un instant donné ; key regroupe les répétitions d'une même alerte. */
export interface DetectedAlert {
  key: string;
  level: AlertLevel;
  title: string;
  detail: string;
  to: string;
}

export interface AlertRecord extends DetectedAlert {
  id: string;
  state: AlertState;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  cleared: boolean;
  assigneeId: string | null;
  closureReason: string | null;
  actionTaken: string | null;
  episodes: AlertEpisode[];
  lastReminderAt: Date | null;
  history: AlertEvent[];
}

export type NewAlert = Omit<AlertRecord, 'id'>;
export type AlertChanges = Partial<Omit<AlertRecord, 'id' | 'key'>>;

const SYSTEM = 'Système';
export const isOpen = (a: Pick<AlertRecord, 'state'>) => a.state === 'new' || a.state === 'in_progress';

/**
 * Synchronise les dossiers avec la détection : création, mise à jour sans doublon, réouverture après traitement
 * (nouvel épisode, historique conservé), signalement d'une situation disparue. Rien n'est résolu ni clôturé ici.
 */
export function syncAlerts(existing: AlertRecord[], detected: DetectedAlert[], now: Date) {
  const at = now.toISOString();
  const byKey = new Map(existing.map((a) => [a.key, a]));
  const create: NewAlert[] = [];
  const update: Array<{ id: string; changes: AlertChanges }> = [];

  for (const d of detected) {
    const a = byKey.get(d.key);
    if (!a) {
      create.push({
        ...d,
        state: 'new',
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        cleared: false,
        assigneeId: null,
        closureReason: null,
        actionTaken: null,
        episodes: [{ openedAt: at }],
        lastReminderAt: null,
        history: [{ at, by: SYSTEM, event: 'Alerte détectée' }],
      });
    } else if (!isOpen(a)) {
      // Dossier traité : rouvert seulement si la situation avait disparu puis revient, ou si elle a changé
      if (!a.cleared && a.detail === d.detail && a.level === d.level) continue;
      update.push({
        id: a.id,
        changes: {
          ...d,
          state: 'new',
          cleared: false,
          closureReason: null,
          actionTaken: null,
          occurrences: a.occurrences + 1,
          lastSeenAt: now,
          episodes: [...a.episodes, { openedAt: at }],
          history: [...a.history, { at, by: SYSTEM, event: 'Réapparition : dossier rouvert' }],
        },
      });
    } else if (a.detail !== d.detail || a.level !== d.level || a.cleared) {
      update.push({
        id: a.id,
        changes: {
          ...d,
          cleared: false,
          lastSeenAt: now,
          history:
            a.level !== d.level ? [...a.history, { at, by: SYSTEM, event: `Niveau modifié : ${d.level}` }] : a.history,
        },
      });
    }
  }
  const keys = new Set(detected.map((d) => d.key));
  for (const a of existing)
    if (!keys.has(a.key) && !a.cleared)
      update.push({
        id: a.id,
        changes: isOpen(a)
          ? { cleared: true, history: [...a.history, { at, by: SYSTEM, event: 'Situation plus détectée' }] }
          : { cleared: true },
      });
  return { create, update };
}

/** Alerte critique toujours nouvelle après le délai d'escalade, et pas relancée depuis : une relance est due. */
export function needsEscalation(a: AlertRecord, now: Date, hours: number) {
  if (a.level !== 'critical' || a.state !== 'new' || a.cleared) return false;
  const since = new Date(a.episodes.at(-1)?.openedAt ?? a.firstSeenAt).getTime();
  const last = a.lastReminderAt?.getTime() ?? since;
  return now.getTime() - last >= hours * 3_600_000;
}

/** Clôture : justification obligatoire ; pour une alerte critique, action effectuée ou motif d'absence d'action. */
export function closureError(level: AlertLevel, reason: string | undefined, action: string | undefined) {
  if (!reason || reason.trim().length < 5) return 'Indiquez la justification de la clôture.';
  if (level === 'critical' && (!action || action.trim().length < 5))
    return 'Alerte critique : décrivez l’action effectuée, ou pourquoi aucune action n’était nécessaire.';
  return null;
}
