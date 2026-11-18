import { ConflictError, ForbiddenError } from '../../core/errors/AppError.js';
import { can, isOwner, type Grantee } from '../../core/security/permissions.js';
import type {
  ActionRecord,
  DecisionRecord,
  QuestionRecord,
  RulesVersionRecord,
  StaffAssistantRepository,
} from './staff-assistant.repository.js';
import type { ActionInput, DecisionInput, QuestionInput, RulesInput } from './staff-assistant.schemas.js';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Numéros gabonais : indicatif facultatif, puis 0X XX XX XX ; un montant (suivi d'autres chiffres) n'est pas concerné
const PHONE = /(?<!\d)(?:\+241[\s.-]?)?0?[1-7]\d?(?:[\s.-]?\d{2}){3}(?!\s?\d)/g;

/** Coordonnées masquées avant l'enregistrement : le journal de l'assistant n'en garde aucune (19.4). */
export const maskSensitive = (text: string) =>
  text.replace(EMAIL, '[e-mail masqué]').replace(PHONE, '[téléphone masqué]');

const iso = (d: Date | null) => d?.toISOString() ?? null;
const toDecisionDto = (d: DecisionRecord) => ({ ...d, until: iso(d.until), createdAt: d.createdAt.toISOString() });
const toActionDto = (a: ActionRecord) => ({
  ...a,
  appliedAt: a.appliedAt.toISOString(),
  revertedAt: iso(a.revertedAt),
});
const toVersionDto = (v: RulesVersionRecord) => ({ ...v, createdAt: v.createdAt.toISOString() });
const toQuestionDto = (q: QuestionRecord) => ({ ...q, createdAt: q.createdAt.toISOString() });

const VERSION_ATTEMPTS = 3;

/**
 * Mémoire de l'assistant d'administration (17) : décisions sur ses propositions, propositions appliquées avec leur
 * état d'origine, versions de ses règles, questions posées. L'analyse elle-même tourne dans l'interface sur les
 * données de l'API ; les modifications de produits passent par les routes du catalogue, avec leurs droits.
 * Lecture pilotage:consulter ; décisions et actions catalogue:modifier ; règles administrateur principal.
 */
export const createStaffAssistantService = (deps: { assistant: StaffAssistantRepository; now: () => Date }) => {
  const { assistant, now } = deps;

  function allow(allowed: boolean) {
    if (!allowed) throw new ForbiddenError();
  }
  const nameOf = async (actor: { id: string }) => (await assistant.staffName(actor.id)) ?? 'Équipe';

  return {
    async overview(actor: Grantee) {
      allow(can(actor, 'pilotage:consulter'));
      const [decisions, actions, rules] = await Promise.all([
        assistant.decisions(),
        assistant.actions(),
        assistant.rulesVersions(),
      ]);
      return {
        decisions: decisions.map(toDecisionDto),
        actions: actions.map(toActionDto),
        rules: rules.map(toVersionDto),
      };
    },

    async decide(input: DecisionInput, actor: Grantee & { id: string }) {
      allow(can(actor, 'catalogue:modifier'));
      return toDecisionDto(
        await assistant.addDecision({
          proposalId: input.proposalId,
          decision: input.decision,
          reason: input.reason ?? null,
          until: input.until ?? null,
          staffName: await nameOf(actor),
        }),
      );
    },

    /** Trace d'une proposition appliquée : chaque produit a déjà été modifié par la route du catalogue. */
    async recordAction(input: ActionInput, actor: Grantee & { id: string }) {
      allow(can(actor, 'catalogue:modifier'));
      return toActionDto(await assistant.addAction({ ...input, appliedByName: await nameOf(actor) }));
    },

    async revertAction(id: string, actor: Grantee & { id: string }) {
      allow(can(actor, 'catalogue:modifier'));
      const reverted = await assistant.revertAction(id, await nameOf(actor), now());
      if (!reverted) throw new ConflictError('Cette action est introuvable ou déjà annulée.');
      return toActionDto(reverted);
    },

    /** Nouvelle version des règles : une restauration en crée une aussi, l'historique n'est jamais réécrit. */
    async saveRules(input: RulesInput, actor: Grantee & { id: string }) {
      allow(isOwner(actor));
      const staffName = await nameOf(actor);
      for (let attempt = 0; attempt < VERSION_ATTEMPTS; attempt++) {
        const latest = (await assistant.rulesVersions())[0]?.version ?? 0;
        const saved = await assistant.addRulesVersion({ ...input, version: latest + 1, staffName });
        if (saved) return toVersionDto(saved);
      }
      throw new ConflictError('Les règles viennent d’être modifiées : rechargez la page.');
    },

    async questions(actor: Grantee) {
      allow(isOwner(actor));
      return (await assistant.questions()).map(toQuestionDto);
    },

    async logQuestion(input: QuestionInput, actor: Grantee & { id: string }) {
      allow(can(actor, 'pilotage:consulter'));
      return toQuestionDto(
        await assistant.addQuestion({
          question: maskSensitive(input.question),
          answer: maskSensitive(input.answer),
          source: input.source,
          staffName: await nameOf(actor),
        }),
      );
    },
  };
};

export type StaffAssistantService = ReturnType<typeof createStaffAssistantService>;
