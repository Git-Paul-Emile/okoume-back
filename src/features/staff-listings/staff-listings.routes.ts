import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffListingsController } from './staff-listings.controller.js';
import {
  listingDecisionBody,
  listListingsQuery,
  listReportsQuery,
  reportDecisionBody,
} from './staff-listings.schemas.js';
import type { StaffListingsService } from './staff-listings.service.js';

/**
 * Modération des annonces, sous /staff/listings, et des signalements, sous /staff/listing-reports ; droits
 * vendeurs:* vérifiés par le service.
 */
export const createStaffListingsRoutes = (
  service: StaffListingsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffListingsController(service);
  const staffOnly = requireStaff(authenticator, now);

  const listings = Router();
  listings.use(staffOnly);
  listings.get('/', validate({ query: listListingsQuery }), asyncHandler(c.list));
  listings.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  listings.patch('/:id', validate({ params: idParam, body: listingDecisionBody }), asyncHandler(c.decide));

  const reports = Router();
  reports.use(staffOnly);
  reports.get('/', validate({ query: listReportsQuery }), asyncHandler(c.reports));
  reports.patch('/:id', validate({ params: idParam, body: reportDecisionBody }), asyncHandler(c.decideReport));

  return { listings, reports };
};
