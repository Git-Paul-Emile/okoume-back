import { describe, expect, it } from 'vitest';
import type { OrderRecord } from './orders.repository.js';
import {
  advancePlan,
  assignCourierPlan,
  cancelPlan,
  deliveryRetryPlan,
  nextStatus,
  reopenPlan,
} from './orders.transitions.js';

const order = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  id: 'o1',
  number: 'CMD-2026-AAAAAA',
  trackingCode: 'BBBBBB',
  customerId: null,
  idempotencyKey: 'k',
  recipient: 'Awa',
  phone: '077123456',
  email: 'awa@example.ga',
  zoneId: 'z',
  zoneName: 'Glass',
  landmark: 'Pharmacie',
  instructions: '',
  totals: {
    subtotal: 10_000,
    productDiscount: 0,
    codeDiscount: 0,
    pointsDiscount: 0,
    deliveryFee: 2_000,
    deliveryDiscount: 0,
    total: 12_000,
  },
  promoCode: null,
  promoCodeId: null,
  courierId: null,
  deliveryCost: null,
  feeChange: null,
  dispute: null,
  pointsUsed: 0,
  paymentMethod: 'cash',
  paymentStatus: 'awaiting_payment',
  review: null,
  status: 'confirmed',
  items: [],
  events: [{ status: 'confirmed', fromStatus: null, note: null, actor: 'system', by: null, createdAt: new Date() }],
  cancellation: null,
  createdAt: new Date(),
  ...overrides,
});

const prepared = {
  status: 'preparing' as const,
  fromStatus: 'confirmed' as const,
  note: null,
  actor: 'staff' as const,
  by: null,
  createdAt: new Date(),
};

describe('transitions de commande', () => {
  it('avance d’une étape et sort le stock au début de la préparation', () => {
    expect(advancePlan(order())).toMatchObject({ from: 'confirmed', to: 'preparing', stock: 'consume' });
    expect(advancePlan(order({ status: 'preparing' }))).toMatchObject({ to: 'ready', stock: null });
    expect(nextStatus('delivered')).toBeNull();
    expect(() => advancePlan(order({ status: 'cancelled' }))).toThrow(/ne peut plus avancer/);
  });

  it('prépare une commande Mobile Money avant encaissement', () => {
    expect(advancePlan(order({ paymentMethod: 'airtel', paymentStatus: 'awaiting_payment' })).to).toBe('preparing');
  });

  it('libère la réservation avant préparation, remet en stock après', () => {
    expect(cancelPlan(order(), 'motif').stock).toBe('release');
    const started = order({ status: 'ready', events: [...order().events, prepared] });
    expect(cancelPlan(started, 'motif').stock).toBe('restock');
  });

  it('transforme un paiement reçu en remboursement à effectuer', () => {
    expect(cancelPlan(order({ paymentStatus: 'paid' }), 'motif').paymentStatus).toBe('refund_due');
    expect(cancelPlan(order(), 'motif').paymentStatus).toBeUndefined();
  });

  it('refuse d’annuler une commande livrée ou déjà annulée', () => {
    expect(() => cancelPlan(order({ status: 'delivered' }), 'motif')).toThrow();
    expect(() => cancelPlan(order({ status: 'cancelled' }), 'motif')).toThrow();
  });

  it('rouvre une commande livrée et gère un échec de livraison', () => {
    expect(reopenPlan(order({ status: 'delivered' }), 'Colis abîmé')).toMatchObject({ to: 'shipping' });
    expect(() => reopenPlan(order(), 'motif')).toThrow();
    expect(deliveryRetryPlan(order({ status: 'shipping' }), 'Client absent')).toMatchObject({ to: 'ready' });
    expect(() => deliveryRetryPlan(order(), 'Client absent')).toThrow();
  });

  it('exige un livreur pour quitter « Prête à livrer » et le libère lors d’une nouvelle tentative', () => {
    const courier = { id: 'c1', deliveryCost: 1_500 };
    expect(() => advancePlan(order({ status: 'ready' }))).toThrow(/livreur/);
    expect(assignCourierPlan(order({ status: 'ready' }), courier)).toMatchObject({ to: 'courier_assigned', courier });
    expect(() => assignCourierPlan(order({ status: 'preparing' }), courier)).toThrow();
    expect(deliveryRetryPlan(order({ status: 'shipping' }), 'Client absent').courier).toBeNull();
  });

  it('bloque la livraison tant que de nouveaux frais attendent l’accord du client', () => {
    const feeChange = {
      id: 'f1',
      fromFee: 2_000,
      toFee: 3_000,
      reason: 'Zone éloignée',
      status: 'pending' as const,
      createdAt: new Date(),
    };
    expect(() => assignCourierPlan(order({ status: 'ready', feeChange }), { id: 'c1', deliveryCost: null })).toThrow(
      /frais/,
    );
    expect(() => advancePlan(order({ status: 'courier_assigned', feeChange }))).toThrow(/frais/);
    expect(advancePlan(order({ status: 'courier_assigned', feeChange: { ...feeChange, status: 'accepted' } })).to).toBe(
      'shipping',
    );
  });
});
