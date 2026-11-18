import { describe, expect, it } from 'vitest';
import { buildShopServices } from '../../../tests/factories.js';
import { ForbiddenError } from '../../core/errors/AppError.js';
import { journalQuery } from './staff-stock.schemas.js';

const stockManager = { id: 's1', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const ordersManager = { id: 's2', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };

function setup() {
  const shop = buildShopServices();
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 5 },
  ]);
  return { shop, product, variant: product.variants[0]! };
}

describe('journal général du stock', () => {
  it('liste les mouvements de toutes les variantes, les plus récents d’abord, avec leur produit', async () => {
    const { shop, product, variant } = setup();
    await shop.staffStock.move(
      variant.id,
      { type: 'reception', quantity: 3, reason: 'Livraison fournisseur' },
      stockManager,
    );
    await shop.staffStock.move(
      variant.id,
      { type: 'ajustement', counted: 7, reason: 'Inventaire du mois' },
      stockManager,
    );

    const page = await shop.staffStock.journal(journalQuery.parse({}), stockManager);
    expect(page.total).toBe(2);
    expect(page.items.map((m) => m.reason)).toEqual(['Inventaire du mois', 'Livraison fournisseur']);
    expect(page.items[0]).toMatchObject({
      productId: product.id,
      productName: 'Pagne',
      before: 8,
      after: 7,
      delta: -1,
    });

    const receptions = await shop.staffStock.journal(journalQuery.parse({ type: 'reception' }), stockManager);
    expect(receptions.items.map((m) => m.delta)).toEqual([3]);
  });

  it('est refusé à un rôle sans droit sur le stock', async () => {
    const { shop } = setup();
    await expect(shop.staffStock.journal(journalQuery.parse({}), ordersManager)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
