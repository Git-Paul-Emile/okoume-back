import { prisma } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface CustomerRecord {
  id: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'anonymized';
  createdAt: Date;
}

/** Colonnes lues pour un compte client, partagées avec la gestion du compte (features/account). */
export const customerColumns = {
  id: true,
  email: true,
  phone: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
} as const;
const columns = customerColumns;

export interface NewCustomer {
  email: string;
  phone: string | null;
  phoneKey: string | null;
  passwordHash: string;
  firstName: string;
  lastName: string;
}

export const customersRepository: CustomersRepository = {
  findByEmail: (email: string): Promise<CustomerRecord | null> =>
    prisma.customer.findUnique({ where: { email }, select: columns }),

  findByPhoneKey: (phoneKey: string): Promise<CustomerRecord | null> =>
    prisma.customer.findUnique({ where: { phoneKey }, select: columns }),

  findById: (id: string): Promise<CustomerRecord | null> =>
    prisma.customer.findUnique({ where: { id }, select: columns }),

  create: (data: NewCustomer): Promise<CustomerRecord> =>
    prisma.customer.create({ data: { ...data, status: 'active' }, select: columns }),

  touchLogin: (id: string, at: Date) =>
    prisma.customer.update({ where: { id }, data: { lastLoginAt: at }, select: { id: true } }),

  /** Le numéro est-il déjà utilisé par un autre compte ? */
  async phoneTaken(phoneKey: string, exceptId?: string) {
    const found = await prisma.customer.findUnique({ where: { phoneKey }, select: { id: true } });
    return !!found && found.id !== exceptId;
  },

  async updateContact(id, change) {
    try {
      return await prisma.customer.update({ where: { id }, data: change, select: customerColumns });
    } catch (error) {
      // Contrainte d'unicité : la coordonnée vient d'être prise par un autre compte
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    }
  },
};

/** Contrat de stockage des comptes clients. */
export interface CustomersRepository {
  findByEmail(email: string): Promise<CustomerRecord | null>;
  findByPhoneKey(phoneKey: string): Promise<CustomerRecord | null>;
  findById(id: string): Promise<CustomerRecord | null>;
  create(data: NewCustomer): Promise<CustomerRecord>;
  touchLogin(id: string, at: Date): Promise<unknown>;
  phoneTaken(phoneKey: string, exceptId?: string): Promise<boolean>;
  /** Nouvelle coordonnée ; null si elle a été prise par un autre compte entre-temps. */
  updateContact(
    id: string,
    change: { email: string } | { phone: string; phoneKey: string },
  ): Promise<CustomerRecord | null>;
}
