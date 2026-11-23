import { describe, expect, it } from 'vitest';
import { buildShopServices } from '../../../tests/factories.js';
import { slugify } from '../../core/text/slugify.js';
import { ForbiddenError } from '../../core/errors/AppError.js';
import { listStaffProductsQuery, priceChangesQuery } from './staff-catalog.schemas.js';
import type { CatalogActor } from './staff-catalog.service.js';
import { freeSlug, publicationBlocker } from './staff-catalog.service.js';
import type { CreateProductInput } from './staff-catalog.schemas.js';

const catalogManager: CatalogActor = { id: 's1', role: 'catalog_manager', extraRoles: [], customPermissions: [] };
const ordersManager: CatalogActor = { id: 's2', role: 'orders_manager', extraRoles: [], customPermissions: [] };
const noRights: CatalogActor = { id: 's3', role: 'stock_manager', extraRoles: [], customPermissions: [] };

function setup() {
  const shop = buildShopServices();
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const collection = shop.catalog.addCategory({ slug: 'traditionnel', name: 'Traditionnel', isCollection: true });
  const input = (overrides: Partial<CreateProductInput> = {}): CreateProductInput => ({
    name: 'Pagne wax Élégance',
    categoryId: category.id,
    brand: null,
    shortDescription: 'Pagne wax 100 % coton, motifs traditionnels',
    description: [],
    specs: [],
    usageTips: null,
    vatRate: 18,
    hsCode: null,
    featured: false,
    isNew: true,
    dealOfTheDay: false,
    tags: [],
    promotion: null,
    images: ['https://images.okoza.test/pagne.jpg'],
    optionName: 'Longueur',
    variants: [
      { label: '6 yards', price: 15_000, cost: 9_000, stock: 4, lowStockThreshold: 3, image: null, weightGrams: null },
      { label: '12 yards', price: 25_000, cost: null, stock: 0, lowStockThreshold: 3, image: null, weightGrams: null },
    ],
    publish: false,
    ...overrides,
  });
  return { ...shop, category, collection, input };
}

describe('règles du catalogue', () => {
  it('fabrique des adresses lisibles et uniques', () => {
    expect(slugify('Pagne wax Élégance')).toBe('pagne-wax-elegance');
    expect(freeSlug('pagne', ['pagne', 'pagne-2'])).toBe('pagne-3');
    expect(freeSlug('pagne', [])).toBe('pagne');
  });

  it('refuse la publication sans image, sans variante ou sans coût d’achat', () => {
    expect(publicationBlocker({ images: [], variants: [{ label: 'M', cost: 1 }] })).toMatch(/image/);
    expect(publicationBlocker({ images: ['x'], variants: [] })).toMatch(/variante/);
    expect(publicationBlocker({ images: ['x'], variants: [{ label: 'M', cost: null }] })).toMatch(/coût/);
    expect(publicationBlocker({ images: ['x'], variants: [{ label: 'M', cost: 1 }] })).toBeNull();
  });
});

