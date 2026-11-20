import { normalizeBackupCode, sha256 } from '../../core/security/secrets.js';

export const BACKUP_CODE_COUNT = 8;

export const hashBackupCode = (code: string) => sha256(normalizeBackupCode(code));
