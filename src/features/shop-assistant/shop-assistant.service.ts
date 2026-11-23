import { AppError } from '../../core/errors/AppError.js';
import { fcfa } from '../../core/text/fcfa.js';
import {
  ShopAssistantUnavailableError,
  type ShopAssistant,
  type ShopAssistantTurn,
} from '../../infrastructure/ai/shopAssistant.js';
import { logger } from '../../lib/logger.js';
import type { AnalyticsService } from '../analytics/analytics.service.js';
import type { CategoriesService } from '../categories/categories.service.js';
import type { DeliveryZonesService } from '../delivery-zones/delivery-zones.service.js';
import type { ProductDto } from '../products/products.dto.js';
import type { ProductsService } from '../products/products.service.js';
import type { PublicPromoCodesService } from '../promo-codes/promo-codes.service.js';
import type { SettingsService } from '../settings/settings.service.js';

/** Produits décrits au modèle : tout le catalogue jusqu'à cette taille, au-delà les plus pertinents. */
const CATALOG_PAGE = 100;

export interface AssistantMessageInput {
  message: string;
  history: ShopAssistantTurn[];
  /** Fiche produit ouverte par le client, s'il pose sa question depuis celle-ci */
  productSlug?: string | undefined;
}

export interface ShopAssistantDeps {
  /** null : aucun fournisseur d'IA configuré, le site répond avec ses règles locales */
  assistant: ShopAssistant | null;
  products: ProductsService;
  categories: CategoriesService;
  zones: DeliveryZonesService;
  settings: SettingsService;
  promoCodes: PublicPromoCodesService;
  analytics: AnalyticsService;
}

const unavailable = () => new AppError('L’assistant est momentanément indisponible.', 503, 'ASSISTANT_UNAVAILABLE');

/** Une ligne par produit : ce qu'il faut pour conseiller sans rien inventer. */
function describeProduct(p: ProductDto, categoryName: (id: string) => string) {
  const prices = p.variants.map((v) => v.salePrice);
  const base = p.variants.map((v) => v.price);
  const from = Math.min(...prices);
  const promo = p.promotion && from < Math.min(...base) ? ` (au lieu de ${fcfa(Math.min(...base))})` : '';
  const stock = p.variants.some((v) => v.availability !== 'out_of_stock') ? 'disponible' : 'épuisé';
  const variants = p.variants.length > 1 ? ` ; variantes : ${p.variants.map((v) => v.label).join(', ')}` : '';
  const seller = p.seller ? `, vendu par la boutique ${p.seller.name}` : ', vendu par OKOZA';
  return `- ${p.name} [${p.slug}] : ${prices.length > 1 ? 'dès ' : ''}${fcfa(from)}${promo}, ${stock}, catégorie ${categoryName(p.categoryId)}${p.brand ? `, marque ${p.brand}` : ''}${seller}${variants}. ${p.shortDescription}`;
}

/**
 * Assistant d'achat public (16) : répond à partir des données réelles de la boutique (catalogue, livraison, paiement,
 * retours et codes promo). Le compteur mensuel de l'assistant est appliqué ici.
 */
