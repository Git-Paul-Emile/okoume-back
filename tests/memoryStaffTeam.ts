import { randomUUID } from 'node:crypto';
import type {
  CustomRoleRecord,
  StaffTeamRepository,
  TeamMemberRecord,
} from '../src/features/staff-team/staff-team.repository.js';

type StoredMember = TeamMemberRecord & { inviteTokenHash: string | null; sessionsRevokedAt: Date | null };

/** Équipe en mémoire : adresse unique, nom de rôle unique, invitation renouvelable tant qu'elle est en attente. */
export function createMemoryStaffTeam(now: () => Date) {
  const members: StoredMember[] = [];
  const roles: CustomRoleRecord[] = [];
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
    countActiveOwners: async () => members.filter((m) => m.role === 'super_admin' && m.status === 'active').length,
    customRoles: async () => structuredClone(roles),
    customRolesExist: async (ids) => ids.every((id) => roles.some((r) => r.id === id)),
    async saveCustomRole(role, at) {
      if (roles.some((r) => r.name === role.name && r.id !== role.id)) return null;
      const existing = role.id ? roles.find((r) => r.id === role.id) : undefined;
      const saved = existing
        ? Object.assign(existing, { name: role.name, permissions: role.permissions })
        : { id: randomUUID(), name: role.name, permissions: role.permissions };
      if (!existing) roles.push(saved);
      for (const m of members.filter((x) => x.customRoleIds.includes(saved.id))) m.sessionsRevokedAt = at;
      return structuredClone(saved);
    },
  };
  return { repository, members, roles };
}
