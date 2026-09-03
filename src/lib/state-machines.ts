/**
 * State machines for the booking / escrow domain.
 *
 * These rules are the single source of truth for which status transitions are
 * legal. They are enforced in **three** places so a transition can never slip
 * through:
 *
 *   1. The TypeScript service layer (guards every `.update()` call),
 *   2. Database trigger functions (raise an exception on illegal transitions),
 *   3. The RPC transaction functions (raise/respond/adjudicate a dispute).
 *
 * Keep every transition here in sync with the SQL CHECK constraints and the
 * trigger functions in `db/escrow_schema.sql` / `db/disputes.sql`.
 */

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed";

export type PaymentStatus =
  | "pending"
  | "escrowed"
  | "released"
  | "failed"
  | "refunded"
  | "disputed";

export type DisputeStatus =
  | "open" // customer raised, awaiting the provider
  | "provider_responded" // provider replied, awaiting adjudication
  | "resolved_customer" // admin refunded the customer (booking cancelled)
  | "resolved_provider" // admin released funds to the provider (booking completed)
  | "closed"; // review closed with no action taken

// ---------------------------------------------------------------------------
// Booking lifecycle
// ---------------------------------------------------------------------------
//   pending ──▶ confirmed ──▶ in_progress ──▶ completed
//                │   │           │
//                │   └───────────┴──────────▶ cancelled
//                └──────────────────────────▶ disputed (customer raises dispute)
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "completed", "cancelled", "disputed"],
  in_progress: ["completed", "cancelled", "disputed"],
  completed: [],
  cancelled: [],
  disputed: [],
};

// ---------------------------------------------------------------------------
// Payment lifecycle (escrow)
// ---------------------------------------------------------------------------
//   pending ──▶ escrowed ──▶ released
//                 │  │
//                 │  ├──────────▶ refunded
//                 │  └──────────▶ disputed ──▶ released | refunded
//                 └────────────▶ failed
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["escrowed", "failed"],
  escrowed: ["released", "refunded", "disputed", "failed"],
  released: [],
  refunded: [],
  failed: [],
  disputed: ["released", "refunded"],
};

// ---------------------------------------------------------------------------
// Dispute lifecycle
// ---------------------------------------------------------------------------
//   open ──▶ provider_responded ──▶ resolved_customer | resolved_provider
//   open ──▶ resolved_customer | resolved_provider (admin acts without response)
export const DISPUTE_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  open: ["provider_responded", "resolved_customer", "resolved_provider"],
  provider_responded: ["resolved_customer", "resolved_provider"],
  resolved_customer: [],
  resolved_provider: [],
  closed: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionDispute(from: DisputeStatus, to: DisputeStatus): boolean {
  return DISPUTE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Returns a human-readable error when a booking transition is illegal. */
export function bookingTransitionError(
  from: BookingStatus,
  to: BookingStatus
): string | null {
  if (canTransitionBooking(from, to)) return null;
  return `Invalid booking status transition: "${from}" → "${to}". Allowed from "${from}": ${
    BOOKING_TRANSITIONS[from].join(", ") || "(none — terminal state)"
  }`;
}

/** Returns a human-readable error when a payment transition is illegal. */
export function paymentTransitionError(
  from: PaymentStatus,
  to: PaymentStatus
): string | null {
  if (canTransitionPayment(from, to)) return null;
  return `Invalid payment status transition: "${from}" → "${to}". Allowed from "${from}": ${
    PAYMENT_TRANSITIONS[from].join(", ") || "(none — terminal state)"
  }`;
}

/** Guard used by the service layer: throws when the transition is illegal. */
export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus
): void {
  const error = bookingTransitionError(from, to);
  if (error) throw new Error(error);
}

/** Guard used by the service layer: throws when the transition is illegal. */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  const error = paymentTransitionError(from, to);
  if (error) throw new Error(error);
}

export default {};
