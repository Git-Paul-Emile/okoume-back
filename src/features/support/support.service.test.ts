import { describe, expect, it } from 'vitest';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';
import { buildShopServices, createClock } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stockManager = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60_000;

const request = (overrides: Record<string, unknown> = {}) => ({
  name: 'Awa Ndong',
  email: 'awa@example.ga',
  category: 'livraison' as const,
  orderNumber: '',
  subject: 'Colis en retard',
  message: 'Ma commande n’est toujours pas arrivée après trois jours.',
  attachments: [],
  ...overrides,
});

function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  shop.supportStaff.push({ id: 's0', firstName: 'Inès', lastName: 'Moussavou' });
  return { ...shop, clock, email };
}

describe('assistance côté client', () => {
  it('reçoit une demande du formulaire de contact, sans compte, et confirme par e-mail', async () => {
    const { support, supportStore, email } = setup();
    const ticket = await support.create(request(), null);
    expect(ticket.number).toMatch(/^SAV-2026-[A-Z0-9]{6}$/);
    expect(supportStore.tickets[0]).toMatchObject({ customerId: null, priority: 'normal', status: 'open' });
    expect(email.last('awa@example.ga')?.subject).toContain(ticket.number);
  });

  it('met un retour en priorité et refuse une image qui ne vient pas de notre hébergeur', async () => {
    const { support } = setup();
    expect((await support.create(request({ category: 'retour' }), 'c1')).priority).toBe('high');
    await expect(
      support.create(request({ attachments: ['https://ailleurs.example/photo.jpg'] }), 'c1'),
    ).rejects.toMatchObject({ status: 422 });
    const withPhoto = await support.create(request({ attachments: ['https://medias.test/support/p.jpg'] }), 'c1');
    expect(withPhoto.messages[0]?.attachments).toEqual(['https://medias.test/support/p.jpg']);
  });

  it('montre une demande à son auteur seulement', async () => {
    const { support } = setup();
    const ticket = await support.create(request(), 'c1');
    expect((await support.get('c1', ticket.number)).subject).toBe('Colis en retard');
    await expect(support.get('c2', ticket.number)).rejects.toMatchObject({ status: 404 });
  });

  it('rouvre une demande close dans le délai, puis plus après', async () => {
    const { support, clock } = setup();
    const ticket = await support.create(request(), 'c1');
    await expect(support.reply('c1', ticket.number, { body: 'Merci', attachments: [] })).resolves.toBeDefined();
    await support.update(ticket.id, { status: 'resolved', closureReason: 'Colis livré le lendemain.' }, owner);
    await expect(support.reply('c1', ticket.number, { body: 'Encore', attachments: [] })).rejects.toMatchObject({
      status: 409,
    });
    const reopened = await support.reopen('c1', ticket.number, 'Il manque un article.');
    expect(reopened).toMatchObject({ status: 'open', closureReason: null });
    await support.update(ticket.id, { status: 'closed', closureReason: 'Article renvoyé.' }, owner);
    clock.advance(16 * DAY);
    await expect(support.reopen('c1', ticket.number, 'Toujours rien.')).rejects.toMatchObject({ status: 409 });
  });

  it('accepte une seule note, après la résolution', async () => {
    const { support } = setup();
    const ticket = await support.create(request(), 'c1');
    await expect(support.rate('c1', ticket.number, 5)).rejects.toMatchObject({ status: 409 });
    await support.update(ticket.id, { status: 'resolved', closureReason: 'Colis livré.' }, owner);
    expect((await support.rate('c1', ticket.number, 4)).satisfaction).toBe(4);
    await expect(support.rate('c1', ticket.number, 5)).rejects.toMatchObject({ status: 409 });
  });
});

describe('assistance côté équipe', () => {
  it('répond, prévient le client et prend la demande en charge', async () => {
    const { support, email } = setup();
    const ticket = await support.create(request(), 'c1');
    const answered = await support.answer(ticket.id, 'Votre colis part ce matin.', owner);
    expect(answered).toMatchObject({ status: 'pending', assigneeId: 's0' });
    expect(answered.messages.at(-1)).toMatchObject({ from: 'support', staffName: 'Inès Moussavou' });
    expect(email.last('awa@example.ga')?.text).toContain('Votre colis part ce matin.');
  });

  it('exige la solution pour clore, et réserve le suivi aux droits sur les clients', async () => {
    const { support } = setup();
    const ticket = await support.create(request(), null);
    await expect(support.update(ticket.id, { status: 'closed' }, owner)).rejects.toMatchObject({ status: 422 });
    await expect(support.list({ page: 1, limit: 20 }, stockManager)).rejects.toMatchObject({ status: 403 });
    await expect(
      support.update(ticket.id, { assigneeId: '00000000-0000-4000-8000-000000000000' }, owner),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it('classe la file : demandes urgentes d’abord, puis les plus anciennes', async () => {
    const { support, clock } = setup();
    const first = await support.create(request({ subject: 'Première demande' }), null);
    clock.advance(60_000);
    const urgent = await support.create(request({ category: 'retour', subject: 'Retour urgent' }), null);
    const page = await support.list({ page: 1, limit: 20 }, owner);
    expect(page.items.map((t) => t.id)).toEqual([urgent.id, first.id]);
  });
});
