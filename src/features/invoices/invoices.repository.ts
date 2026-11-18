import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { OrderRecord } from '../orders/orders.repository.js';
import {
  creditNoteContent,
  documentNumber,
  invoiceContent,
  type DocumentContent,
  type InvoiceLine,
  type VatRow,
} from './invoices.rules.js';

export interface InvoiceRecord extends DocumentContent {
  id: string;
  number: string;
  type: 'invoice' | 'credit_note';
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  issuedAt: Date;
  relatedNumber: string | null;
  reason: string | null;
}

/** Contrat de lecture des factures et avoirs ; l'émission se fait dans la transaction du paiement. */
export interface InvoicesRepository {
  listForOrder(orderId: string): Promise<InvoiceRecord[]>;
  findById(id: string): Promise<InvoiceRecord | null>;
  list(filters: {
    type?: 'invoice' | 'credit_note' | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: InvoiceRecord[]; total: number }>;
}

type Tx = Prisma.TransactionClient;

const include = { related: { select: { number: true } } } as const satisfies Prisma.InvoiceInclude;
type Row = Prisma.InvoiceGetPayload<{ include: typeof include }>;

const isLineList = (value: unknown): value is InvoiceLine[] =>
  Array.isArray(value) &&
  value.every((l) => l && typeof l === 'object' && typeof l.label === 'string' && typeof l.ttc === 'number');

const isVatRows = (value: unknown): value is VatRow[] =>
  Array.isArray(value) &&
  value.every((r) => r && typeof r === 'object' && typeof r.rate === 'number' && typeof r.ttc === 'number');

const toRecord = (row: Row): InvoiceRecord => ({
  id: row.id,
  number: row.number,
  type: row.type,
  orderId: row.orderId,
  orderNumber: row.orderNumber,
  customerId: row.customerId,
  issuedAt: row.issuedAt,
  customerName: row.customerName,
  customerPhone: row.customerPhone,
  customerEmail: row.customerEmail,
  address: row.address,
  paymentMethod: row.paymentMethod,
  lines: isLineList(row.lines) ? row.lines : [],
  vatBreakdown: isVatRows(row.vatBreakdown) ? row.vatBreakdown : [],
  totals: { ht: row.totalHt.toNumber(), vat: row.totalVat.toNumber(), ttc: row.totalTtc.toNumber() },
  relatedNumber: row.related?.number ?? null,
  reason: row.reason,
});

/**
 * Numéro suivant d'une série (type, année). La ligne du compteur reste verrouillée jusqu'à la fin de la
 * transaction : les numéros sont attribués dans l'ordre, sans trou ni doublon (25.4).
 */
async function nextNumber(tx: Tx, type: 'invoice' | 'credit_note', at: Date) {
  const year = at.getUTCFullYear();
  const [row] = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO document_sequences (type, year, last) VALUES (${type}::"DocumentType", ${year}, 1)
    ON CONFLICT (type, year) DO UPDATE SET last = document_sequences.last + 1
    RETURNING last`;
  return documentNumber(type, year, Number(row!.last));
}

const columns = (content: DocumentContent) => ({
  customerName: content.customerName,
  customerPhone: content.customerPhone,
  customerEmail: content.customerEmail,
  address: content.address,
  paymentMethod: content.paymentMethod,
  lines: content.lines.map((l): Prisma.InputJsonObject => ({
    label: l.label,
    ...(l.detail ? { detail: l.detail } : {}),
    quantity: l.quantity,
    unit: l.unit,
    vatRate: l.vatRate,
    ttc: l.ttc,
  })),
  vatBreakdown: content.vatBreakdown.map((r): Prisma.InputJsonObject => ({
    rate: r.rate,
    ht: r.ht,
    vat: r.vat,
    ttc: r.ttc,
  })),
  totalHt: content.totals.ht,
  totalVat: content.totals.vat,
  totalTtc: content.totals.ttc,
});

/** Facture de la commande, émise une seule fois, dans la transaction qui la rend payée. */
export async function issueInvoice(tx: Tx, order: OrderRecord, at: Date) {
  if (await tx.invoice.count({ where: { orderId: order.id, type: 'invoice' } })) return;
  const settings = await tx.shopSettings.findUniqueOrThrow({ where: { id: 1 }, select: { deliveryVatRate: true } });
  const content = invoiceContent(order, settings.deliveryVatRate.toNumber());
  await tx.invoice.create({
    data: {
      number: await nextNumber(tx, 'invoice', at),
      type: 'invoice',
      orderId: order.id,
      orderNumber: order.number,
      customerId: order.customerId,
      issuedAt: at,
      ...columns(content),
    },
    select: { id: true },
  });
}

/**
 * Avoir d'un remboursement (25.4), lié à la facture d'origine et réparti sur ses taux. Sans facture
 * (commande jamais payée), aucun avoir n'est dû. Le cumul des avoirs ne dépasse jamais la facture.
 */
export async function issueCreditNote(tx: Tx, orderId: string, amount: number, reason: string, at: Date) {
  const invoiceRow = await tx.invoice.findFirst({ where: { orderId, type: 'invoice' }, include });
  if (!invoiceRow) return;
  const invoice = toRecord(invoiceRow);
  const credited = await tx.invoice.aggregate({ where: { relatedId: invoice.id }, _sum: { totalTtc: true } });
  const value = Math.min(amount, invoice.totals.ttc - (credited._sum.totalTtc?.toNumber() ?? 0));
  if (value <= 0) return;
  const content = creditNoteContent(invoice, value);
  await tx.invoice.create({
    data: {
      number: await nextNumber(tx, 'credit_note', at),
      type: 'credit_note',
      orderId,
      orderNumber: invoice.orderNumber,
      customerId: invoice.customerId,
      issuedAt: at,
      relatedId: invoice.id,
      reason,
      ...columns(content),
    },
    select: { id: true },
  });
}

export const invoicesRepository: InvoicesRepository = {
  async listForOrder(orderId) {
    const rows = await prisma.invoice.findMany({
      where: { orderId },
      include,
      orderBy: [{ issuedAt: 'asc' }, { number: 'asc' }],
    });
    return rows.map(toRecord);
  },

  async findById(id) {
    const row = await prisma.invoice.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async list({ type, search, page, limit }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        include,
        orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },
};
