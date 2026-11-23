import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'prisma/**/*.test.ts'],
    // Variables minimales pour démarrer l'application en test, sans secret réel
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5433/okoza_test',
      CORS_ORIGINS: 'http://localhost:5173',
      JWT_ACCESS_SECRET: 'secret-de-test-uniquement-0123456789abcdef',
      APP_URL: 'http://localhost:5173',
      EMAIL_FROM: 'OKOZA <no-reply@okoza.test>',
      LOG_LEVEL: 'silent',
      // Vides ici pour que le .env du développeur (clés réelles, réglages) n'influence jamais les tests
      RESEND_API_KEY: '',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
      SEED_DEMO_PASSWORD: '',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
    },
    sequence: { shuffle: true },
  },
});
