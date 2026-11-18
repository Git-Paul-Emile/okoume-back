import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export interface StaffZoneRecord {
  id: string;
  name: string;
  city: string;
  fee: number;
  eta: string;
  days: string;
  available: boolean;
  /** Coût habituel d'une course pour la boutique : donnée interne, jamais montrée au client */
  courierCost: number | null;
  position: number;
}

export type ZoneFields = Omit<StaffZoneRecord, 'id'>;

/** Contrat des zones côté équipe. Une zone n'est jamais supprimée : les commandes la référencent, on la ferme. */
export interface StaffZonesRepository {
  findAll(): Promise<StaffZoneRecord[]>;
  /** null : une zone du même nom existe déjà dans cette ville. */
  create(fields: ZoneFields): Promise<StaffZoneRecord | null>;
  /** undefined : zone introuvable ; null : nom déjà pris dans la ville. */
  update(id: string, fields: Partial<ZoneFields>): Promise<StaffZoneRecord | null | undefined>;
}

const select = {
  id: true,
  name: true,
  city: true,
  fee: true,
  eta: true,
  days: true,
  available: true,
  courierCost: true,
  position: true,
} as const;

type ZoneRow = Prisma.DeliveryZoneGetPayload<{ select: typeof select }>;

const toRecord = ({ fee, courierCost, ...zone }: ZoneRow): StaffZoneRecord => ({
  ...zone,
  fee: fee.toNumber(),
  courierCost: courierCost?.toNumber() ?? null,
});

const isError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

export const staffZonesRepository: StaffZonesRepository = {
  async findAll() {
    const rows = await prisma.deliveryZone.findMany({
      orderBy: [{ city: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      select,
    });
    return rows.map(toRecord);
  },

  async create(fields) {
    try {
      return toRecord(await prisma.deliveryZone.create({ data: fields, select }));
    } catch (error) {
      if (isError(error, 'P2002')) return null;
      throw error;
    }
  },

  async update(id, fields) {
    try {
      return toRecord(await prisma.deliveryZone.update({ where: { id }, data: fields, select }));
    } catch (error) {
      if (isError(error, 'P2002')) return null;
      // P2025 : aucune ligne à modifier
      if (isError(error, 'P2025')) return undefined;
      throw error;
    }
  },
};
