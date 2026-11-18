import { prisma } from '../../lib/prisma.js';

export interface DeliveryZoneRecord {
  id: string;
  name: string;
  city: string;
  fee: number;
  eta: string;
  days: string;
  available: boolean;
}

/** Contrat de lecture des zones de livraison. */
export interface DeliveryZonesRepository {
  findAvailable(): Promise<DeliveryZoneRecord[]>;
  findById(id: string): Promise<DeliveryZoneRecord | null>;
}

const select = { id: true, name: true, city: true, fee: true, eta: true, days: true, available: true } as const;

const toRecord = ({ fee, ...zone }: { fee: { toNumber(): number } } & Omit<DeliveryZoneRecord, 'fee'>) => ({
  ...zone,
  fee: fee.toNumber(),
});

export const deliveryZonesRepository: DeliveryZonesRepository = {
  async findAvailable() {
    const rows = await prisma.deliveryZone.findMany({
      where: { available: true },
      orderBy: [{ city: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      select,
    });
    return rows.map(toRecord);
  },

  async findById(id) {
    const row = await prisma.deliveryZone.findUnique({ where: { id }, select });
    return row ? toRecord(row) : null;
  },
};
