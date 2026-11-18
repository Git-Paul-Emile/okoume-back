import {
  ReviewUnavailableError,
  type ListingReviewer,
  type ListingToReview,
  type ReviewVerdict,
} from './listingReviewer.js';

/** Implémentation de test : avis réglable, annonces examinées gardées, panne simulable. */
export function createFakeListingReviewer() {
  let next: Omit<ReviewVerdict, 'model'> = { outcome: 'approved', issues: [] };
  let unavailable = false;
  const reviewed: ListingToReview[] = [];
  const reviewer: ListingReviewer = {
    async review(listing) {
      if (unavailable) throw new ReviewUnavailableError(new Error('panne simulée'));
      reviewed.push(listing);
      return { ...next, model: 'modele-de-test' };
    },
  };
  return {
    reviewer,
    reviewed,
    answer: (verdict: Omit<ReviewVerdict, 'model'>) => {
      next = verdict;
    },
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
  };
}
