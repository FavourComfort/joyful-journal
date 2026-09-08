// ---------------------------------------------------------------------------
// Ugandan mobile phone number helpers.
//
// A valid Ugandan mobile number is a 7-prefix mobile with 8 digits after the
// prefix, written as one of:
//   07XXXXXXXX        (local, 10 digits)
//   2567XXXXXXXX      (international, no +)
//   +2567XXXXXXXX     (international, with +)
//
// This must match the pattern used in payments.service.ts, so a number that
// passes signup validation can never be rejected at payment time.
// ---------------------------------------------------------------------------

const UGANDA_MOBILE_PATTERN = /^(?:\+?256|0)(7\d{8})$/;

/** True if `value` is a valid Ugandan mobile number in any accepted format. */
export function isValidUgandaPhone(value: string): boolean {
  return UGANDA_MOBILE_PATTERN.test((value || "").trim());
}

/**
 * Normalize a valid Ugandan mobile number to +2567XXXXXXXX (the format
 * MarzPay expects). Returns null if the number is invalid.
 */
export function normalizeUgandaPhone(value: string): string | null {
  const match = UGANDA_MOBILE_PATTERN.exec((value || "").trim());
  return match ? `+256${match[1]}` : null;
}
