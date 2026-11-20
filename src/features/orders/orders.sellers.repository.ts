import { prisma } from '../../lib/prisma.js';

/** Ce qu'une commande doit savoir de la boutique d'un vendeur (cahier des charges 1.2, 32.4 et 32.5). */
export interface SellerTerms {
  shopId: string;
  name: string;
  ownerId: string;
  /** Qui livre les commandes de la boutique */
  deliveryMode: 'okoume' | 'seller';
  /** Frais du vendeur pour le quartier demandé, s'il livre lui-même ; null s'il ne livre pas ce quartier */
  zoneFee: number | null;
}

export interface SellerTermsRepository {
  /** Conditions des boutiques demandées pour un quartier ; une boutique inconnue est absente du résultat. */
  forZone(shopIds: string[], zoneId: string): Promise<Map<string, SellerTerms>>;
}

export const sellerTermsRepository: SellerTermsRepository = {
  async forZone(shopIds, zoneId) {
    if (!shopIds.length) return new Map();
    const rows = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: {
        id: true,
        name: true,
        ownerId: true,
        deliveryMode: true,
        zoneFees: { where: { zoneId, available: true }, select: { fee: true } },
      },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          shopId: r.id,
          name: r.name,
          ownerId: r.ownerId,
          deliveryMode: r.deliveryMode,
          zoneFee: r.zoneFees[0]?.fee.toNumber() ?? null,
        },
      ]),
    );
  },
};
