import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';
import { maskSensitive } from './staff-assistant.service.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const catalog = { id: 's1', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const stock = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const PRODUCT = '22222222-2222-4222-8222-222222222222';

function setup() {
  const services = buildApp().services;
  services.supportStaff.push({ id: 's0', firstName: 'Inès', lastName: 'Moussavou' });
  return services;
}

describe('assistant d’administration', () => {
  it('garde l’auteur réel d’une proposition appliquée et ne l’annule qu’une fois', async () => {
    const { staffAssistant } = setup();
    const action = await staffAssistant.recordAction(
      {
        proposalId: 'slow-1',
        title: 'Remise sur les produits lents',
        changes: [{ productId: PRODUCT, label: 'Robe wax', before: { featured: true }, after: { featured: false } }],
      },
      owner,
    );
    expect(action.appliedByName).toBe('Inès Moussavou');
    await staffAssistant.revertAction(action.id, owner);
    await expect(staffAssistant.revertAction(action.id, owner)).rejects.toMatchObject({ status: 409 });
    await expect(staffAssistant.decide({ proposalId: 'slow-1', decision: 'accepted' }, stock)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('numérote les versions des règles, réservées à l’administrateur principal', async () => {
    const { staffAssistant } = setup();
    const params = { slowDays: 60, slowDiscount: 10, promoDays: 30, minStock: 10 };
    expect((await staffAssistant.saveRules({ params, note: 'Départ' }, owner)).version).toBe(1);
    expect((await staffAssistant.saveRules({ params, note: 'Retour' }, owner)).version).toBe(2);
    await expect(staffAssistant.saveRules({ params, note: 'Essai' }, catalog)).rejects.toMatchObject({ status: 403 });
  });

  it('masque les coordonnées des questions avant de les garder', async () => {
    const { staffAssistant } = setup();
    const saved = await staffAssistant.logQuestion(
      { question: 'Qui est awa@example.ga ?', answer: 'Joignable au 077 12 34 56.', source: 'Clients' },
      catalog,
    );
    expect(saved.question).toBe('Qui est [e-mail masqué] ?');
    expect(saved.answer).toBe('Joignable au [téléphone masqué].');
    expect(maskSensitive('Total 125 000 FCFA')).toBe('Total 125 000 FCFA');
  });
});
