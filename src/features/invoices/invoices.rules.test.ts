import { describe, expect, it } from 'vitest';
import { creditNoteContent, documentNumber, invoiceContent, splitTtc, type InvoiceSource } from './invoices.rules.js';

const order: InvoiceSource = {
  recipient: 'Awa Ndong',
  phone: '077123456',
  email: 'awa@example.ga',
  zoneName: 'Glass',
  landmark: 'Face à la pharmacie',
  paymentMethod: 'cash',
  promoCode: 'BIENVENUE',
  items: [
    {
      productId: 'p1',
      variantId: 'v1',
      name: 'Pagne',
      variantLabel: '6 yards',
      image: '',
      unitPrice: 11_800,
      originalPrice: 11_800,
      vatRate: 18,
      quantity: 2,
    },
    {
      productId: 'p2',
      variantId: 'v2',
      name: 'Livre',
      variantLabel: 'Poche',
      image: '',
      unitPrice: 5_000,
      originalPrice: 5_000,
      vatRate: 0,
      quantity: 1,
    },
  ],
  totals: {
    subtotal: 28_600,
    productDiscount: 0,
    codeDiscount: 2_860,
    pointsDiscount: 0,
    deliveryFee: 2_000,
    deliveryDiscount: 0,
    total: 27_740,
  },
};

describe('factures et avoirs', () => {
  it('numérote chaque série sur six chiffres', () => {
    expect(documentNumber('invoice', 2026, 42)).toBe('FAC-2026-000042');
    expect(documentNumber('credit_note', 2026, 1)).toBe('AV-2026-000001');
  });

  it('sépare hors taxe et TVA d’un montant TTC, au franc près', () => {
    expect(splitTtc(11_800, 18)).toEqual({ ht: 10_000, vat: 1_800 });
    expect(splitTtc(5_000, 0)).toEqual({ ht: 5_000, vat: 0 });
  });

  it('ventile produits, remise au prorata et livraison par taux, avec un total égal à la commande', () => {
    const doc = invoiceContent(order, 18);
    expect(doc.lines.filter((l) => l.label.startsWith('Remise')).map((l) => l.ttc)).toEqual([-2_360, -500]);
    expect(doc.lines.at(-1)).toMatchObject({ label: 'Livraison (Glass)', ttc: 2_000, vatRate: 18 });
    expect(doc.totals.ttc).toBe(order.totals.total);
    expect(doc.totals.ht + doc.totals.vat).toBe(doc.totals.ttc);
    expect(doc.vatBreakdown.map((r) => r.rate)).toEqual([18, 0]);
  });

  it('répartit un avoir sur les taux de la facture, sans dépasser son montant', () => {
    const invoice = invoiceContent(order, 18);
    const credit = creditNoteContent(invoice, 10_000);
    expect(credit.totals.ttc).toBe(10_000);
    expect(credit.lines.every((l) => l.label.startsWith('Remboursement'))).toBe(true);
    expect(() => creditNoteContent(invoice, invoice.totals.ttc + 1)).toThrow();
  });
});
