import type { ListingReviewer } from '../../infrastructure/ai/listingReviewer.js';
import type { Notifier } from '../notifications/notifier.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { ModerationPatch, StaffCatalogRepository } from '../staff-catalog/staff-catalog.repository.js';

export interface ProductReviewDeps {
  catalog: StaffCatalogRepository;
  shops: ShopsRepository;
  categories: CategoriesRepository;
  reviewer: ListingReviewer;
  notifier: Notifier;
  appUrl: string;
}

const CONDITION_LABEL = { new: 'neuf', like_new: 'comme neuf', good: 'bon état', used: 'usé' } as const;

/** Nom complet de la catégorie, par exemple « Mode > Femme > Robes », pour juger la cohérence. */
async function categoryPath(categories: CategoriesRepository, id: string) {
  const all = new Map((await categories.findAll()).map((c) => [c.id, c] as const));
  const names: string[] = [];
  for (let c = all.get(id); c && names.length < 6; c = c.parentId ? all.get(c.parentId) : undefined)
    names.unshift(c.name);
  return names.join(' > ');
}

/**
 * Vérification assistée des produits de vendeurs (32.3), exécutée par le worker. L'avis ne s'applique qu'à la
 * version examinée. L'IA publie, demande une correction ou transmet à une personne : elle ne refuse jamais seule.
 */
export const createProductReviewWorker = (deps: ProductReviewDeps) => {
  const { catalog, shops, reviewer } = deps;

  async function apply(productId: string, version: number, patch: ModerationPatch) {
    const applied = await catalog.applyModeration(productId, { version, states: ['in_review'] }, patch);
    if (applied && patch.moderation === 'pending_moderation')
      await deps.notifier.notifyStaff('vendeurs:valider', {
        title: 'Produit de vendeur à examiner',
        body: 'Un produit attend une vérification humaine.',
        url: `${deps.appUrl}/admin/produits/${productId}`,
        tag: `moderation-produit-${productId}`,
      });
  }

  const toModeration = (productId: string, version: number, note: string) =>
    apply(productId, version, { moderation: 'pending_moderation', issues: [], note, status: 'draft' });

  return {
    /** Une panne passagère du fournisseur est levée : la file reprend la vérification. */
    async review(productId: string, version: number) {
      const product = await catalog.findById(productId);
      if (!product?.shopId || product.moderation !== 'in_review' || product.moderationVersion !== version) return;
      const shop = await shops.findById(product.shopId);
      if (!shop) return;
      const prices = product.variants.map((v) => v.price);
      const verdict = await reviewer.review({
        title: product.name,
        description: [product.shortDescription, ...product.description].join('\n'),
        category: await categoryPath(deps.categories, product.categoryId),
        kind: 'product',
        condition: product.condition ? CONDITION_LABEL[product.condition] : null,
        price: Math.min(...prices),
        quantity: product.variants.reduce((sum, v) => sum + v.stock, 0),
        city: shop.city,
        district: shop.district,
        photoUrls: product.images,
      });
      const issues = verdict.issues.map((i) => i.message);
      if (verdict.outcome === 'approved')
        await apply(productId, version, { moderation: 'approved', issues: [], note: null, status: 'published' });
      else if (verdict.outcome === 'changes_requested')
        await apply(productId, version, { moderation: 'changes_requested', issues, note: null, status: 'draft' });
      else await toModeration(productId, version, 'Transmis par la vérification automatique');
    },

    /** Toutes les reprises ont échoué : une personne vérifie au lieu de laisser le produit en attente. */
    fallbackToModeration: (productId: string, version: number) =>
      toModeration(productId, version, 'Vérification automatique indisponible'),
  };
};

export type ProductReviewWorker = ReturnType<typeof createProductReviewWorker>;
