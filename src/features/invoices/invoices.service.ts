import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import { ACCOUNT_HISTORY_MS } from '../orders/orders.service.js';
import type { InvoiceRecord, InvoicesRepository } from './invoices.repository.js';

/** Document tel qu'émis ; le compte client rattaché n'est montré qu'à l'équipe. */
const toInvoiceDto = ({ customerId: _c, ...doc }: InvoiceRecord) => ({ ...doc, issuedAt: doc.issuedAt.toISOString() });
const toStaffInvoiceDto = (doc: InvoiceRecord) => ({ ...toInvoiceDto(doc), customerId: doc.customerId });

export const createInvoicesService = (invoices: InvoicesRepository, orders: OrdersRepository, now: () => Date) => ({
  /**
   * Factures et avoirs d'une commande du client, dans la fenêtre de son compte (3 ans, 19.5) : les documents
   * plus anciens restent dans les archives comptables de la boutique, pas dans le compte.
   */
  async forCustomerOrder(customerId: string, orderId: string) {
    const order = await orders.findForCustomer(orderId, customerId);
    if (!order || order.createdAt.getTime() < now().getTime() - ACCOUNT_HISTORY_MS)
      throw new NotFoundError('Commande introuvable.');
    return (await invoices.listForOrder(orderId)).map(toInvoiceDto);
  },

  async list(
    query: { type?: 'invoice' | 'credit_note' | undefined; search?: string | undefined; page: number; limit: number },
    actor: Grantee,
  ) {
    if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
    const { items, total } = await invoices.list(query);
    return paginate(items.map(toStaffInvoiceDto), total, query.page, query.limit);
  },

  async get(id: string, actor: Grantee) {
    if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
    const doc = await invoices.findById(id);
    if (!doc) throw new NotFoundError('Document introuvable.');
    return toStaffInvoiceDto(doc);
  },
});

export type InvoicesService = ReturnType<typeof createInvoicesService>;
