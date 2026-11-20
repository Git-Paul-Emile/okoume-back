import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DIRECT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  SEED_DEMO_PASSWORD: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(12).optional()),
  SEED_DEMO_BACKUP_CODES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ALLOW_PRODUCTION_DEMO_SEED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Configuration du seed invalide : ${fields}`);
}

export const seedConfig = result.data;
