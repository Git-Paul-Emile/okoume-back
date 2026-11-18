import webPush from 'web-push';
import { PushDeliveryError, type PushMessage, type PushSender, type PushTarget } from './pushSender.js';

const REQUEST_TIMEOUT_MS = 10_000;
/** Durée de garde chez le service push si l'appareil est éteint : 1 jour, une information plus vieille n'a plus d'intérêt */
const TTL_SECONDS = 24 * 60 * 60;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** Contact du serveur d'envoi, demandé par le protocole : mailto:… ou https://… */
  subject: string;
}

/**
 * Adapter Web Push (protocole standard, clés VAPID) : fonctionne avec les services push de Chrome, Firefox,
 * Edge et Safari sans compte chez un fournisseur. 404 et 410 signalent un appareil désabonné.
 */
export const createWebPushSender = (config: VapidConfig): PushSender => ({
  publicKey: config.publicKey,
  async send(target: PushTarget, message: PushMessage, { urgent }) {
    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        {
          vapidDetails: config,
          TTL: TTL_SECONDS,
          urgency: urgent ? 'high' : 'normal',
          timeout: REQUEST_TIMEOUT_MS,
        },
      );
      return 'sent';
    } catch (error) {
      if (error instanceof webPush.WebPushError) {
        if (error.statusCode === 404 || error.statusCode === 410) return 'gone';
        throw new PushDeliveryError(error.statusCode);
      }
      throw new PushDeliveryError(null);
    }
  },
});
