import { z } from 'zod';
import { categoryId } from './categories.seeder.js';
import { productId } from './products.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    code: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['percent', 'fixed']),
    value: z.number().int().min(0),
    minAmount: z.number().int().min(0),
    productIds: z.array(z.string()),
    categoryIds: z.array(z.string()),
    freeDelivery: z.boolean(),
    startsAt: isoDate,
    endsAt: isoDate,
    maxUses: z.number().int().positive().nullable(),
    uses: z.number().int().min(0),
    active: z.boolean(),
  }),
);

/** Contenu validé de data/promo-codes.json */
export const loadPromoCodes = () => readData('promo-codes.json', schema);

/** Codes promo de la boutique, livraison offerte comprise (valeur 0 avec livraison offerte). */
export const promoCodesSeeder: Seeder = {
  name: 'promo-codes',
  demo: true,
  async run({ prisma }) {
    const codes = loadPromoCodes();
    const id = (legacyId: string) => legacyUuid('promo-code', legacyId);
    const { count } = await prisma.promoCode.createMany({
      data: codes.map((c) => ({
        id: id(c.id),
        code: c.code.toUpperCase(),
        label: c.label,
        type: c.type,
        value: c.value,
        minAmount: c.minAmount,
        freeDelivery: c.freeDelivery,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        maxUses: c.maxUses,
        uses: c.uses,
        active: c.active,
      })),
      skipDuplicates: true,
    });
    await prisma.promoCodeProduct.createMany({
      data: codes.flatMap((c) => c.productIds.map((p) => ({ promoCodeId: id(c.id), productId: productId(p) }))),
      skipDuplicates: true,
    });
    await prisma.promoCodeCategory.createMany({
      data: codes.flatMap((c) =>
        c.categoryIds.map((category) => ({ promoCodeId: id(c.id), categoryId: categoryId(category) })),
      ),
      skipDuplicates: true,
    });
    return count;
  },
};
