import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const HOUR = 3_600_000;

function setup() {
  const { services } = buildApp();
  services.teamDirectory.push({ id: 's0', firstName: 'Inès', lastName: 'Moussavou' });
  return services;
}

describe('alertes de l’équipe', () => {
  it('crée un dossier par situation, prévient pour une alerte critique, sans doublon au passage suivant', async () => {
    const { staffAlerts, staffAlertsStore, pushQueue } = setup();
    staffAlertsStore.counts.paymentsToVerify = 2;
    staffAlertsStore.counts.lowStock = 1;
    await staffAlerts.runDetection();
    await staffAlerts.runDetection();
    expect(staffAlertsStore.alerts.map((a) => [a.key, a.detail])).toEqual([
      ['payments', '2 à traiter'],
      ['low', '1 à traiter'],
    ]);
    const pushes = pushQueue.jobs.filter((j) => 'message' in j.data && j.data.message.tag === 'alert-payments');
    expect(pushes).toHaveLength(1);
  });

  it('exige une justification et, pour une alerte critique, l’action effectuée', async () => {
    const { staffAlerts, staffAlertsStore } = setup();
    staffAlertsStore.counts.outOfStock = 3;
    await staffAlerts.runDetection();
    const id = staffAlertsStore.alerts[0]!.id;
    await expect(
      staffAlerts.update(id, { state: 'resolved', closureReason: 'Réassort reçu' }, owner),
    ).rejects.toMatchObject({ status: 422 });
    const resolved = await staffAlerts.update(
      id,
      { state: 'resolved', closureReason: 'Réassort reçu', actionTaken: 'Stock compté et saisi' },
      owner,
    );
    expect(resolved.history.at(-1)).toMatchObject({ by: 'Inès Moussavou', event: 'Résolue : Réassort reçu' });
    expect(resolved.episodes.at(-1)?.resolvedAt).toBeDefined();
  });

  it('rouvre un dossier traité quand la situation revient après avoir disparu', async () => {
    const { staffAlerts, staffAlertsStore } = setup();
    staffAlertsStore.counts.returnsPending = 1;
    await staffAlerts.runDetection();
    const id = staffAlertsStore.alerts[0]!.id;
    await staffAlerts.update(id, { state: 'closed', closureReason: 'Retour décidé' }, owner);
    staffAlertsStore.counts.returnsPending = 0;
    await staffAlerts.runDetection();
    staffAlertsStore.counts.returnsPending = 1;
    await staffAlerts.runDetection();
    expect(staffAlertsStore.alerts[0]).toMatchObject({ state: 'new', occurrences: 2 });
    expect(staffAlertsStore.alerts[0]?.episodes).toHaveLength(2);
  });

  it('relance une alerte critique restée nouvelle après le délai d’escalade, une fois par délai', async () => {
    const { staffAlerts, staffAlertsStore, clock } = setup();
    staffAlertsStore.counts.paymentsToVerify = 1;
    await staffAlerts.runDetection();
    clock.advance(4 * HOUR + 60_000);
    expect((await staffAlerts.runDetection()).reminded).toBe(1);
    expect((await staffAlerts.runDetection()).reminded).toBe(0);
  });
});
