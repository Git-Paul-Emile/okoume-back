import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stockManager = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const review = { rating: 5, comment: 'Tissu de belle qualité, conforme aux photos.', photos: [] };

function setup() {
  const { services } = buildApp();
  services.teamDirectory.push({ id: 's0', firstName: 'Inès', lastName: 'Moussavou' });
  const at = services.clock.now();
  for (const [id, firstName] of [
    ['c1', 'Awa'],
    ['c2', 'Paul'],
  ] as const)
    services.customersStore.customers.push({
      id,
      email: `${id}@example.ga`,
      phone: null,
      phoneKey: null,
      passwordHash: '',
      firstName,
      lastName: 'Ndong',
      status: 'active',
      referralCode: id.toUpperCase(),
      birthDate: null,
      birthdayChoice: 'points',
      createdAt: at,
      lastLoginAt: at,
    });
  services.reviewsStore.received.add(`c1:${PRODUCT}`);
  return services;
}

describe('avis côté client', () => {
  it('réserve l’avis à un produit reçu et publie le prénom avec l’initiale seulement', async () => {
    const { reviews } = setup();
    await expect(reviews.save('c2', PRODUCT, review)).rejects.toMatchObject({ status: 403 });
    const saved = await reviews.save('c1', PRODUCT, review);
    expect(saved).toMatchObject({ authorName: 'Awa N.', status: 'pending' });
    expect((await reviews.forProduct(PRODUCT, { page: 1, limit: 20 })).total).toBe(0);
  });

  it('refuse une photo qui ne vient pas de notre hébergeur', async () => {
    const { reviews } = setup();
    await expect(
      reviews.save('c1', PRODUCT, { ...review, photos: ['https://ailleurs.example/p.jpg'] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('remet un avis modifié en modération et garde la version précédente', async () => {
    const { reviews } = setup();
    const first = await reviews.save('c1', PRODUCT, review);
    await reviews.decide(first.id, { status: 'approved' }, owner);
    const edited = await reviews.save('c1', PRODUCT, {
      ...review,
      rating: 3,
      comment: 'Couleur un peu terne au lavage.',
    });
    expect(edited).toMatchObject({ status: 'pending', rating: 3 });
    expect(edited.history.at(-1)).toMatchObject({ event: 'Avis modifié par le client', rating: 5 });
  });

  it('signale un avis publié une seule fois, jamais le sien', async () => {
    const { reviews } = setup();
    const saved = await reviews.save('c1', PRODUCT, review);
    await expect(reviews.report(saved.id, 'c2', 'Hors sujet')).rejects.toMatchObject({ status: 404 });
    await reviews.decide(saved.id, { status: 'approved' }, owner);
    await expect(reviews.report(saved.id, 'c1', 'Hors sujet')).rejects.toMatchObject({ status: 422 });
    await reviews.report(saved.id, 'c2', 'Hors sujet');
    await expect(reviews.report(saved.id, 'c2', 'Hors sujet')).rejects.toMatchObject({ status: 409 });
  });
});

describe('modération', () => {
  it('publie, calcule la note du produit et clôt les signalements avec la décision', async () => {
    const { reviews, reviewsStore } = setup();
    const saved = await reviews.save('c1', PRODUCT, review);
    const approved = await reviews.decide(saved.id, { status: 'approved' }, owner);
    expect(approved.history.at(-1)?.event).toBe('Publié par Inès Moussavou');
    expect(await reviews.ratings()).toEqual([{ productId: PRODUCT, average: 5, count: 1 }]);
    await reviews.report(saved.id, 'c2', 'Propos insultants');
    expect((await reviews.list({ page: 1, limit: 20, reported: true }, owner)).items[0]?.reports).toEqual([
      'Propos insultants',
    ]);
    const hidden = await reviews.decide(
      saved.id,
      {
        status: 'rejected',
        rejectionReason: 'Insultes, menaces ou propos discriminatoires',
        detail: 'insulte au livreur',
      },
      owner,
    );
    expect(hidden.rejectionReason).toBe('Insultes, menaces ou propos discriminatoires (insulte au livreur)');
    expect(reviewsStore.reports).toHaveLength(0);
  });

  it('réserve la modération aux droits sur les clients', async () => {
    const { reviews } = setup();
    await expect(reviews.list({ page: 1, limit: 20 }, stockManager)).rejects.toMatchObject({ status: 403 });
  });
});
