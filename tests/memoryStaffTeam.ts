import { randomUUID } from 'node:crypto';
import type { StaffTeamRepository, TeamMemberRecord } from '../src/features/staff-team/staff-team.repository.js';

type StoredMember = TeamMemberRecord & { inviteTokenHash: string | null; sessionsRevokedAt: Date | null };

/** Équipe d'administrateurs en mémoire : adresse unique et invitation renouvelable. */
export function createMemoryStaffTeam(now: () => Date) {
  const members: StoredMember[] = [];
  const view = (m: StoredMember): TeamMemberRecord => {
    const { inviteTokenHash, sessionsRevokedAt, ...rest } = structuredClone(m);
    void inviteTokenHash;
    void sessionsRevokedAt;
    return rest;
  };

  const repository: StaffTeamRepository = {
    list: async () => members.map(view),
    find: async (id) => {
      const m = members.find((x) => x.id === id);
      return m ? view(m) : null;
    },
    async invite(member) {
      if (members.some((m) => m.email === member.email)) return null;
      const created: StoredMember = {
        ...member,
        id: randomUUID(),
        status: 'invited',
        lastLoginAt: null,
        backupCodesLeft: 0,
        createdAt: now(),
        sessionsRevokedAt: null,
      };
      members.push(created);
      return view(created);
    },
    async renewInvite(id, inviteTokenHash, inviteExpiresAt) {
      const m = members.find((x) => x.id === id && x.status === 'invited');
      if (!m) return null;
      Object.assign(m, { inviteTokenHash, inviteExpiresAt });
      return view(m);
    },
    async update(id, changes) {
      const m = members.find((x) => x.id === id);
      if (!m) return null;
      Object.assign(m, changes);
      return view(m);
    },
    async resetBackupCodes(id, at) {
      const m = members.find((x) => x.id === id);
      if (!m) return false;
      Object.assign(m, { backupCodesLeft: 0, sessionsRevokedAt: at });
      return true;
    },
    countActiveStaff: async () => members.filter((m) => m.status === 'active').length,
  };
  return { repository, members };
}
