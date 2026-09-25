/**
 * How a payment is made. Kept apart from the zod schemas so client
 * components can import the list without shipping the validation library.
 */
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
