import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const catalog = { id: 's1', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const orders = { id: 's2', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };

function setup() {
  const services = buildApp().services;
  const add = (id: string, sensitive: boolean) =>
    services.emailDeliveriesStore.deliveries.push({
      id,
      to: 'awa@example.ga',
      subject: 'Votre commande CMD-2026-12345',
      text: sensitive ? null : 'Commande confirmée.',
      sensitive,
      status: 'failed',
      attempts: 7,
      lastError: 'fournisseur indisponible',
      sentAt: null,
      createdAt: services.clock.now(),
    });
  add('d1', false);
  add('d2', true);
  return services;
}

describe('suivi des e-mails', () => {
  it('ne montre jamais le texte, et masque le destinataire sans le droit sur les données sensibles', async () => {
    const { emailDeliveries } = setup();
    const page = await emailDeliveries.list({ page: 1, limit: 20 }, owner);
    expect(page.items[0]).not.toHaveProperty('text');
    expect(page.items.map((d) => d.retryable)).toEqual([true, false]);
    // Le gestionnaire des commandes a le droit de consulter les données sensibles ; pas le catalogue
    await expect(emailDeliveries.list({ page: 1, limit: 20 }, catalog)).rejects.toMatchObject({ status: 403 });
    expect((await emailDeliveries.list({ page: 1, limit: 20 }, orders)).items[0]?.to).toBe('awa@example.ga');
  });

  it('relance un échec une seule fois, jamais un e-mail qui contenait un code', async () => {
    const { emailDeliveries, email } = setup();
    await emailDeliveries.retry('d1', owner);
    expect(email.last('awa@example.ga')?.text).toBe('Commande confirmée.');
    await expect(emailDeliveries.retry('d1', owner)).rejects.toMatchObject({ status: 409 });
    await expect(emailDeliveries.retry('d2', owner)).rejects.toMatchObject({ status: 409 });
  });
});
