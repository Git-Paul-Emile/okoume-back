import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from './errorHandler.js';
import { validate } from './validate.js';

describe('validation des requêtes', () => {
  it('renvoie des messages clairs en français, jamais le texte technique de zod', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/x',
      validate({ body: z.strictObject({ name: z.string(), email: z.email(), qty: z.int().min(1) }) }),
      (_req, res) => {
        res.status(204).end();
      },
    );
    app.use(errorHandler);
    const res = await request(app).post('/x').send({ email: 'pas-un-email', qty: 0 });
    expect(res.status).toBe(400);
    const messages = (res.body.errors as Array<{ field: string; message: string }>).map((e) => e.message);
    expect(messages).toEqual([
      'Ce champ est obligatoire.',
      'Adresse e-mail invalide.',
      'La valeur doit être au moins 1.',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/Invalid input|expected|received/);
  });
});
