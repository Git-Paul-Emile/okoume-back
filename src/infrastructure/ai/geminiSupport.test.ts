import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTransientGeminiError, parseJson, photoParts } from './geminiSupport.js';

const PREFIX = 'https://res.cloudinary.com/okoza/image/upload/';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('photos envoyées à Gemini', () => {
  it('ne télécharge que les photos de l’hébergeur de la boutique, jamais une autre adresse', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const parts = await photoParts(
      [`${PREFIX}listings/a.webp`, 'http://169.254.169.254/latest/meta-data', 'https://ailleurs.example/b.jpg'],
      PREFIX,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${PREFIX}listings/a.webp`, expect.anything());
    expect(parts).toEqual([
      { inlineData: { mimeType: 'image/webp', data: Buffer.from([1, 2, 3]).toString('base64') } },
    ]);
  });

  it('sans hébergeur configuré, ne télécharge rien ; écarte ce qui n’est pas une image', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await photoParts([`${PREFIX}a.webp`], null)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await photoParts([`${PREFIX}a.webp`], PREFIX)).toEqual([]);
  });
});

describe('réponses et erreurs de Gemini', () => {
  it('lit un JSON valide et rend null pour une réponse vide ou illisible', () => {
    expect(parseJson('{"intent":"answer"}')).toEqual({ intent: 'answer' });
    expect(parseJson(undefined)).toBeNull();
    expect(parseJson('Désolé, je ne peux pas.')).toBeNull();
  });

  it('reprend après une limite de débit, une panne ou une coupure réseau, pas après une requête refusée', () => {
    expect(isTransientGeminiError(new ApiError({ message: 'trop de requêtes', status: 429 }))).toBe(true);
    expect(isTransientGeminiError(new ApiError({ message: 'panne', status: 503 }))).toBe(true);
    expect(isTransientGeminiError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientGeminiError(new ApiError({ message: 'clé invalide', status: 400 }))).toBe(false);
  });
});
