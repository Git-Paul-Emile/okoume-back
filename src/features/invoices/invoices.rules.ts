import type { OrderRecord, PaymentMethod } from '../orders/orders.repository.js';

export interface InvoiceLine {
  label: string;
  detail?: string;
  quantity: number;
  /** Prix unitaire TTC */
  unit: number;
  vatRate: number;
  ttc: number;
}

export interface VatRow {
  rate: number;
  ht: number;
  vat: number;
  ttc: number;
}

/** Contenu figé d'une facture ou d'un avoir, avant numérotation. */
export interface DocumentContent {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  paymentMethod: PaymentMethod;
  lines: InvoiceLine[];
  vatBreakdown: VatRow[];
  totals: { ht: number; vat: number; ttc: number };
}

/** Ce qu'une facture reprend de la commande. */
export type InvoiceSource = Pick<
  OrderRecord,
  'recipient' | 'phone' | 'email' | 'zoneName' | 'landmark' | 'paymentMethod' | 'promoCode' | 'items' | 'totals'
>;

const PREFIX = { invoice: 'FAC', credit_note: 'AV' } as const;

/** Numéro d'une série : FAC-2026-000001, AV-2026-000001 (25.4). */
export const documentNumber = (type: keyof typeof PREFIX, year: number, sequence: number) =>
  `${PREFIX[type]}-${year}-${String(sequence).padStart(6, '0')}`;

/** Montant hors taxe et TVA d'un montant TTC, arrondis au franc. */
export const splitTtc = (ttc: number, rate: number) => {
  const ht = Math.round(ttc / (1 + rate / 100));
  return { ht, vat: ttc - ht };
};

/** Ventilation par taux et totaux, à partir des lignes. */
export function breakdown(lines: readonly InvoiceLine[]) {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.ttc);
  const rows = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, ttc]) => ({ rate, ttc, ...splitTtc(ttc, rate) }));
  const sum = (k: 'ht' | 'vat' | 'ttc') => rows.reduce((s, r) => s + r[k], 0);
  return { vatBreakdown: rows, totals: { ht: sum('ht'), vat: sum('vat'), ttc: sum('ttc') } };
}

/** Répartit un montant au prorata de bases, la dernière part absorbant l'arrondi : la somme est exacte. */
function prorate(amount: number, bases: readonly number[]) {
  const total = bases.reduce((s, b) => s + b, 0);
  let left = amount;
  return bases.map((base, i) => {
    const part = i === bases.length - 1 ? left : Math.round((amount * base) / total);
    left -= part;
    return part;
  });
}

/**
 * Facture d'une commande payée (25.4). Les taux de TVA sont ceux figés sur les lignes de la commande ;
 * les remises (code, points) sont réparties sur les taux au prorata ; la livraison a son propre taux.
 * Même construction que le front (front/src/features/invoices/invoice.rules.ts).
 */
export function invoiceContent(order: InvoiceSource, deliveryVatRate: number): DocumentContent {
  const t = order.totals;
  const items: InvoiceLine[] = order.items.map((i) => ({
    label: i.name,
    detail: i.variantLabel,
    quantity: i.quantity,
    unit: i.unitPrice,
    vatRate: i.vatRate,
    ttc: i.unitPrice * i.quantity,
  }));
  const discount = t.codeDiscount + t.pointsDiscount;
  const rates = [...new Set(items.map((l) => l.vatRate))];
  const discountLabel = [
    t.codeDiscount > 0 && `code ${order.promoCode ?? ''}`.trim(),
    t.pointsDiscount > 0 && 'points fidélité',
  ]
    .filter(Boolean)
    .join(' et ');
  const discounts: InvoiceLine[] =
    discount > 0 && items.length
      ? prorate(
          discount,
          rates.map((rate) => items.filter((l) => l.vatRate === rate).reduce((s, l) => s + l.ttc, 0)),
        ).map((part, i) => ({
          label: `Remise (${discountLabel})`,
          quantity: 1,
          unit: -part,
          vatRate: rates[i]!,
          ttc: -part,
        }))
      : [];
  const delivery = t.deliveryFee - t.deliveryDiscount;
  const lines = [
    ...items,
    ...discounts,
    ...(delivery > 0
      ? [
          {
            label: `Livraison (${order.zoneName})`,
            quantity: 1,
            unit: delivery,
            vatRate: deliveryVatRate,
            ttc: delivery,
          },
        ]
      : []),
  ];
  return {
    customerName: order.recipient,
    customerPhone: order.phone,
    customerEmail: order.email,
    address: `${order.zoneName}, ${order.landmark}`,
    paymentMethod: order.paymentMethod,
    lines,
    ...breakdown(lines),
  };
}

/** Avoir d'un remboursement : montant réparti sur les taux de la facture d'origine (25.4). */
export function creditNoteContent(invoice: DocumentContent, amount: number): DocumentContent {
  if (amount <= 0 || amount > invoice.totals.ttc) throw new Error('Montant d’avoir invalide.');
  const lines = prorate(
    amount,
    invoice.vatBreakdown.map((r) => r.ttc),
  ).map((part, i) => {
    const rate = invoice.vatBreakdown[i]!.rate;
    return { label: `Remboursement (TVA ${rate} %)`, quantity: 1, unit: part, vatRate: rate, ttc: part };
  });
  return { ...invoice, lines, ...breakdown(lines) };
}
