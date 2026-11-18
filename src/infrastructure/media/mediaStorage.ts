/**
 * Hébergement des images de la boutique, dans le vocabulaire du métier (rules/10-stack/external-services.md).
 * Le navigateur envoie le fichier directement à l'hébergeur avec une autorisation signée par l'API : l'image ne
 * transite pas par le serveur, et seul un membre de l'équipe autorisé obtient une signature.
 */
/** returns, support : photos jointes par un client à une demande de retour (14.2) ou d'assistance (15) */
export const MEDIA_FOLDERS = [
  'products',
  'categories',
  'banners',
  'listings',
  'returns',
  'support',
  'reviews',
] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

/** Formulaire d'envoi à reproduire tel quel : champs à joindre au fichier, dans un POST multipart vers uploadUrl. */
export interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface MediaStorage {
  signUpload(folder: MediaFolder, now: Date): SignedUpload;
  /** true pour une image servie par cet hébergeur : une photo vérifiée ne peut pas être remplacée ailleurs */
  isHostedUrl(url: string): boolean;
  /**
   * Reprise d'une image existante par le serveur (adresse HTTPS ou contenu en data URI), rendue avec son adresse
   * chez l'hébergeur. Rejouable : une même source donne toujours la même image, sans doublon.
   */
  importImage(source: string, folder: MediaFolder): Promise<string>;
}
