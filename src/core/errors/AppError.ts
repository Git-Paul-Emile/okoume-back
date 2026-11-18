/**
 * Erreurs métier. Le service lève une erreur qui décrit le problème ; le middleware d'erreur
 * la traduit en code HTTP. Le message est destiné à l'utilisateur, en français, sans détail technique.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: ReadonlyArray<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    details: ReadonlyArray<{ field: string; message: string }>,
    message = 'Certaines données sont invalides.',
  ) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentification requise.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** Session refusée ou expirée : le middleware d'erreur efface aussi les cookies de cette session. */
export class SessionExpiredError extends AppError {
  constructor(readonly audience: 'customer' | 'staff') {
    super('Session expirée. Reconnectez-vous.', 401, 'SESSION_EXPIRED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Vous n’avez pas accès à cette ressource.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(message, 422, 'UNPROCESSABLE');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service momentanément indisponible.') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
