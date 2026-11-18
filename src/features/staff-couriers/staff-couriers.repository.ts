import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type CourierVehicle = 'moto' | 'voiture' | 'velo' | 'a_pied';

export interface CourierRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  vehicle: CourierVehicle;
  active: boolean;
  notes: string;
  zoneIds: string[];
}

export type CourierFields = Omit<CourierRecord, 'id'>;

/** Contrat du répertoire des livreurs (9.3). */
export interface CouriersRepository {
  list(filters: { zoneId?: string | undefined; active?: boolean | undefined }): Promise<CourierRecord[]>;
  findById(id: string): Promise<CourierRecord | null>;
  create(fields: CourierFields): Promise<CourierRecord>;
  /** null : livreur introuvable. */
  update(id: string, fields: Partial<CourierFields>): Promise<CourierRecord | null>;
}

const include = { zones: { select: { zoneId: true } } } as const satisfies Prisma.CourierInclude;
type Row = Prisma.CourierGetPayload<{ include: typeof include }>;

const toRecord = ({ zones, createdAt: _c, updatedAt: _u, ...courier }: Row): CourierRecord => ({
  ...courier,
  zoneIds: zones.map((z) => z.zoneId),
});

export const couriersRepository: CouriersRepository = {
  async list({ zoneId, active }) {
    const rows = await prisma.courier.findMany({
      where: { ...(active !== undefined ? { active } : {}), ...(zoneId ? { zones: { some: { zoneId } } } : {}) },
      include,
      orderBy: [{ active: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    });
    return rows.map(toRecord);
  },

  async findById(id) {
    const row = await prisma.courier.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async create({ zoneIds, ...fields }) {
    const row = await prisma.courier.create({
      data: { ...fields, zones: { create: zoneIds.map((zoneId) => ({ zoneId })) } },
      include,
    });
    return toRecord(row);
  },

  /** Les zones couvertes sont remplacées en entier quand elles sont envoyées. */
  async update(id, { zoneIds, ...fields }) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        if (zoneIds) {
          await tx.courierZone.deleteMany({ where: { courierId: id } });
          await tx.courierZone.createMany({ data: zoneIds.map((zoneId) => ({ courierId: id, zoneId })) });
        }
        return tx.courier.update({ where: { id }, data: fields, include });
      });
      return toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
      throw error;
    }
  },
};
