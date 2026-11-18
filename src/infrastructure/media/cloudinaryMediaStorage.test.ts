import { describe, expect, it } from 'vitest';
import { createCloudinaryMediaStorage, signParams } from './cloudinaryMediaStorage.js';

describe('signature des envois Cloudinary', () => {
  it('reproduit l’exemple de la documentation Cloudinary', () => {
    expect(signParams({ timestamp: '1315060510' }, 'abcd')).toBe('a21ad0f63beb4de2e5575204b79ab90bffb02c10');
  });

  it('signe les paramètres triés par nom, quel que soit leur ordre', () => {
    expect(signParams({ timestamp: '1', asset_folder: 'a' }, 's')).toBe(
      signParams({ asset_folder: 'a', timestamp: '1' }, 's'),
    );
  });

  it('fixe le dossier de l’environnement, les formats d’image et une validité d’une heure', () => {
    const storage = createCloudinaryMediaStorage({
      cloudName: 'okoume',
      apiKey: '123456',
      apiSecret: 'secret-de-test',
      rootFolder: 'okoume/staging',
    });
    const upload = storage.signUpload('products', new Date('2026-11-04T10:00:00.500Z'));
    expect(upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/okoume/image/upload');
    expect(upload.fields).toMatchObject({
      api_key: '123456',
      asset_folder: 'okoume/staging/products',
      allowed_formats: 'jpg,jpeg,png,webp,avif',
      timestamp: String(Date.parse('2026-11-04T10:00:00Z') / 1000),
    });
    const { api_key: _key, signature, ...signed } = upload.fields;
    void _key;
    expect(signature).toBe(signParams(signed, 'secret-de-test'));
    expect(upload.expiresAt.toISOString()).toBe('2026-11-04T11:00:00.000Z');
    expect(JSON.stringify(upload)).not.toContain('secret-de-test');
  });
});
