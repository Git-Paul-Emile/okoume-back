import { ConflictError, SessionExpiredError, UnauthorizedError } from '../../core/errors/AppError.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../core/security/passwords.js';
import { phoneKey } from '../../core/text/phoneKey.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { toCustomerDto } from './auth.dto.js';
import type { CustomersRepository } from './auth.repository.js';
import type { ContactChangeInput, RegisterInput } from './auth.schemas.js';

/** Les 8 derniers chiffres identifient un numéro gabonais, quel que soit le format saisi. */
export { phoneKey };

const INVALID_CREDENTIALS = 'Identifiant ou mot de passe incorrect.';

export interface AuthDependencies {
  customers: CustomersRepository;
  sessions: SessionsService;
  now: () => Date;
}

export const createAuthService = ({ customers, sessions, now }: AuthDependencies) => {
  const findByIdentifier = (identifier: string) =>
    identifier.includes('@')
      ? customers.findByEmail(identifier.trim().toLowerCase())
      : customers.findByPhoneKey(phoneKey(identifier));

  return {
    async register(input: RegisterInput) {
      const existing = await customers.findByEmail(input.email);
      if (existing)
        throw new ConflictError('Cette adresse e-mail est déjà associée à un compte.');

      const key = input.phone ? phoneKey(input.phone) : null;
      const phone = key && (await customers.phoneTaken(key)) ? undefined : input.phone;
      const data = {
        phone: phone ?? null,
        phoneKey: phone ? key : null,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
      };
      const customer = await customers.create({ ...data, email: input.email });
      await customers.touchLogin(customer.id, now());
      await sessions.recordLogin({ subjectType: 'customer', subjectId: customer.id, success: true });
      return { customer: toCustomerDto(customer), tokens: await sessions.issue({ customerId: customer.id }) };
    },

    async login(identifier: string, password: string) {
      const found = await findByIdentifier(identifier);
      if (!found || found.status === 'anonymized') {
        await burnPasswordCheck(password);
        await sessions.recordLogin({ subjectType: 'customer', subjectId: null, success: false, reason: 'unknown' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      await sessions.assertNotLocked('customer', found.id);
      if (!(await verifyPassword(found.passwordHash, password))) {
        await sessions.recordLogin({ subjectType: 'customer', subjectId: found.id, success: false, reason: 'password' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      const customer = found;
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

    async changeContact(customerId: string, input: ContactChangeInput) {
      const customer = await customers.findById(customerId);
      if (!customer || customer.status !== 'active') throw new UnauthorizedError();
      if (input.type === 'email') {
        if (input.value === customer.email) return toCustomerDto(customer);
        const taken = await customers.findByEmail(input.value);
        if (taken && taken.id !== customer.id) throw new ConflictError('Cette adresse e-mail est déjà utilisée.');
        const updated = await customers.updateContact(customer.id, { email: input.value });
        if (!updated) throw new ConflictError('Cette adresse e-mail vient d’être prise par un autre compte.');
        return toCustomerDto(updated);
      }

      const key = phoneKey(input.value);
      if (await customers.phoneTaken(key, customer.id)) throw new ConflictError('Ce numéro est déjà utilisé.');
      const updated = await customers.updateContact(customer.id, { phone: input.value, phoneKey: key });
      if (!updated) throw new ConflictError('Ce numéro vient d’être pris par un autre compte.');
      return toCustomerDto(updated);
    },
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
