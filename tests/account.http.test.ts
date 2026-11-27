import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

const csrfIn = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('ok_csrf='))
    ?.split(';')[0]
    ?.slice('ok_csrf='.length) ?? '';

type App = ReturnType<typeof buildApp>;

/** Client inscrit et connecté : le navigateur simulé garde les cookies, l'en-tête CSRF est fourni à part. */
async function signIn(app: App, email: string) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/registrations')
    .send({ firstName: 'Awa', lastName: 'Ndong', email, password: 'motdepasse1', acceptTerms: true })
    .expect(201);
  return { agent, csrf: csrfIn(res) };
}

function account() {
  const app = buildApp();
  const { catalog } = app.services;
  const category = catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = catalog.addZone();
  const product = catalog.addProduct({ slug: 'pagne-wax', name: 'Pagne wax', categoryId: category.id }, [
    { price: 10_000, stock: 2 },
  ]);
  const address = (label: string) => ({
    label,
    recipient: 'Awa Ndong',
    phone: '077123456',
    zoneId: zone.id,
    landmark: 'Face à la pharmacie',
  });
  return { app, zone, product, address };
}

describe('compte client HTTP', () => {
  it('exige une session et le jeton anti-CSRF', async () => {
    const { app } = account();
    await request(app).get('/api/v1/me/addresses').expect(401);
    const { agent } = await signIn(app, 'awa@example.ga');
    const res = await agent.patch('/api/v1/me').send({ firstName: 'Awa' }).expect(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
  });

  it('modifie le nom et renvoie le compte complet, sans champ interne', async () => {
    const { app } = account();
    const { agent, csrf } = await signIn(app, 'awa@example.ga');
    const res = await agent.patch('/api/v1/me').set('X-CSRF-Token', csrf).send({ lastName: 'Mba' }).expect(200);
    expect(res.body.data).toMatchObject({ firstName: 'Awa', lastName: 'Mba', birthDate: null });
    expect(res.body.data.referralCode).toEqual(expect.any(String));
    expect(res.body.data).not.toHaveProperty('passwordHash');
    await agent.patch('/api/v1/me').set('X-CSRF-Token', csrf).send({}).expect(400);
    await agent.patch('/api/v1/me').set('X-CSRF-Token', csrf).send({ email: 'autre@example.ga' }).expect(400);
  });

  it('gère les adresses : première par défaut, changement, suppression avec relais, plafond', async () => {
    const { app, address } = account();
    const { agent, csrf } = await signIn(app, 'awa@example.ga');
    const post = (label: string) => agent.post('/api/v1/me/addresses').set('X-CSRF-Token', csrf).send(address(label));

    const home = (await post('Maison').expect(201)).body.data;
    const office = (await post('Bureau').expect(201)).body.data;
    expect([home.isDefault, office.isDefault]).toEqual([true, false]);

    await agent
      .patch(`/api/v1/me/addresses/${office.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ isDefault: true })
      .expect(200);
    let list = (await agent.get('/api/v1/me/addresses').expect(200)).body.data;
    expect(list.map((a: { label: string; isDefault: boolean }) => [a.label, a.isDefault])).toEqual([
      ['Bureau', true],
      ['Maison', false],
    ]);

    await agent.delete(`/api/v1/me/addresses/${office.id}`).set('X-CSRF-Token', csrf).expect(204);
    list = (await agent.get('/api/v1/me/addresses').expect(200)).body.data;
    expect(list).toMatchObject([{ label: 'Maison', isDefault: true }]);

    for (const label of ['A', 'B', 'C', 'D']) await post(label).expect(201);
    const full = await post('E').expect(422);
    expect(full.body.message).toContain('5 adresses au maximum');
  });

  it('refuse un quartier inconnu et les adresses d’un autre client', async () => {
    const { app, address } = account();
    const awa = await signIn(app, 'awa@example.ga');
    const bob = await signIn(app, 'bob@example.ga');
    const unknownZone = { ...address('Maison'), zoneId: '00000000-0000-4000-8000-000000000000' };
    await awa.agent.post('/api/v1/me/addresses').set('X-CSRF-Token', awa.csrf).send(unknownZone).expect(422);

    const home = (
      await awa.agent.post('/api/v1/me/addresses').set('X-CSRF-Token', awa.csrf).send(address('Maison')).expect(201)
    ).body.data;
    await bob.agent
      .patch(`/api/v1/me/addresses/${home.id}`)
      .set('X-CSRF-Token', bob.csrf)
      .send({ label: 'Pris' })
      .expect(404);
    await bob.agent.delete(`/api/v1/me/addresses/${home.id}`).set('X-CSRF-Token', bob.csrf).expect(404);
    expect((await bob.agent.get('/api/v1/me/addresses').expect(200)).body.data).toEqual([]);
    expect((await awa.agent.get('/api/v1/me/addresses').expect(200)).body.data).toMatchObject([{ label: 'Maison' }]);
  });

  it('ajoute et retire des favoris de façon idempotente, seulement des produits en vente', async () => {
    const { app, product } = account();
    const { agent, csrf } = await signIn(app, 'awa@example.ga');
    await agent.put(`/api/v1/me/favorites/${product.id}`).set('X-CSRF-Token', csrf).expect(204);
    await agent.put(`/api/v1/me/favorites/${product.id}`).set('X-CSRF-Token', csrf).expect(204);
    expect((await agent.get('/api/v1/me/favorites').expect(200)).body.data).toEqual([product.id]);

    await agent.put('/api/v1/me/favorites/00000000-0000-4000-8000-000000000000').set('X-CSRF-Token', csrf).expect(404);
    await agent.put('/api/v1/me/favorites/pas-un-uuid').set('X-CSRF-Token', csrf).expect(400);

    await agent.delete(`/api/v1/me/favorites/${product.id}`).set('X-CSRF-Token', csrf).expect(204);
    await agent.delete(`/api/v1/me/favorites/${product.id}`).set('X-CSRF-Token', csrf).expect(204);
    expect((await agent.get('/api/v1/me/favorites').expect(200)).body.data).toEqual([]);
  });

  it('ne liste plus un favori retiré de la vente', async () => {
    const { app, product } = account();
    const { agent, csrf } = await signIn(app, 'awa@example.ga');
    await agent.put(`/api/v1/me/favorites/${product.id}`).set('X-CSRF-Token', csrf).expect(204);
    product.status = 'archived';
    expect((await agent.get('/api/v1/me/favorites').expect(200)).body.data).toEqual([]);
  });
});
