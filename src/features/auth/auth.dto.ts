/** Compte client tel qu'exposé au front : jamais d'empreinte de mot de passe ni de champ interne. */
export interface CustomerDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export const toCustomerDto = (c: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerifiedAt: Date | null;
  referralCode: string;
  birthDate: Date | null;
  birthdayChoice: 'points' | 'code';
  createdAt: Date;
}): CustomerDto => ({
  id: c.id,
  email: c.email,
  firstName: c.firstName,
  lastName: c.lastName,
  phone: c.phone,
  emailVerified: !!c.emailVerifiedAt,
  emailVerifiedAt: c.emailVerifiedAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
});
