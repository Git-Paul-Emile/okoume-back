import type { StaffAlertsService } from '../features/staff-alerts/staff-alerts.service.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Détection des alertes (17.6). Rejouable : un dossier existant est mis à jour, jamais dupliqué. */
export const createAlertsDetectionHandler =
  (alerts: StaffAlertsService) => async (jobs: Array<QueuedJob<'alerts.detect'>>) => {
    // Plusieurs déclenchements regroupés : un seul passage suffit, il lit l'état courant
    if (!jobs.length) return;
    const result = await alerts.runDetection();
    logger.info(result, 'Alertes détectées');
  };
