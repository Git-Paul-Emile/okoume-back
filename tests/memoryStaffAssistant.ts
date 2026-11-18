import { randomUUID } from 'node:crypto';
import type {
  ActionRecord,
  DecisionRecord,
  QuestionRecord,
  RulesVersionRecord,
  StaffAssistantRepository,
} from '../src/features/staff-assistant/staff-assistant.repository.js';

/** Mémoire de l'assistant en mémoire : numéro de version unique, une action ne s'annule qu'une fois. */
export function createMemoryStaffAssistant(
  now: () => Date,
  staff: () => Array<{ id: string; firstName: string; lastName: string }>,
) {
  const decisions: DecisionRecord[] = [];
  const actions: ActionRecord[] = [];
  const versions: RulesVersionRecord[] = [];
  const questions: QuestionRecord[] = [];
  const newest = <T extends { createdAt: Date }>(list: T[]) =>
    [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((x) => structuredClone(x));

  const repository: StaffAssistantRepository = {
    decisions: async () => newest(decisions),
    async addDecision(d) {
      const created = { ...d, id: randomUUID(), createdAt: now() };
      decisions.push(created);
      return structuredClone(created);
    },
    actions: async () =>
      [...actions].sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime()).map((a) => structuredClone(a)),
    async addAction(a) {
      const created = {
        ...structuredClone(a),
        id: randomUUID(),
        appliedAt: now(),
        revertedAt: null,
        revertedByName: null,
      };
      actions.push(created);
      return structuredClone(created);
    },
    async revertAction(id, staffName, at) {
      const a = actions.find((x) => x.id === id && !x.revertedAt);
      if (!a) return null;
      Object.assign(a, { revertedAt: at, revertedByName: staffName });
      return structuredClone(a);
    },
    rulesVersions: async () => [...versions].sort((a, b) => b.version - a.version).map((v) => structuredClone(v)),
    async addRulesVersion(v) {
      if (versions.some((x) => x.version === v.version)) return null;
      const created = { ...structuredClone(v), id: randomUUID(), createdAt: now() };
      versions.push(created);
      return structuredClone(created);
    },
    questions: async () => newest(questions),
    async addQuestion(q) {
      const created = { ...q, id: randomUUID(), createdAt: now() };
      questions.push(created);
      return structuredClone(created);
    },
    staffName: async (id) => {
      const s = staff().find((x) => x.id === id);
      return s ? `${s.firstName} ${s.lastName}` : null;
    },
  };
  return { repository, decisions, actions, versions, questions };
}
