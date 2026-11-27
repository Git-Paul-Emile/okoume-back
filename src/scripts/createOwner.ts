import { parseArgs } from 'node:util';
import { z } from 'zod';
import { env } from '../config/env.js';
import { randomToken, sha256 } from '../core/security/secrets.js';
import { prisma } from '../lib/prisma.js';

const INVITE_DAYS = 7;

/**
 * Premier administrateur principal d'une base sans compte de l'équipe (production : le seed n'en crée aucun).
 * npm run staff:create-owner -- --email awa@okoza.ga --first-name Awa --last-name Ndong
 *
 * Le compte est créé « invité » : le lien affiché mène au parcours d'invitation habituel, où le titulaire
 * choisit son mot de passe. Refusé si un administrateur principal actif existe :
 * les suivants s'invitent depuis le back-office.
 */
const input = z
  .object({
    email: z
      .string({ error: 'Adresse e-mail manquante.' })
      .trim()
      .pipe(z.email('Adresse e-mail invalide.'))
      .transform((v) => v.toLowerCase()),
    'first-name': z.string({ error: 'Prénom manquant.' }).trim().min(1, 'Prénom manquant.'),
    'last-name': z.string({ error: 'Nom manquant.' }).trim().min(1, 'Nom manquant.'),
  })
  .safeParse(
    parseArgs({
      options: {
        email: { type: 'string' },
        'first-name': { type: 'string' },
        'last-name': { type: 'string' },
      },
    }).values,
  );

if (!input.success) {
  process.stderr.write(
    `Paramètres invalides : ${input.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}\n` +
      'Usage : npm run staff:create-owner -- --email … --first-name … --last-name …\n',
  );
  process.exit(1);
}

try {
  if ((await prisma.staffMember.count({ where: { status: 'active' } })) > 0) {
    process.stderr.write('Un administrateur principal actif existe déjà : invitez depuis le back-office (Équipe).\n');
    process.exit(1);
  }
  const token = randomToken();
  const created = await prisma.staffMember.createMany({
    data: [{
      email: input.data.email,
      firstName: input.data['first-name'],
      lastName: input.data['last-name'],
      inviteTokenHash: sha256(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
    }],
    skipDuplicates: true,
  });
  if (created.count !== 1) {
    process.stderr.write('Cette adresse appartient déjà à un membre de l’équipe.\n');
    process.exit(1);
  }
  // Le lien n'est montré qu'ici, une seule fois : seule son empreinte est gardée en base
  process.stdout.write(
    `Administrateur principal invité : ${input.data.email}\n` +
      `Lien d'activation, valable ${INVITE_DAYS} jours, à usage unique :\n${env.APP_URL}/admin/invitation/${token}\n`,
  );
} finally {
  await prisma.$disconnect();
}
