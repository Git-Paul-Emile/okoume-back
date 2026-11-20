import 'dotenv/config';
import { z } from 'zod';

/**
 * Seul point de lecture de process.env. Une variable manquante ou invalide fait échouer le démarrage,
 * au lieu de produire un undefined silencieux plus tard.
 */
const REQUIRED_OUTSIDE_DEVELOPMENT = ['RESEND_API_KEY'] as const;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Connexion de l'application. Avec Neon : l'adresse « pooled » (hôte en -pooler).
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Connexion directe, sans pooler : migrations et file de traitements. Facultative en local (même base).
    DIRECT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    // Secret de signature des jetons d'accès : 32 caractères au moins, différent par environnement
    JWT_ACCESS_SECRET: z.string().min(32),
    // Adresse du site, pour les liens envoyés par e-mail (invitation, réinitialisation)
    APP_URL: z.url(),
    // Adresse publique de l'API (https://api.okoume.ga) : liens de partage avec aperçu sur les réseaux (32.9).
    // Facultative : sans elle, les liens partagés mènent directement au site, sans aperçu.
    API_PUBLIC_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    // Domaine commun au site et à l'API (.okoume.ga) : le site lit alors le cookie anti-CSRF posé par l'API.
    // Facultatif : sans lui, les cookies restent attachés au seul domaine de l'API (développement local).
    COOKIE_DOMAIN: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^.?[a-z0-9-]+(.[a-z0-9-]+)+$/i, 'domaine attendu, par exemple .okoume.ga')
        .optional(),
    ),
    // Adresse d'expédition, sur un domaine vérifié chez Resend : « Okoumé <no-reply@okoume.ga> »
    EMAIL_FROM: z.string().min(3),
    // Clé d'API Resend (envoi seul suffit). Obligatoire hors développement et test.
    RESEND_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().startsWith('re_').optional()),
    // Notifications push (Web Push) : clés VAPID générées une fois (npx web-push generate-vapid-keys) et contact.
    // Facultatives : sans elles, les notifications push sont désactivées et seuls les e-mails partent.
    VAPID_PUBLIC_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(20).optional()),
    VAPID_PRIVATE_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(20).optional()),
    VAPID_SUBJECT: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^(mailto:|https:\/\/)/)
        .optional(),
    ),
    // Vérification des annonces par IA (Anthropic, console > API Keys). Facultative : sans clé, chaque annonce
    // soumise attend une décision humaine. Lue par le worker seulement.
    ANTHROPIC_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().startsWith('sk-ant-').optional()),
    LISTING_REVIEW_MODEL: z.string().min(3).default('claude-opus-5-5'),
    // Modèle du négociateur du tchat (32.5), même clé ; modifiable pour ajuster coût et qualité
    CHAT_MODEL: z.string().min(3).default('claude-opus-5-5'),
    // Gemini (Google AI Studio > API keys) : prioritaire sur Anthropic quand la clé est fournie. Lue par le worker.
    GEMINI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(20).optional()),
    // Alias tenu à jour par Google (vérifié dans la liste des modèles de la clé) : pas de version figée qui disparaît
    GEMINI_MODEL: z.string().min(3).default('gemini-flash-latest'),
    // Mot de passe commun des comptes de démonstration créés par le seed.
    SEED_DEMO_PASSWORD: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(12).optional()),
    ALLOW_PRODUCTION_DEMO_SEED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // Hébergement des images (Cloudinary, console > Settings > API Keys). Facultatif : sans ces trois valeurs,
    // l'envoi d'images est indisponible et seules des adresses HTTPS peuvent être saisies.
    CLOUDINARY_CLOUD_NAME: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^[a-z0-9_-]+$/i)
        .optional(),
    ),
    CLOUDINARY_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(5).optional()),
    CLOUDINARY_API_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(10).optional()),
    // Délais des retours (14.2, 14.6), en jours : un seul délai pour toute la boutique, réglé par l'exploitant
    RETURN_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(14),
    RETURN_REOPEN_DAYS: z.coerce.number().int().min(1).max(365).default(14),
    // Limitation de débit par adresse IP, sur 15 minutes. Le back-office a son propre compteur, plus large :
    // ses écrans chargent beaucoup de données et l'équipe partage souvent la même connexion.
    RATE_LIMIT_API_MAX: z.coerce.number().int().min(10).max(100_000).default(300),
    RATE_LIMIT_STAFF_MAX: z.coerce.number().int().min(10).max(100_000).default(3000),
    // Supervision des erreurs (Sentry) : sans DSN, rien n'est envoyé (développement, tests)
    SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url({ protocol: /^https$/ }).optional()),
    // Commit déployé, fourni par Render : relie une erreur à sa mise en ligne
    RENDER_GIT_COMMIT: z.string().min(7).optional(),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(z.url()).min(1)),
  })
  .superRefine((config, ctx) => {
    const vapid = [config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY, config.VAPID_SUBJECT].filter(Boolean).length;
    if (vapid !== 0 && vapid !== 3)
      ctx.addIssue({ code: 'custom', path: ['VAPID_PUBLIC_KEY'], message: 'les trois valeurs VAPID vont ensemble' });
    const cloudinary = [config.CLOUDINARY_CLOUD_NAME, config.CLOUDINARY_API_KEY, config.CLOUDINARY_API_SECRET];
    if (cloudinary.filter(Boolean).length % 3 !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUDINARY_CLOUD_NAME'],
        message: 'les trois valeurs Cloudinary vont ensemble',
      });
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') return;
    for (const key of REQUIRED_OUTSIDE_DEVELOPMENT)
      if (!config[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'obligatoire hors développement' });
  });

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    // Le logger n'est pas encore configuré à ce stade : message direct sur la sortie d'erreur
    process.stderr.write(`Configuration invalide, variables à corriger : ${fields}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
