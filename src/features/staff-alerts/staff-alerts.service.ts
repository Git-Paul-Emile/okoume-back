import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { Notifier } from '../notifications/notifier.js';
import type { InformationRepository } from '../settings/settings.repository.js';
import type { AlertCounts, StaffAlertsRepository } from './staff-alerts.repository.js';
import {
  closureError,
  isOpen,
  needsEscalation,
  syncAlerts,
  type AlertRecord,
  type DetectedAlert,
} from './staff-alerts.rules.js';
import type { UpdateAlertInput } from './staff-alerts.schemas.js';

/** Situations surveillées : seuil franchi dès qu'il y a au moins un élément à traiter (17.6). */
export function detect(c: AlertCounts, cashHours: number): DetectedAlert[] {
  const rules: Array<[number, Omit<DetectedAlert, 'detail'>]> = [
    [c.emailsFailed, { key: 'emails-failed', level: 'critical', title: 'E-mails non délivrés', to: '/admin/emails' }],
    [
      c.paymentsToVerify,
      { key: 'payments', level: 'critical', title: 'Paiements Mobile Money à vérifier', to: '/admin/paiements' },
    ],
    [c.outOfStock, { key: 'out', level: 'critical', title: 'Variantes en rupture de stock', to: '/admin/stock' }],
    [
      c.lateSupport,
      { key: 'late-support', level: 'critical', title: 'Demandes d’assistance en retard', to: '/admin/assistance' },
    ],
    [
      c.privacyOverdue,
      {
        key: 'privacy-late',
        level: 'critical',
        title: 'Demandes sur les données personnelles en retard',
        to: '/admin/donnees-personnelles',
      },
    ],
    [c.lowStock, { key: 'low', level: 'warning', title: 'Variantes en stock faible', to: '/admin/stock' }],
    [
      c.cancellationsPending,
      { key: 'cancel', level: 'warning', title: 'Demandes d’annulation à décider', to: '/admin/retours' },
    ],
    [
      c.returnsPending,
      { key: 'returns', level: 'warning', title: 'Demandes de retour à décider', to: '/admin/retours' },
    ],
    [
      c.cashWaiting,
      {
        key: 'waiting',
        level: 'warning',
        title: `Commandes en espèces en attente depuis plus de ${cashHours} h`,
        to: '/admin/commandes',
      },
    ],
    [
      c.listingsToModerate,
      { key: 'listings', level: 'warning', title: 'Annonces en modération', to: '/admin/place-de-marche' },
    ],
  ];
  return rules.filter(([count]) => count > 0).map(([count, alert]) => ({ ...alert, detail: `${count} à traiter` }));
}

export const toAlertDto = (a: AlertRecord) => ({
  ...a,
  firstSeenAt: a.firstSeenAt.toISOString(),
  lastSeenAt: a.lastSeenAt.toISOString(),
  lastReminderAt: a.lastReminderAt?.toISOString() ?? null,
});

export interface StaffAlertsDependencies {
  alerts: StaffAlertsRepository;
  information: Pick<InformationRepository, 'get'>;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Alertes de l'équipe (17.6) : détection planifiée, regroupement par situation, notification push des alertes
 * critiques et relance après le délai d'escalade. Lecture et suivi : pilotage:consulter (tous les rôles).
 */
export const createStaffAlertsService = (deps: StaffAlertsDependencies) => {
  const { alerts, information, notifier, appUrl, now } = deps;

  function require(actor: Grantee) {
    if (!can(actor, 'pilotage:consulter')) throw new ForbiddenError();
  }

  const push = (a: Pick<AlertRecord, 'title' | 'detail' | 'to' | 'key'>, prefix = '') =>
    notifier.notifyStaff(
      'pilotage:consulter',
      { title: `${prefix}${a.title}`, body: a.detail, url: `${appUrl}${a.to}`, tag: `alert-${a.key}` },
      true,
    );

  return {
    /** Traitement planifié : détecte, met à jour les dossiers, prévient l'équipe des alertes critiques. */
    async runDetection() {
      const at = now();
      const info = await information.get();
      const counts = await alerts.counts({
        now: at,
        supportSla: { high: info.supportSlaHigh, normal: info.supportSlaNormal },
        cashPreparationHours: info.cashPreparationAlertHours,
      });
      const existing = await alerts.list();
      const { create, update } = syncAlerts(existing, detect(counts, info.cashPreparationAlertHours), at);
      for (const a of create) {
        await alerts.create(a);
        if (a.level === 'critical') await push(a);
      }
      for (const u of update) await alerts.update(u.id, u.changes);
      // Relance des alertes critiques restées sans prise en charge (17.6)
      const reminded: string[] = [];
      for (const a of await alerts.list())
        if (needsEscalation(a, at, info.alertEscalationHours)) {
          await push(a, 'Relance : ');
          await alerts.update(a.id, {
            lastReminderAt: at,
            history: [...a.history, { at: at.toISOString(), by: 'Système', event: 'Relance envoyée à l’équipe' }],
          });
          reminded.push(a.key);
        }
      return { created: create.length, updated: update.length, reminded: reminded.length };
    },

    async list(actor: Grantee) {
      require(actor);
      return (await alerts.list()).map(toAlertDto);
    },

    /** Prise en charge, attribution, résolution ou clôture motivée ; l'auteur est inscrit à l'historique. */
    async update(id: string, input: UpdateAlertInput, actor: Grantee & { id: string }) {
      require(actor);
      const by = (await alerts.staffName(actor.id)) ?? 'Équipe';
      const alert = await alerts.find(id);
      if (!alert) throw new NotFoundError('Alerte introuvable.');
      const at = now().toISOString();
      const events: string[] = [];
      if (input.assigneeId !== undefined) {
        if (input.assigneeId && !(await alerts.staffExists(input.assigneeId)))
          throw new UnprocessableError('Ce membre n’existe pas ou n’est pas actif.');
        events.push(input.assigneeId ? 'Attribuée' : 'Attribution retirée');
      }
      if (input.state) {
        if (!isOpen(alert)) throw new ConflictError('Cette alerte est déjà traitée.');
        if (input.state === 'resolved' || input.state === 'closed') {
          const error = closureError(alert.level, input.closureReason, input.actionTaken);
          if (error) throw new UnprocessableError(error);
          events.push(
            input.state === 'resolved' ? `Résolue : ${input.closureReason}` : `Clôturée : ${input.closureReason}`,
          );
        } else events.push('Prise en charge');
      }
      const episodes =
        input.state === 'resolved' || input.state === 'closed'
          ? alert.episodes.map((e, i) => (i === alert.episodes.length - 1 ? { ...e, resolvedAt: at } : e))
          : alert.episodes;
      const updated = await alerts.update(id, {
        ...(input.state ? { state: input.state } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.closureReason ? { closureReason: input.closureReason } : {}),
        ...(input.actionTaken ? { actionTaken: input.actionTaken } : {}),
        episodes,
        history: [...alert.history, ...events.map((event) => ({ at, by, event }))],
      });
      if (!updated) throw new NotFoundError('Alerte introuvable.');
      return toAlertDto(updated);
    },
  };
};

export type StaffAlertsService = ReturnType<typeof createStaffAlertsService>;
