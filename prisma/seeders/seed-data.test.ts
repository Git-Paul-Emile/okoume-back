import { describe, expect, it } from 'vitest';
import { phoneKey } from '../../src/features/auth/auth.service.js';
import { loadAccessPlans } from './access-plans.seeder.js';
import { loadCategories } from './categories.seeder.js';
import { loadContent } from './content.seeder.js';
import { loadCouriers } from './couriers.seeder.js';
import { loadCustomers } from './customers.seeder.js';
import { loadZones } from './delivery-zones.seeder.js';
import { loadLoyaltyMovements } from './loyalty-movements.seeder.js';
import { loadOrders } from './orders.seeder.js';
import { loadProducts } from './products.seeder.js';
import { loadPromoCodes } from './promo-codes.seeder.js';
import { loadSettings } from './settings.seeder.js';
import { loadStaff, ownerStaffId } from './staff.seeder.js';
import { legacyUuid } from './support.js';

/**
 * Vérifie les données du seed sans base : chaque fichier respecte son schéma, et les relations, unicités et
 * contraintes CHECK de PostgreSQL sont tenues. Un seed qui passe ici n'échoue pas sur une contrainte.
 */
const duplicates = (values: Array<string | null>) => values.filter((v, i) => v !== null && values.indexOf(v) !== i);

const categories = loadCategories();
const products = loadProducts();
const zones = loadZones();
const customers = loadCustomers();
const orders = loadOrders();
const variants = products.flatMap((p) => p.variants);

describe('données du seed', () => {
  it('chaque fichier respecte son schéma', () => {
    for (const load of [
      loadSettings,
      loadAccessPlans,
      loadStaff,
      loadCouriers,
      loadPromoCodes,
      loadLoyaltyMovements,
    ])
      expect(load).not.toThrow();
    expect(ownerStaffId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('donne des identifiants stables au format UUID', () => {
    expect(legacyUuid('product', '1')).toBe(legacyUuid('product', '1'));
    expect(legacyUuid('product', '1')).not.toBe(legacyUuid('variant', '1'));
    expect(legacyUuid('order', 'o1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('respecte les valeurs uniques de la base', () => {
    expect(duplicates(categories.map((c) => c.slug))).toEqual([]);
    expect(duplicates(products.map((p) => p.slug))).toEqual([]);
    expect(duplicates([...products.map((p) => p.sku), ...variants.map((v) => v.sku)])).toEqual([]);
    expect(duplicates(variants.map((v) => v.id))).toEqual([]);
    expect(duplicates(customers.map((c) => c.email.toLowerCase()))).toEqual([]);
    expect(duplicates(customers.map((c) => (c.phone ? phoneKey(c.phone) : null)))).toEqual([]);
    expect(duplicates(customers.map((c) => c.referralCode))).toEqual([]);
    expect(duplicates(loadStaff().map((s) => s.email.toLowerCase()))).toEqual([]);
    expect(duplicates(orders.map((o) => o.number))).toEqual([]);
    expect(duplicates(orders.map((o) => o.id))).toEqual([]);
    expect(duplicates(zones.map((z) => `${z.city}/${z.name}`))).toEqual([]);
  });

  it('ne cite que des lignes qui existent', () => {
    const categoryIds = new Set(categories.map((c) => c.id));
    const zoneIds = new Set(zones.map((z) => z.id));
    const productIds = new Set(products.map((p) => p.id));
    const variantIds = new Set(variants.map((v) => v.id));
    const customerIds = new Set(customers.map((c) => c.id));
    expect(products.filter((p) => !categoryIds.has(p.categoryId))).toEqual([]);
    for (const code of loadPromoCodes()) {
      expect(code.productIds.filter((id) => !productIds.has(id))).toEqual([]);
      expect(code.categoryIds.filter((id) => !categoryIds.has(id))).toEqual([]);
    }
    expect(loadCouriers().flatMap((c) => c.zoneIds.filter((id) => !zoneIds.has(id)))).toEqual([]);
    expect(loadLoyaltyMovements().filter((m) => !customerIds.has(m.userId))).toEqual([]);
    for (const order of orders) {
      expect(zoneIds.has(order.customer.zoneId)).toBe(true);
      if (order.userId) expect(customerIds.has(order.userId)).toBe(true);
      for (const item of [...order.items, ...(order.returnRequest?.items ?? [])])
        expect(variantIds.has(item.variantId)).toBe(true);
      for (const item of order.items) expect(productIds.has(item.productId)).toBe(true);
    }
  });

  it('tient les contraintes CHECK de la base', () => {
    for (const v of variants) {
      expect(v.reserved).toBeLessThanOrEqual(v.stock);
      if (v.cost != null) expect(v.cost).toBeLessThan(v.price);
    }
    for (const p of products)
      if (p.promotion) {
        expect(p.promotion.startsAt < p.promotion.endsAt).toBe(true);
        if (p.promotion.type === 'percent') expect(p.promotion.value).toBeLessThanOrEqual(100);
      }
    for (const { number, totals: t, items } of orders) {
      // Même calcul que la contrainte orders_total_consistent : la remise produit est déjà dans le sous-total
      const expected = t.subtotal - t.codeDiscount - t.pointsDiscount + t.deliveryFee - t.deliveryDiscount;
      expect({ number, total: t.total }).toEqual({ number, total: expected });
      for (const item of items) expect(item.originalPrice).toBeGreaterThanOrEqual(item.unitPrice);
    }
    const settings = loadSettings();
    const threshold = (tier: string) => settings.tiers.find((t) => t.id === tier)?.threshold ?? 0;
    expect(threshold('or')).toBeGreaterThan(threshold('argent'));
  });
});

describe('contenus du seed', () => {
  const content = loadContent();

  it('relie chaque offre exclusive à un produit du catalogue', () => {
    const ids = new Set(products.map((p) => p.id));
    expect(content.offers.filter((o) => !ids.has(o.productId))).toEqual([]);
  });

  it('tient les contraintes des espaces publicitaires', () => {
    expect(content.ads.filter((a) => a.startsAt && a.endsAt && a.endsAt <= a.startsAt)).toEqual([]);
  });
});
