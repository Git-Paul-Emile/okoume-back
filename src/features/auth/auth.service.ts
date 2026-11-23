import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SessionExpiredError,
  UnauthorizedError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../core/security/passwords.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { phoneKey } from '../../core/text/phoneKey.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { VerificationService } from '../verification/verification.service.js';
import {
  contactChangedEmail,
  contactChangeEmail,
  existingAccountEmail,
  passwordResetEmail,
  verificationEmail,
} from './auth.emails.js';
import { toCustomerDto } from './auth.dto.js';
import type { CustomerRecord, CustomersRepository } from './auth.repository.js';
import type { ContactChangeInput, RegisterInput } from './auth.schemas.js';

/** Les 8 derniers chiffres identifient un numéro gabonais, quel que soit le format saisi. */
export { phoneKey };

const INVALID_CREDENTIALS = 'Identifiant ou mot de passe incorrect.';

export interface AuthDependencies {
  customers: CustomersRepository;
  sessions: SessionsService;
  verification: VerificationService;
  email: EmailSender;
  appUrl: string;
  now: () => Date;
}

export const createAuthService = ({ customers, sessions, verification, email, appUrl, now }: AuthDependencies) => {
  const findByIdentifier = (identifier: string) =>
    identifier.includes('@')
      ? customers.findByEmail(identifier.trim().toLowerCase())
      : customers.findByPhoneKey(phoneKey(identifier));

  async function sendVerification(customer: CustomerRecord) {
    const { code } = await verification.issue('email_verification', customer.id, customer.email);
    await email.send(verificationEmail(customer.email, customer.firstName, code));
  }

  return {
    /**
     * Inscription. La réponse est la même que l'adresse soit libre ou non : on ne révèle pas
     * l'existence d'un compte. Le titulaire d'un compte existant est prévenu par e-mail.
     */
    async register(input: RegisterInput) {
      const existing = await customers.findByEmail(input.email);
      if (existing && existing.status !== 'pending_verification') {
        await email.send(existingAccountEmail(existing.email, appUrl));
        return;
      }
      const key = input.phone ? phoneKey(input.phone) : null;
      if (key && (await customers.phoneTaken(key, existing?.id))) {
        // Numéro déjà rattaché à un autre compte : il n'est pas enregistré, l'inscription continue
        input = { ...input, phone: undefined };
      }
      const data = {
        referredById: null,
        phone: input.phone ?? null,
        phoneKey: input.phone ? key : null,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
      };
      const customer = existing
        ? await customers.updatePending(existing.id, data)
        : await customers.create({ ...data, email: input.email, referralCode: `CUS-${randomReadableCode(8)}` });
      await sendVerification(customer);
    },

    async resendVerification(address: string) {
      const customer = await customers.findByEmail(address);
      if (customer?.status === 'pending_verification') await sendVerification(customer);
    },

    /** Confirmation de l'adresse : le compte devient actif et la session s'ouvre. */
    async verifyEmail(address: string, code: string) {
      const customer = await customers.findByEmail(address);
      if (!customer || customer.status !== 'pending_verification')
        throw new NotFoundError('Aucune inscription en attente.');
      await verification.verifyLatest(customer.id, 'email_verification', code);
      const active = await customers.activate(customer.id, now());
      const tokens = await sessions.issue({ customerId: active.id });
      return { customer: toCustomerDto(active), tokens };
    },

    async login(identifier: string, password: string) {
      const customer = await findByIdentifier(identifier);
      if (!customer || customer.status === 'anonymized') {
        await burnPasswordCheck(password);
        await sessions.recordLogin({ subjectType: 'customer', subjectId: null, success: false, reason: 'unknown' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      await sessions.assertNotLocked('customer', customer.id);
      if (!(await verifyPassword(customer.passwordHash, password))) {
        await sessions.recordLogin({
          subjectType: 'customer',
          subjectId: customer.id,
          success: false,
          reason: 'password',
        });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      if (customer.status === 'pending_verification')
        throw new ForbiddenError('Confirmez d’abord votre adresse e-mail avec le code reçu.');
      await customers.touchLogin(customer.id, now());
      await sessions.recordLogin({ subjectType: 'customer', subjectId: customer.id, success: true });
      return { customer: toCustomerDto(customer), tokens: await sessions.issue({ customerId: customer.id }) };
    },

    async refresh(refreshToken: string) {
      const { owner, tokens } = await sessions.rotate(refreshToken, 'customer');
      if (!('customerId' in owner)) throw new SessionExpiredError('customer');
      const customer = await customers.findById(owner.customerId);
      if (!customer || customer.status !== 'active') throw new SessionExpiredError('customer');
      return { customer: toCustomerDto(customer), tokens };
    },

    logout: (refreshToken: string) => sessions.revoke(refreshToken),

    async me(customerId: string) {
      const customer = await customers.findById(customerId);
      if (!customer || customer.status !== 'active') throw new UnauthorizedError();
      return toCustomerDto(customer);
    },

    /** Demande de nouveau mot de passe : réponse identique que le compte existe ou non. */
    async requestPasswordReset(identifier: string) {
      const customer = await findByIdentifier(identifier);
      if (customer?.status !== 'active') return;
      const { code } = await verification.issue('password_reset', customer.id, customer.email);
      await email.send(passwordResetEmail(customer.email, customer.firstName, code));
    },

    /**
     * Changement d'e-mail ou de téléphone, étape 1 : mot de passe vérifié, coordonnée libre, puis code envoyé.
     * Un e-mail reçoit son code à la nouvelle adresse (elle est prouvée). Faute de fournisseur SMS, un téléphone
     * reçoit son code à l'adresse du compte : le titulaire est prouvé, pas le numéro.
     */
    async requestContactChange(customerId: string, input: ContactChangeInput) {
      const customer = await customers.findById(customerId);
      if (!customer || customer.status !== 'active') throw new UnauthorizedError();
      if (!(await verifyPassword(customer.passwordHash, input.password)))
        throw new UnprocessableError('Mot de passe incorrect.');
      if (input.type === 'email') {
        if (input.value === customer.email) throw new UnprocessableError('C’est déjà l’adresse de votre compte.');
        // Adresse déjà prise : même réponse, pour ne pas révéler l'existence d'un autre compte ; aucun code envoyé
        if (await customers.findByEmail(input.value)) return;
        const { code } = await verification.issue('contact_change', customer.id, `email:${input.value}`);
        await email.send(contactChangeEmail(input.value, customer.firstName, code, 'votre nouvelle adresse e-mail'));
        return;
      }
      const key = phoneKey(input.value);
      if (await customers.phoneTaken(key, customer.id))
        throw new ConflictError('Ce numéro est déjà rattaché à un autre compte.');
      const { code } = await verification.issue('contact_change', customer.id, `phone:${input.value}`);
      await email.send(contactChangeEmail(customer.email, customer.firstName, code, 'votre nouveau numéro'));
    },

    /** Étape 2 : le code confirme la coordonnée demandée ; l'ancienne adresse est prévenue du changement. */
    async confirmContactChange(customerId: string, code: string) {
      const customer = await customers.findById(customerId);
      if (!customer || customer.status !== 'active') throw new UnauthorizedError();
      // Adresse et prénom figés avant la mise à jour : l'avertissement part à l'ancienne adresse
      const previous = { email: customer.email, firstName: customer.firstName };
      const { target } = await verification.verifyLatest(customer.id, 'contact_change', code);
      const [type, ...rest] = target.split(':');
      const value = rest.join(':');
      const updated =
        type === 'email'
          ? await customers.updateContact(customer.id, { email: value })
          : await customers.updateContact(customer.id, { phone: value, phoneKey: phoneKey(value) });
      if (!updated) throw new ConflictError('Cette coordonnée vient d’être prise par un autre compte.');
      await email.send(
        contactChangedEmail(previous.email, previous.firstName, type === 'email' ? 'L’adresse e-mail' : 'Le numéro'),
      );
      return toCustomerDto(updated);
    },

    /** Nouveau mot de passe : toutes les sessions ouvertes sont fermées. */
    async confirmPasswordReset(identifier: string, code: string, password: string) {
      const customer = await findByIdentifier(identifier);
      if (customer?.status !== 'active') throw new NotFoundError('Code expiré : demandez-en un nouveau.');
      await verification.verifyLatest(customer.id, 'password_reset', code);
      await customers.updatePassword(customer.id, await hashPassword(password));
      await sessions.revokeAll({ customerId: customer.id });
    },
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
