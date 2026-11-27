import { randomUUID } from 'node:crypto';
import type { CustomerRecord, CustomersRepository, NewCustomer } from '../src/features/auth/auth.repository.js';
import type {
  LoginAttempt,
  SessionOwner,
  SessionRecord,
  SessionsRepository,
} from '../src/features/sessions/sessions.repository.js';
import type { StaffRecord, StaffRepository } from '../src/features/staff-auth/staff-auth.repository.js';

/** Dépôts en mémoire pour les tests unitaires : mêmes contrats que Prisma, même atomicité des usages uniques. */

export function createMemorySessions(now: () => Date) {
  const sessions: Array<SessionRecord & { tokenHash: string }> = [];
  const logins: Array<LoginAttempt & { createdAt: Date }> = [];
  const matches = (s: SessionRecord, owner: SessionOwner) =>
    'customerId' in owner ? s.customerId === owner.customerId : s.staffId === owner.staffId;

  const repository: SessionsRepository = {
    async create(data) {
      const record = {
        id: randomUUID(),
        familyId: data.familyId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        customerId: 'customerId' in data ? data.customerId : null,
        staffId: 'staffId' in data ? data.staffId : null,
        usedAt: null,
        revokedAt: null,
      };
      sessions.push(record);
      return record;
    },
    findByTokenHash: async (tokenHash) => sessions.find((s) => s.tokenHash === tokenHash) ?? null,
    async markUsed(id, at) {
      const session = sessions.find((s) => s.id === id && !s.usedAt && !s.revokedAt);
      if (session) session.usedAt = at;
      return !!session;
    },
    async revokeFamily(familyId, at) {
      for (const s of sessions) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = at;
    },
    async revokeAllFor(owner, at) {
      for (const s of sessions) if (matches(s, owner) && !s.revokedAt) s.revokedAt = at;
    },
    async revokeOthersFor(owner, keepFamilyId, at) {
      for (const s of sessions) if (matches(s, owner) && !s.revokedAt && s.familyId !== keepFamilyId) s.revokedAt = at;
    },
    async recordLogin(data) {
      logins.push({ ...data, createdAt: now() });
    },
    countRecentFailures: async (subjectType, subjectId, since) =>
      logins.filter(
        (l) => l.subjectType === subjectType && l.subjectId === subjectId && !l.success && l.createdAt >= since,
      ).length,
  };
  return { repository, sessions, logins };
}

export function createMemoryCustomers() {
  const customers: Array<CustomerRecord & { phoneKey: string | null; lastLoginAt: Date | null }> = [];
  const byId = (id: string) => {
    const customer = customers.find((c) => c.id === id);
    if (!customer) throw new Error(`Client inconnu : ${id}`);
    return customer;
  };
  const repository: CustomersRepository = {
    findByEmail: async (email) => customers.find((c) => c.email === email) ?? null,
    findByPhoneKey: async (key) => customers.find((c) => c.phoneKey === key) ?? null,
    findById: async (id) => customers.find((c) => c.id === id) ?? null,
    async create(data: NewCustomer) {
      const record = {
        ...data,
        id: randomUUID(),
        status: 'active' as const,
        lastLoginAt: null,
        birthDate: null,
        birthdayChoice: 'points' as const,
        createdAt: new Date(),
      };
      customers.push(record);
      return record;
    },
    touchLogin: async (id, at) => Object.assign(byId(id), { lastLoginAt: at }),
    phoneTaken: async (key, exceptId) => customers.some((c) => c.phoneKey === key && c.id !== exceptId),
    async updateContact(id, change) {
      const taken =
        'email' in change
          ? customers.some((c) => c.email === change.email && c.id !== id)
          : customers.some((c) => c.phoneKey === change.phoneKey && c.id !== id);
      return taken ? null : Object.assign(byId(id), change);
    },
    findReferrer: async (code) => {
      const found = customers.find((c) => c.referralCode === code && c.status === 'active');
      return found ? { id: found.id } : null;
    },
  };
  return { repository, customers };
}

export function createMemoryStaff() {
  const members: Array<StaffRecord & { inviteTokenHash: string | null }> = [];
  const byId = (id: string) => {
    const member = members.find((m) => m.id === id);
    if (!member) throw new Error(`Membre inconnu : ${id}`);
    return member;
  };
  const repository: StaffRepository = {
    findByEmail: async (email) => members.find((m) => m.email === email) ?? null,
    findById: async (id) => members.find((m) => m.id === id) ?? null,
    findByInviteTokenHash: async (hash) => members.find((m) => m.inviteTokenHash === hash) ?? null,
    touchLogin: async () => undefined,
    async acceptInvitation(id, passwordHash) {
      Object.assign(byId(id), { passwordHash, status: 'active', inviteTokenHash: null, inviteExpiresAt: null });
    },
  };
  const add = (member: Partial<StaffRecord> & Pick<StaffRecord, 'email'> & { inviteTokenHash?: string | null }) => {
    const record = {
      id: randomUUID(),
      firstName: 'Awa',
      lastName: 'Ndong',
      passwordHash: null,
      role: 'super_admin' as const,
      status: 'active' as const,
      sessionsRevokedAt: null,
      refundLimit: null,
      inviteExpiresAt: null,
      inviteTokenHash: null,
      ...member,
    };
    members.push(record);
    return record;
  };
  return { repository, members, add };
}
