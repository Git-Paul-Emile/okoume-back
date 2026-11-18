import type { ReviewIssue } from '../../infrastructure/ai/listingReviewer.js';
import type { SellerMessage } from '../shops/shops.emails.js';
import type { OwnerRecord } from '../shops/shops.repository.js';
import type { ListingRecord } from './listings.repository.js';

/** Messages au vendeur sur la vérification de ses annonces (32.3) : le motif est toujours donné (13.3). */

const FIELD_LABELS: Record<ReviewIssue['field'], string> = {
  title: 'Titre',
  description: 'Description',
  category: 'Catégorie',
  photos: 'Photos',
  price: 'Prix',
  location: 'Localisation',
  other: 'Autre',
};

const listingUrl = (appUrl: string, listing: ListingRecord) => `${appUrl}/vendeur/annonces/${listing.id}`;

function message(
  owner: OwnerRecord,
  listing: ListingRecord,
  appUrl: string,
  content: { subject: string; lines: string[]; title: string; body: string },
): SellerMessage {
  return {
    email: {
      to: owner.email,
      subject: content.subject,
      text: [`Bonjour ${owner.firstName},`, '', ...content.lines, '', listingUrl(appUrl, listing)].join('\n'),
    },
    push: {
      title: content.title,
      body: content.body,
      url: listingUrl(appUrl, listing),
      tag: `annonce-${listing.id}`,
    },
  };
}

export const listingPublishedMessage = (owner: OwnerRecord, listing: ListingRecord, appUrl: string) =>
  message(owner, listing, appUrl, {
    subject: `Votre annonce « ${listing.title} » est publiée`,
    lines: [`Votre annonce « ${listing.title} » est en ligne.`],
    title: 'Annonce publiée',
    body: listing.title,
  });

export const listingChangesMessage = (
  owner: OwnerRecord,
  listing: ListingRecord,
  appUrl: string,
  issues: ReviewIssue[],
  reason: string | null,
) =>
  message(owner, listing, appUrl, {
    subject: `Votre annonce « ${listing.title} » est à corriger`,
    lines: [
      `Votre annonce « ${listing.title} » demande quelques corrections avant sa publication :`,
      ...(reason ? [reason] : []),
      ...issues.map((i) => `- ${FIELD_LABELS[i.field]} : ${i.message}`),
      '',
      'Corrigez-la puis soumettez-la de nouveau depuis votre espace vendeur.',
    ],
    title: 'Annonce à corriger',
    body: listing.title,
  });

export const listingRejectedMessage = (owner: OwnerRecord, listing: ListingRecord, appUrl: string, reason: string) =>
  message(owner, listing, appUrl, {
    subject: `Votre annonce « ${listing.title} » n’a pas été acceptée`,
    lines: [`Votre annonce « ${listing.title} » ne peut pas être publiée sur Okoumé : ${reason}`],
    title: 'Annonce refusée',
    body: listing.title,
  });

export const listingHiddenMessage = (owner: OwnerRecord, listing: ListingRecord, appUrl: string, reason: string) =>
  message(owner, listing, appUrl, {
    subject: `Votre annonce « ${listing.title} » est masquée pendant un examen`,
    lines: [
      `Votre annonce « ${listing.title} » est masquée le temps d’un examen : ${reason}`,
      'Vous serez prévenu de la décision.',
    ],
    title: 'Annonce en cours d’examen',
    body: listing.title,
  });
