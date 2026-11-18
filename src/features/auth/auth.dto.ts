/** Compte client tel qu'exposé au front : jamais d'empreinte de mot de passe ni de champ interne. */
export interface CustomerDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  /** Code à partager pour parrainer (12.5) */
  referralCode: string;
  /** Date d'anniversaire au format AAAA-MM-JJ, modifiable sous /loyalty/preferences */
  birthDate: string | null;
  birthdayChoice: 'points' | 'code';
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
  referralCode: c.referralCode,
  birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
  birthdayChoice: c.birthdayChoice,
  createdAt: c.createdAt.toISOString(),
});
