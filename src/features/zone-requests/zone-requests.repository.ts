import { prisma } from '../../lib/prisma.js';

export interface ZoneRequestRecord {
  id: string;
  neighbourhood: string;
  city: string;
  contact: string;
  status: 'new' | 'added' | 'declined';
  note: string | null;
  createdAt: Date;
}

/** Contrat de stockage des demandes de nouveau quartier. */
export interface ZoneRequestsRepository {
  create(request: { neighbourhood: string; city: string; contact: string }): Promise<ZoneRequestRecord>;
  list(): Promise<ZoneRequestRecord[]>;
  /** Seule une demande encore nouvelle reçoit une suite ; null sinon. */
  decide(id: string, decision: { status: 'added' | 'declined'; note: string }): Promise<ZoneRequestRecord | null>;
}

const select = {
  id: true,
  neighbourhood: true,
  city: true,
  contact: true,
  status: true,
  note: true,
  createdAt: true,
} as const;

export const zoneRequestsRepository: ZoneRequestsRepository = {
  create: (request) => prisma.zoneRequest.create({ data: request, select }),

  // Liste courte par nature (quelques demandes par mois) : bornée par prudence
  list: () => prisma.zoneRequest.findMany({ select, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 500 }),

  async decide(id, decision) {
    const result = await prisma.zoneRequest.updateMany({ where: { id, status: 'new' }, data: decision });
    return result.count ? prisma.zoneRequest.findUnique({ where: { id }, select }) : null;
  },
};