describe('produits côté équipe', () => {
  it('refuse la liste à un rôle sans droit sur le catalogue, même sans passer par la route', async () => {
    const { staffCatalog } = setup();
    const query = listStaffProductsQuery.parse({});
    await expect(staffCatalog.list(query, ordersManager)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await staffCatalog.list(query, catalogManager)).total).toBe(0);
  });

  it('crée un brouillon avec référence, adresse et variantes attribuées par l’API', async () => {
    const { staffCatalog, input, products } = setup();
    const created = await staffCatalog.create(input(), catalogManager);
    expect(created).toMatchObject({ sku: 'GA-1000', slug: 'pagne-wax-elegance', status: 'draft' });
    expect(created.variants.map((v) => v.sku)).toEqual(['GA-1000-6-YARDS', 'GA-1000-12-YARDS']);
    expect(created.variants[0]).toMatchObject({ attributes: { Longueur: '6 yards' }, cost: 9_000, stock: 4 });

    const second = await staffCatalog.create(input(), catalogManager);
    expect(second).toMatchObject({ sku: 'GA-1001', slug: 'pagne-wax-elegance-2' });
    // Un brouillon n'apparaît pas dans le catalogue public
    expect((await products.list({ page: 1, limit: 20, inStock: false, onSale: false })).total).toBe(0);
  });

  it('exige le coût d’achat de chaque variante pour publier', async () => {
    const { staffCatalog, input, products } = setup();
    await expect(staffCatalog.create(input({ publish: true }), catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    const draft = await staffCatalog.create(input(), catalogManager);
    await expect(staffCatalog.setStatus(draft.id, 'published', catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    await staffCatalog.updateVariant(draft.id, draft.variants[1]!.id, { cost: 14_000 }, catalogManager);
    const published = await staffCatalog.setStatus(draft.id, 'published', catalogManager);
    expect(published.status).toBe('published');
    const publicView = await products.getBySlug(draft.slug);
    expect(publicView.variants[0]).not.toHaveProperty('cost');
  });

  it('contrôle coût et prix ensemble, et garde le coût d’un produit en vente', async () => {
    const { staffCatalog, input } = setup();
    const product = await staffCatalog.create(
      input({ variants: [{ ...input().variants[0]! }], optionName: null }),
      catalogManager,
    );
    const variantId = product.variants[0]!.id;
    await expect(
      staffCatalog.updateVariant(
        product.id,
        variantId,
        { price: 8_000, priceReason: 'Alignement concurrence' },
        catalogManager,
      ),
    ).rejects.toMatchObject({ status: 422, message: 'Le coût d’achat dépasse le prix de vente.' });
    await staffCatalog.setStatus(product.id, 'published', catalogManager);
    await expect(
      staffCatalog.updateVariant(product.id, variantId, { cost: null }, catalogManager),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('exige un motif pour changer un prix et l’historise avec l’ancien et le nouveau prix', async () => {
    const { staffCatalog, input } = setup();
    const product = await staffCatalog.create(
      input({ variants: [{ ...input().variants[0]! }], optionName: null }),
      catalogManager,
    );
    const variant = product.variants[0]!;
    await expect(
      staffCatalog.updateVariant(product.id, variant.id, { price: variant.price + 2_000 }, catalogManager),
    ).rejects.toMatchObject({ status: 422, message: 'Indiquez le motif du changement de prix.' });

    await staffCatalog.updateVariant(
      product.id,
      variant.id,
      { price: variant.price + 2_000, priceReason: 'Hausse du prix fournisseur' },
      catalogManager,
    );
    // Un champ modifié sans changer le prix n'ajoute rien à l'historique
    await staffCatalog.updateVariant(product.id, variant.id, { lowStockThreshold: 2 }, catalogManager);

    const history = await staffCatalog.priceChanges(priceChangesQuery.parse({ productId: product.id }), catalogManager);
    expect(history.items).toEqual([
      expect.objectContaining({
        before: variant.price,
        after: variant.price + 2_000,
        reason: 'Hausse du prix fournisseur',
      }),
    ]);
    await expect(staffCatalog.priceChanges(priceChangesQuery.parse({}), noRights)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('ajoute une variante avec l’option existante et refuse un doublon', async () => {
    const { staffCatalog, input } = setup();
    const product = await staffCatalog.create(input(), catalogManager);
    const added = await staffCatalog.addVariant(
      product.id,
      { label: '3 yards', price: 8_000, cost: 5_000, stock: 2, lowStockThreshold: 3, image: null, weightGrams: null },
      catalogManager,
    );
    expect(added.variants.at(-1)).toMatchObject({ sku: 'GA-1000-3-YARDS', attributes: { Longueur: '3 yards' } });
    await expect(
      staffCatalog.addVariant(
        product.id,
        { label: '6 YARDS', price: 8_000, cost: 5_000, stock: 0, lowStockThreshold: 3, image: null, weightGrams: null },
        catalogManager,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuse une collection comme catégorie et une action sans droit', async () => {
    const { staffCatalog, input, collection } = setup();
    await expect(staffCatalog.create(input({ categoryId: collection.id }), catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    await expect(staffCatalog.create(input(), ordersManager)).rejects.toMatchObject({ status: 403 });
  });
});

describe('catégories côté équipe', () => {
  it('crée une catégorie avec une adresse tirée du nom', async () => {
    const { staffCategories, category } = setup();
    const created = await staffCategories.create(
      {
        name: 'Pagnes de fête',
        fullName: null,
        parentId: category.id,
        icon: null,
        image: null,
        imageFit: 'contain',
        position: 0,
        isCollection: false,
        memberIds: [],
      },
      catalogManager,
    );
    expect(created).toMatchObject({ slug: 'pagnes-de-fete', parentId: category.id });
  });

  it('empêche une boucle dans l’arborescence', async () => {
    const { staffCategories, catalog, category } = setup();
    const child = catalog.addCategory({ slug: 'enfant', name: 'Enfant', parentId: category.id });
    await expect(staffCategories.update(category.id, { parentId: child.id }, catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    await expect(staffCategories.update(category.id, { parentId: category.id }, catalogManager)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('ne supprime qu’une catégorie vide', async () => {
    const { staffCategories, catalog, category } = setup();
    catalog.addProduct({ slug: 'p', name: 'P', categoryId: category.id }, [{ price: 1_000, stock: 1 }]);
    await expect(staffCategories.remove(category.id, catalogManager)).rejects.toMatchObject({ status: 409 });
    const empty = catalog.addCategory({ slug: 'vide', name: 'Vide' });
    await staffCategories.remove(empty.id, catalogManager);
    expect(catalog.categories.some((c) => c.id === empty.id)).toBe(false);
  });

  it('refuse qu’une collection regroupe une autre collection', async () => {
    const { staffCategories, collection } = setup();
    await expect(
      staffCategories.create(
        {
          name: 'Fêtes',
          fullName: null,
          parentId: null,
          icon: null,
          image: null,
          imageFit: 'contain',
          position: 0,
          isCollection: true,
          memberIds: [collection.id],
        },
        catalogManager,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('zones de livraison côté équipe', () => {
  it('crée et modifie une zone, sans doublon dans la même ville', async () => {
    const { staffZones, deliveryZones } = setup();
    const zone = await staffZones.create(
      {
        name: 'Akanda',
        city: 'Libreville',
        fee: 2_500,
        eta: '48 h',
        days: 'Lundi au samedi',
        available: true,
        courierCost: 1_500,
        position: 1,
      },
      ordersManager,
    );
    expect(zone).toMatchObject({ name: 'Akanda', courierCost: 1_500 });
    await expect(
      staffZones.create(
        {
          name: 'Akanda',
          city: 'Libreville',
          fee: 1,
          eta: '1 h',
          days: 'Tous',
          available: true,
          courierCost: null,
          position: 0,
        },
        ordersManager,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const closed = await staffZones.update(zone.id, { available: false }, ordersManager);
    expect(closed.available).toBe(false);
    expect((await deliveryZones.list()).some((z) => z.id === zone.id)).toBe(false);
  });

  it('réserve la gestion des zones aux personnes autorisées aux commandes', async () => {
    const { staffZones } = setup();
    await expect(
      staffZones.create(
        {
          name: 'Owendo',
          city: 'Owendo',
          fee: 3_000,
          eta: '48 h',
          days: 'Tous',
          available: true,
          courierCost: null,
          position: 0,
        },
        catalogManager,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
