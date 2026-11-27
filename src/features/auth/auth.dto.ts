/** Public customer profile; password and internal account fields are never returned. */
export interface CustomerDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
}

export const toCustomerDto = (customer: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: Date;
}): CustomerDto => ({
  id: customer.id,
  email: customer.email,
  firstName: customer.firstName,
  lastName: customer.lastName,
  phone: customer.phone,
  createdAt: customer.createdAt.toISOString(),
});
