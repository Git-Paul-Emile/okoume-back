import { pino } from 'pino';
import { seedConfig } from './config.js';

export const logger = pino({
  level: seedConfig.LOG_LEVEL,
  base: { service: 'okoza-api-seed', env: seedConfig.NODE_ENV },
  redact: { paths: ['*.password', '*.token', '*.refreshToken', '*.code'], censor: '[redacted]' },
});
