import { describe, expect, it } from 'vitest';
import { suspicionReasons } from './orders.risk.js';

const calm = { recentOrders: 0, otherEmails: 0, cancelledOrders: 0 };
const order = { total: 30_000, subtotal: 28_000, discounts: 0, quantities: [1, 2] };

describe('commandes suspectes', () => {
  it('ne signale rien pour une commande ordinaire', () => {
    expect(suspicionReasons(order, calm, 500_000)).toEqual([]);
  });

  it('signale chaque situation avec un motif lisible', () => {
    expect(
      suspicionReasons(
        { total: 600_000, subtotal: 100_000, discounts: 45_000, quantities: [5] },
        { recentOrders: 2, otherEmails: 1, cancelledOrders: 2 },
        500_000,
      ),
    ).toEqual([
      'Montant élevé',
      'Quantité inhabituelle d’un même article',
      'Commandes répétées sur le même numéro en 24 h',
      'Numéro utilisé avec plusieurs adresses e-mail',
      'Annulations répétées sur ce numéro',
      'Remise très forte',
    ]);
  });

  it('respecte les seuils sans les dépasser', () => {
    expect(suspicionReasons({ ...order, total: 499_999 }, calm, 500_000)).toEqual([]);
    expect(
      suspicionReasons({ ...order, quantities: [4] }, { ...calm, recentOrders: 1, cancelledOrders: 1 }, 500_000),
    ).toEqual([]);
    // Seuil à 0 : contrôle du montant désactivé
    expect(suspicionReasons({ ...order, total: 10_000_000 }, calm, 0)).toEqual([]);
  });
});
