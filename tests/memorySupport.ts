import { randomUUID } from 'node:crypto';
import type { SupportRepository, TicketRecord } from '../src/features/support/support.repository.js';

/** Assistance en mémoire : mêmes règles que la base (numéro unique, file triée par priorité puis ancienneté). */
export function createMemorySupport(
  now: () => Date,
  staff: () => Array<{ id: string; firstName: string; lastName: string }>,
) {
  const tickets: TicketRecord[] = [];
  const copy = (t: TicketRecord): TicketRecord => structuredClone(t);
  const find = (id: string) => tickets.find((t) => t.id === id);

  const repository: SupportRepository = {
    async create({ message, ...ticket }) {
      if (tickets.some((t) => t.number === ticket.number)) return null;
      const at = now();
      const created: TicketRecord = {
        ...ticket,
        id: randomUUID(),
        status: 'open',
        satisfaction: null,
        assigneeId: null,
        closureReason: null,
        resolvedAt: null,
        reopenedAt: null,
        createdAt: at,
        messages: [{ id: randomUUID(), author: 'customer', staffName: null, ...message, createdAt: at }],
      };
      tickets.push(created);
      return copy(created);
    },
    findByNumber: async (number) => {
      const t = tickets.find((x) => x.number === number);
      return t ? copy(t) : null;
    },
    findById: async (id) => {
      const t = find(id);
      return t ? copy(t) : null;
    },
    async listForCustomer(customerId, { page, limit }) {
      const mine = tickets
        .filter((t) => t.customerId === customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: mine.slice((page - 1) * limit, page * limit).map(copy), total: mine.length };
    },
    async listForStaff({ status, priority, assigneeId, search, page, limit }) {
      const matching = tickets
        .filter(
          (t) =>
            (!status || t.status === status) &&
            (!priority || t.priority === priority) &&
            (!assigneeId || t.assigneeId === assigneeId) &&
            (!search ||
              [t.number, t.subject, t.email, t.orderNumber ?? ''].some((v) =>
                v.toLowerCase().includes(search.toLowerCase()),
              )),
        )
        .sort(
          (a, b) =>
            Number(b.priority === 'high') - Number(a.priority === 'high') ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        );
      return { items: matching.slice((page - 1) * limit, page * limit).map(copy), total: matching.length };
    },
    async addMessage(ticketId, { staffId, ...message }, changes) {
      const t = find(ticketId);
      if (!t) return null;
      const member = staffId ? staff().find((m) => m.id === staffId) : undefined;
      t.messages.push({
        id: randomUUID(),
        ...message,
        staffName: member ? `${member.firstName} ${member.lastName}` : null,
        createdAt: now(),
      });
      Object.assign(t, changes);
      return copy(t);
    },
    async update(ticketId, changes) {
      const t = find(ticketId);
      if (!t) return null;
      Object.assign(t, changes);
      return copy(t);
    },
    staffExists: async (staffId) => staff().some((m) => m.id === staffId),
  };
  return { repository, tickets };
}
