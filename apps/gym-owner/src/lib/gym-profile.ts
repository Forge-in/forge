import type { GymField, GymProfile } from './data/types';

/**
 * Gym profile validation.
 *
 * Pure, so the rules can be tested without a form. Each returns the hint to
 * show — the design uses ONE line under each field that doubles as the error,
 * which is why a valid field returns its static help text rather than null.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', checksum.
 *
 * Checked structurally rather than by length alone. A 15-character string of
 * the wrong shape is exactly what gets typed when someone pastes a PAN and pads
 * it, and it would sail past a length test and onto every invoice the gym
 * issues.
 */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

/** Deliberately loose: a landline, a mobile, with or without an STD code. */
const PHONE_PATTERN = /^[\d\s+()-]{8,18}$/;

export interface FieldState {
  /** The hint line under the control: help text, or the reason it is invalid. */
  hint: string;
  invalid: boolean;
}

export function validateGymField(field: GymField, value: string, help: string): FieldState {
  const trimmed = value.trim();

  // Emptiness is checked first and for every field: a blank display name or
  // address is never a valid saved state, whatever else is wrong with it.
  if (!trimmed) return { hint: 'This field cannot be empty', invalid: true };

  switch (field) {
    case 'gstin': {
      const upper = trimmed.toUpperCase();
      if (upper.length !== 15) {
        return {
          hint: `GSTIN must be exactly 15 characters (${upper.length} entered)`,
          invalid: true,
        };
      }
      if (!GSTIN_PATTERN.test(upper)) {
        return {
          hint: 'That is not a valid GSTIN — check it against your certificate',
          invalid: true,
        };
      }
      return { hint: help, invalid: false };
    }

    case 'capacity': {
      if (!/^\d+$/.test(trimmed)) return { hint: 'Numbers only', invalid: true };
      // Zero parses as a number and would silently make every check-in an
      // over-capacity warning.
      if (Number(trimmed) < 1) return { hint: 'Capacity must be at least 1', invalid: true };
      return { hint: help, invalid: false };
    }

    case 'email':
      return EMAIL_PATTERN.test(trimmed)
        ? { hint: help, invalid: false }
        : { hint: 'Enter a valid email', invalid: true };

    case 'phone':
      return PHONE_PATTERN.test(trimmed)
        ? { hint: help, invalid: false }
        : { hint: 'Enter a reachable phone number', invalid: true };

    default:
      return { hint: help, invalid: false };
  }
}

/**
 * Whether the whole profile can be saved.
 *
 * Used to disable Save rather than to reject on click: a button that refuses
 * after the fact makes the owner hunt for which of eight fields it meant, when
 * every one of them is already showing its own reason.
 */
export function isGymProfileValid(
  profile: GymProfile,
  specs: readonly { key: GymField; hint: string }[],
): boolean {
  return specs.every((spec) => !validateGymField(spec.key, profile[spec.key], spec.hint).invalid);
}
