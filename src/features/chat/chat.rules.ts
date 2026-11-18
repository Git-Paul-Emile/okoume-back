import { fcfa } from '../../core/text/fcfa.js';

/**
 * Règles de négociation du tchat (32.5), décidées par le serveur. Le modèle ne reçoit jamais le prix minimum du
 * vendeur : il ne peut ni le révéler ni le franchir, quelle que soit la façon dont l'acheteur s'y prend.
 */

/** Prix minimum à partir du réglage du vendeur : un prix plancher, ou une réduction maximale en pourcentage. */
export function floorFrom(price: number, setting: { minPrice?: number | null; maxDiscountPercent?: number }) {
  if (setting.maxDiscountPercent !== undefined) return Math.ceil(price * (1 - setting.maxDiscountPercent / 100));
  return setting.minPrice ?? null;
}

/**
 * Décision sur un prix proposé : accepté s'il atteint le prix minimum du vendeur, au prix affiché au plus (une
 * offre au-dessus du prix affiché est ramenée à ce prix). Sans prix minimum, seul le prix affiché est accepté.
 */
export function decideOffer(offer: number, floor: number | null, listedPrice: number) {
  if (offer >= listedPrice) return { accepted: true as const, price: listedPrice };
  if (floor !== null && offer >= floor) return { accepted: true as const, price: offer };
  return { accepted: false as const };
}

/** Séparateurs de milliers : espace, point, espace insécable et espace fine insécable (format fr-FR). */
const SEPARATORS = `\\s.${String.fromCharCode(0xa0, 0x202f)}`;
/** Montants suivis d'une devise dans un texte : « 15 000 FCFA », « 12000 F », « 9.500 francs ». */
const AMOUNT = new RegExp(`(\\d{1,3}(?:[${SEPARATORS}]\\d{3})+|\\d+)\\s*(?:f\\s?cfa|xaf|francs?|f)(?![a-z])`, 'gi');
const SEPARATOR = new RegExp(`[${SEPARATORS}]`, 'g');

/**
 * Le texte libre de l'assistant cite-t-il un prix inférieur au prix affiché ? Défense de plus : l'assistant n'a
 * pas à parler de remise, et une réponse qui le ferait est remplacée avant d'être envoyée.
 */
export function mentionsLowerPrice(text: string, listedPrice: number) {
  for (const match of text.matchAll(AMOUNT)) {
    const amount = Number(match[1]!.replace(SEPARATOR, ''));
    if (amount < listedPrice) return true;
  }
  return false;
}

const date = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Libreville' }).format(d);

/** Messages rédigés par le serveur : ils ne dépendent jamais du modèle. */
export const MESSAGES = {
  disclosure:
    'Vous échangez avec l’assistant Okoumé, une intelligence artificielle. Il répond à partir de l’annonce et des consignes du vendeur, et transmet au vendeur les questions auxquelles il ne peut pas répondre. Ne communiquez jamais de données de paiement dans le tchat.',
  offerAccepted: (price: number, expiresAt: Date) =>
    `C’est d’accord pour ${fcfa(price)}. Ce prix est valable jusqu’au ${date(expiresAt)} : vous pouvez envoyer votre demande de commande depuis l’annonce. Avez-vous d’autres questions ?`,
  offerDeclined:
    'Ce prix est en dessous de ce que le vendeur peut accepter. Vous pouvez proposer un autre prix ou commander au prix affiché. Avez-vous d’autres questions ?',
  handedToSeller:
    'Je ne peux pas vous répondre de façon fiable : je transmets votre question au vendeur, qui vous répondra ici. Avez-vous d’autres questions ?',
  assistantUnavailable: 'L’assistant est momentanément indisponible : le vendeur vous répondra directement ici.',
  closing: 'Merci pour votre visite. Vous pouvez rouvrir la conversation à tout moment en écrivant un nouveau message.',
  sellerAgreement: (price: number, expiresAt: Date) =>
    `Le vendeur vous propose ${fcfa(price)}. Ce prix est valable jusqu’au ${date(expiresAt)} : vous pouvez envoyer votre demande de commande depuis l’annonce.`,
};

export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);
