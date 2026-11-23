import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stock = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const setup = () => buildApp().services;

describe('espaces publicitaires', () => {
  it('montre les visuels actifs et laisse l’équipe les activer ou masquer', async () => {
    const { content, contentStore } = setup();
    contentStore.ads.push({
      id: 'a1',
      placement: 'home-promo',
      advertiser: 'Gabon Telecom',
      priority: 5,
      image: '/ads/a.svg',
      imageMobile: null,
      alt: 'Offre de rentrée',
      href: 'https://exemple.ga',
      active: true,
    });
    expect(await content.ads('home-promo')).toHaveLength(1);
    await content.updateAd('a1', { active: false }, owner);
    expect(await content.ads('home-promo')).toHaveLength(0);
  });
});

describe('pages légales', () => {
  it('enregistre une page modifiée, réservée au droit de publier', async () => {
    const { content } = setup();
    const page = { title: 'Conditions générales de vente', sections: [{ heading: 'Objet', body: ['Texte.'] }] };
    await expect(content.saveLegalPage('cgv', page, stock)).rejects.toMatchObject({ status: 403 });
    await content.saveLegalPage('cgv', page, owner);
    expect(await content.legalPages()).toEqual([expect.objectContaining({ slug: 'cgv', title: page.title })]);
  });
});
