import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const photo = (n: number) => `https://medias.test/produits/photo-${n}.webp`;

async function setup() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'robes', name: 'Robes' });
  const openShop = async (email: string, name: string) => {
    const seller = shop.shopsStore.addOwner({ email });
    await shop.shops.open(seller.id, {
      name,
      description: '',
      city: 'Libreville',
      district: 'Louis',
      position: null,
      phone: '077123456',
      acceptedPaymentMethods: ['cash'],
    });
    return seller;
  };
  const seller = await openShop('awa@example.ga', 'Pagnes d’Awa');
  const create = (overrides: Record<string, unknown> = {}) =>
    shop.sellerProducts.create(seller.id, {
      name: 'Robe en pagne wax',
      categoryId: category.id,
      brand: null,
      shortDescription: 'Robe longue en pagne wax, cousue main.',
      description: [],
      specs: [],
      usageTips: null,
      condition: 'new',
      images: [photo(1)],
      optionName: 'Taille',
      variants: [
        { label: 'M', price: 25_000, stock: 3, image: null },
        { label: 'L', price: 27_000, stock: 1, image: null },
      ],
      submit: true,
      ...overrides,
    });
  /** Exécute les vérifications déposées dans la file, comme le worker. */
  const runReviews = async () => {
    for (const job of shop.pushQueue.jobs.splice(0))
      if (job.name === 'products.review' && 'productId' in job.data)
        await shop.productReviews.review(job.data.productId, job.data.version);
  };
  return { ...shop, category, seller, openShop, create, runReviews };
}

describe('produits des vendeurs', () => {
  it('un produit soumis n’est en vente qu’après une vérification favorable', async () => {
    const { create, runReviews, products } = await setup();
    const created = await create();
    expect(created).toMatchObject({ status: 'draft', moderation: 'in_review', condition: 'new' });
    expect(created.sku).toMatch(/^VD-/);
    expect(created.variants).toHaveLength(2);
    expect(created.variants[0]).not.toHaveProperty('cost');
    await expect(products.getBySlug(created.slug)).rejects.toMatchObject({ status: 404 });

    await runReviews();
    const published = await products.getBySlug(created.slug);
    expect(published.name).toBe('Robe en pagne wax');
    expect(published.seller).toMatchObject({ name: expect.any(String) });
  });

  it('une demande de correction garde le produit hors de la vente, avec les points à corriger', async () => {
    const { create, runReviews, reviewer, sellerProducts, seller } = await setup();
    reviewer.answer({ outcome: 'changes_requested', issues: [{ field: 'photos', message: 'Photo floue.' }] });
    const created = await create();
    await runReviews();
    expect(await sellerProducts.get(seller.id, created.id)).toMatchObject({
      status: 'draft',
      moderation: 'changes_requested',
      moderationIssues: ['Photo floue.'],
    });
  });

  it('toute modification d’un produit en vente repasse la vérification', async () => {
    const { create, runReviews, sellerProducts, seller, products } = await setup();
    const created = await create();
    await runReviews();
    const variant = created.variants[0]!;
    const changed = await sellerProducts.updateVariant(seller.id, created.id, variant.id, { price: 20_000 });
    expect(changed).toMatchObject({ status: 'draft', moderation: 'in_review' });
    await expect(products.getBySlug(created.slug)).rejects.toMatchObject({ status: 404 });
    await runReviews();
    expect((await products.getBySlug(created.slug)).variants[0]!.price).toBe(20_000);
  });

  it('un vendeur ne voit ni ne modifie le produit d’une autre boutique', async () => {
    const { create, openShop, sellerProducts } = await setup();
    const created = await create();
    const other = await openShop('jean@example.ga', 'Chez Jean');
    await expect(sellerProducts.get(other.id, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(sellerProducts.update(other.id, created.id, { name: 'Volé' })).rejects.toMatchObject({ status: 404 });
    expect((await sellerProducts.list(other.id, { page: 1, limit: 20 })).items).toEqual([]);
  });

  it('un client sans boutique ne peut pas vendre', async () => {
    const { sellerProducts, shopsStore } = await setup();
    const visitor = shopsStore.addOwner({ email: 'paul@example.ga' });
    await expect(sellerProducts.list(visitor.id, { page: 1, limit: 20 })).rejects.toMatchObject({ status: 403 });
  });

  it('le stock compté par le vendeur ne descend jamais sous les quantités réservées', async () => {
    const { create, sellerProducts, seller, catalog } = await setup();
    const created = await create();
    const variant = created.variants[0]!;
    catalog.products.find((p) => p.id === created.id)!.variants[0]!.reserved = 2;
    await expect(
      sellerProducts.setStock(seller.id, created.id, variant.id, { counted: 1, reason: 'Inventaire du soir' }),
    ).rejects.toMatchObject({ status: 409 });
    const updated = await sellerProducts.setStock(seller.id, created.id, variant.id, {
      counted: 5,
      reason: 'Inventaire du soir',
    });
    expect(updated.variants[0]!.stock).toBe(5);
  });

  it('l’équipe publie un produit transmis par la vérification, ou le refuse définitivement', async () => {
    const { create, runReviews, reviewer, staffCatalog, sellerProducts, seller } = await setup();
    reviewer.answer({ outcome: 'moderation', issues: [] });
    const first = await create();
    const second = await create({ name: 'Robe en pagne wax bis' });
    await runReviews();
    expect(await staffCatalog.list({ page: 1, limit: 20, moderation: 'pending_moderation' }, owner)).toMatchObject({
      items: [expect.anything(), expect.anything()],
    });

    expect(
      await staffCatalog.moderate(first.id, { decision: 'approve', note: 'Photos conformes.', issues: [] }, owner),
    ).toMatchObject({ status: 'published', moderation: 'approved' });
    await staffCatalog.moderate(second.id, { decision: 'reject', note: 'Contrefaçon.', issues: [] }, owner);
    await expect(sellerProducts.submit(seller.id, second.id)).rejects.toMatchObject({ status: 409 });
  });

  it('l’équipe ne publie pas un produit de vendeur sans vérification favorable', async () => {
    const { create, staffCatalog } = await setup();
    const created = await create({ submit: false });
    await expect(staffCatalog.setStatus(created.id, 'published', owner)).rejects.toMatchObject({ status: 422 });
  });
});
