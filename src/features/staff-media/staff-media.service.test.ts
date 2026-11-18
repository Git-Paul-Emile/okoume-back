import { describe, expect, it } from 'vitest';
import { createFakeMediaStorage } from '../../infrastructure/media/fakeMediaStorage.js';
import { createStaffMediaService } from './staff-media.service.js';

const now = () => new Date('2026-11-04T10:00:00.000Z');
const catalogManager = { role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const stockManager = { role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };

describe('autorisations d’envoi d’images', () => {
  it('signe un envoi pour qui gère le catalogue', () => {
    const upload = createStaffMediaService(createFakeMediaStorage(), now).signUpload('products', catalogManager);
    expect(upload).toMatchObject({ uploadUrl: 'https://medias.test/upload', expiresAt: '2026-11-04T11:00:00.000Z' });
  });

  it('refuse sans le droit catalogue:modifier', () => {
    expect(() => createStaffMediaService(createFakeMediaStorage(), now).signUpload('products', stockManager)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('répond 503 tant que l’hébergement n’est pas configuré', () => {
    expect(() => createStaffMediaService(null, now).signUpload('banners', catalogManager)).toThrow(
      expect.objectContaining({ status: 503 }),
    );
  });
});