export const createShopAssistantService = (deps: ShopAssistantDeps) => {
  async function buildContext(question: string, productSlug: string | undefined) {
    const [settings, zones, categories, codes, catalog, matches, current] = await Promise.all([
      deps.settings.publicSettings(),
      deps.zones.list(),
      deps.categories.list(),
      deps.promoCodes.list(),
      deps.products.list({ page: 1, limit: CATALOG_PAGE, inStock: false, onSale: false }),
      deps.products.list({ page: 1, limit: 20, search: question.slice(0, 120), inStock: false, onSale: false }),
      productSlug ? deps.products.getBySlug(productSlug).catch(() => null) : Promise.resolve(null),
    ]);
    const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'autre';
    const products = new Map<string, ProductDto>();
    for (const p of [...matches.items, ...catalog.items]) products.set(p.id, p);
    const s = settings.support;
    return [
      'BOUTIQUE',
      `OKOZA, boutique en ligne. Contact : ${s.email}, téléphone ${s.phone}, WhatsApp ${s.whatsapp}, ${s.hours}. Adresse : ${s.address}.`,
      '',
      'PAIEMENT',
      'Tous les paiements se font à la livraison, au livreur : espèces, Airtel Money ou Moov Money. Rien à payer avant.',
      'Pour le Mobile Money, le client envoie le montant depuis son téléphone à la réception, avec son numéro de commande en référence.',
      'Des vendeurs inscrits vendent aussi sur OKOZA : un panier de plusieurs boutiques donne une commande par boutique, chacune livrée et payée à part.',
      '',
      'LIVRAISON (quartiers desservis, frais fixes par quartier, quel que soit le nombre d’articles)',
      ...zones.map((z) => `- ${z.name} (${z.city}) : ${fcfa(z.fee)}, délai ${z.eta}, ${z.days}`),
      'Un quartier non listé peut être demandé depuis la commande (« Mon quartier n’est pas dans la liste »).',
      '',
      'COMMANDES ET RETOURS',
      'Commande avec ou sans compte. Numéro de commande et code de suivi donnés à la confirmation et par e-mail ; suivi sur la page « Suivre ma commande ».',
      'Annulation libre avant la préparation, ensuite par demande examinée par la boutique.',
      `Retour possible dans les ${settings.returnWindowDays} jours suivant la livraison, depuis le compte ou la page Contact ; photo demandée pour un produit endommagé, défectueux ou non conforme. Remboursement après réception et vérification.`,
      '',
      '',
      'CODES PROMO EN COURS',
      ...(codes.length
        ? codes.map(
            (c) =>
              `- ${c.code} : ${c.label}${c.minAmount ? `, dès ${fcfa(c.minAmount)} d’achats` : ''}, jusqu’au ${c.endsAt.slice(0, 10)}`,
          )
        : ['Aucun code public en ce moment.']),
      '',
      'CATÉGORIES',
      categories.map((c) => c.name).join(', '),
      '',
      `PRODUITS EN VENTE (${products.size}${catalog.total > CATALOG_PAGE ? ` sur ${catalog.total}, les plus pertinents` : ''})`,
      ...[...products.values()].map((p) => describeProduct(p, categoryName)),
      ...(current
        ? [
            '',
            `LE CLIENT REGARDE CE PRODUIT : ${current.name} [${current.slug}]`,
            current.description.join(' '),
            ...current.specs.map((sp) => `${sp.label} : ${sp.value}`),
            ...current.variants.map(
              (v) =>
                `Variante ${v.label} : ${fcfa(v.salePrice)}, ${v.availability === 'out_of_stock' ? 'épuisée' : 'disponible'}`,
            ),
            current.usageTips ? `Conseils : ${current.usageTips}` : '',
          ]
        : []),
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  return {
    /** Réponse de l'assistant ; 503 si l'IA n'est pas disponible (le site répond alors avec ses règles locales). */
    async answer(input: AssistantMessageInput) {
      if (!deps.assistant) throw unavailable();
      const usage = await deps.analytics.consumeAssistant();
      if (!usage.allowed)
        throw new AppError(
          'L’assistant a atteint sa limite du mois. Notre équipe reste joignable par la page Contact.',
          429,
          'ASSISTANT_LIMIT',
        );
      const context = await buildContext(input.message, input.productSlug);
      try {
        const answer = await deps.assistant.answer({
          context,
          history: input.history.slice(-8),
          question: input.message,
        });
        // Seuls les produits réellement en vente sont renvoyés au site
        const known = new Set(context.match(/\[([a-z0-9-]+)\]/g)?.map((m) => m.slice(1, -1)) ?? []);
        return { reply: answer.reply, productSlugs: answer.productSlugs.filter((s) => known.has(s)).slice(0, 4) };
      } catch (error) {
        if (error instanceof ShopAssistantUnavailableError) {
          logger.warn({ err: error.cause ?? error }, 'Assistant d’achat indisponible');
          throw unavailable();
        }
        throw error;
      }
    },
  };
};

export type ShopAssistantService = ReturnType<typeof createShopAssistantService>;
