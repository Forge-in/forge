import { MEMBERS, MEMBERSHIP_PLANS, TRAINER_OPTIONS } from './data';
import type { PayMode } from './data/types';
import { rupees, subscriberNumber } from './format';

/**
 * Desk registration: the form's shape, and every rule that decides whether it
 * can be submitted.
 *
 * Pure and free of React on purpose. This is the one place in the console where
 * a mistake creates a real-world problem — a duplicate member record, a fee
 * collected against the wrong plan, a phone number that reminders will never
 * reach — so the rules are stated where they can be unit-tested exhaustively
 * rather than clicked through.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

export const REGISTRATION_FIELDS = ['name', 'phone', 'email', 'dob', 'address', 'start'] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

export interface RegistrationForm extends Record<RegistrationField, string> {
  /** The plan's id, or '' before one is chosen. */
  planId: string;
  trainerId: string;
  mode: PayMode;
}

export const REGISTRATION_FIELD_SPECS: readonly {
  key: RegistrationField;
  label: string;
  placeholder: string;
  hint: string;
  /** `tel` gets the numeric keypad on a desk tablet; `email` gets the @ key. */
  inputMode?: 'tel' | 'email' | 'numeric';
  autoComplete?: string;
}[] = [
  {
    key: 'name',
    label: 'Full name',
    placeholder: 'As on ID proof',
    hint: 'Required',
    autoComplete: 'name',
  },
  {
    key: 'phone',
    label: 'Phone',
    placeholder: '10 digits',
    hint: 'Becomes their login',
    inputMode: 'tel',
    autoComplete: 'tel',
  },
  {
    key: 'email',
    label: 'Email',
    placeholder: 'Optional',
    hint: 'For receipts',
    inputMode: 'email',
    autoComplete: 'email',
  },
  {
    key: 'dob',
    label: 'Date of birth',
    placeholder: 'DD/MM/YYYY',
    hint: 'Under 16 needs a guardian',
    inputMode: 'numeric',
  },
  {
    key: 'address',
    label: 'Address',
    placeholder: 'Area is enough',
    hint: 'Optional',
    autoComplete: 'street-address',
  },
  {
    key: 'start',
    label: 'Joining date',
    placeholder: 'DD/MM/YYYY',
    hint: 'Plan is pro-rated from here',
    inputMode: 'numeric',
  },
];

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Which control an error belongs to.
 *
 * The source design worked out which field to highlight by searching the error
 * *text* for a substring — `errs.indexOf('Full name') >= 0`. That couples the
 * highlight to the copy, so rewording a message silently stops highlighting the
 * field it describes. A key cannot drift from what it names.
 */
export type RegistrationErrorField = RegistrationField | 'plan' | 'mode';

export interface RegistrationError {
  field: RegistrationErrorField;
  message: string;
  /**
   * A warning the owner can override by submitting again, rather than a rule
   * they must satisfy. Exactly one of these exists — "Pay later" — and it is
   * confirmable because sometimes a member genuinely does pay tomorrow.
   */
  confirmable?: boolean;
}

/** Deliberately permissive: reject an obvious typo, never a valid address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Indian mobile numbers are ten digits and start 6-9. */
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** Below this age a guardian has to co-sign, so the desk is warned. */
const GUARDIAN_AGE = 16;

/**
 * Parses DD/MM/YYYY into a UTC date, or null.
 *
 * The round-trip check is what rejects 31/02/2026: `Date.UTC` happily rolls it
 * forward to 3 March, and a regex alone cannot tell the difference between a
 * date that exists and one that merely has the right number of digits.
 */
export function parseDayMonthYear(value: string): Date | null {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Whole years between two dates, birthday-accurate. */
export function yearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const monthDelta = to.getUTCMonth() - from.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && to.getUTCDate() < from.getUTCDate())) years -= 1;
  return years;
}

export function findPlan(planId: string) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === planId);
}

export function findTrainer(trainerId: string) {
  return TRAINER_OPTIONS.find((trainer) => trainer.id === trainerId);
}

/** The amount the desk collects now. A trial is legitimately zero. */
export function registrationAmount(form: RegistrationForm): number {
  return findPlan(form.planId)?.amount ?? 0;
}

export interface ValidationOptions {
  /** Injected so the age and future-date rules are testable without mocking. */
  now?: Date;
  /** The existing roll, for the duplicate check. */
  members?: readonly { name: string; phone: string }[];
}

/**
 * Every reason this registration cannot be filed, in the order the form reads.
 *
 * Returns a list rather than the first failure: someone at a desk with a member
 * in front of them should be told everything that is wrong once, not made to
 * resubmit five times.
 */
export function validateRegistration(
  form: RegistrationForm,
  { now = new Date(), members = MEMBERS }: ValidationOptions = {},
): RegistrationError[] {
  const errors: RegistrationError[] = [];

  /* --- Identity ------------------------------------------------------- */

  if (!form.name.trim()) {
    errors.push({ field: 'name', message: 'Full name is required.' });
  }

  const digits = subscriberNumber(form.phone);
  const allDigits = form.phone.replace(/\D/g, '');

  if (!allDigits) {
    errors.push({
      field: 'phone',
      message: 'Phone number is required — it is the member’s login and reminder channel.',
    });
  } else if (allDigits.length < 10 || allDigits.length > 12) {
    errors.push({
      field: 'phone',
      message: `Phone must be 10 digits (entered ${allDigits.length}).`,
    });
  } else if (!MOBILE_PATTERN.test(digits)) {
    errors.push({
      field: 'phone',
      message: 'That is not a mobile number — Indian mobiles start with 6, 7, 8 or 9.',
    });
  } else {
    const duplicate = members.find((member) => subscriberNumber(member.phone) === digits);
    if (duplicate) {
      errors.push({
        field: 'phone',
        message: `This number already belongs to ${duplicate.name} — open that profile instead of creating a duplicate.`,
      });
    }
  }

  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    errors.push({ field: 'email', message: 'Email looks incomplete.' });
  }

  /* --- Dates ---------------------------------------------------------- */

  if (form.dob.trim()) {
    const dob = parseDayMonthYear(form.dob);
    if (!dob) {
      errors.push({ field: 'dob', message: 'Date of birth must be a real date, as DD/MM/YYYY.' });
    } else if (dob.getTime() > now.getTime()) {
      errors.push({ field: 'dob', message: 'Date of birth cannot be in the future.' });
    } else if (yearsBetween(dob, now) < GUARDIAN_AGE) {
      errors.push({
        field: 'dob',
        message: `Under ${GUARDIAN_AGE} — a guardian has to co-sign before access is granted.`,
        confirmable: true,
      });
    }
  }

  /*
   * The joining date is REQUIRED even though it is prefilled: it is what the
   * plan is pro-rated from, so an emptied box has to stop the form rather than
   * quietly bill from today.
   */
  if (!form.start.trim()) {
    errors.push({
      field: 'start',
      message: 'Joining date is required — the plan pro-rates from it.',
    });
  } else if (!parseDayMonthYear(form.start)) {
    errors.push({ field: 'start', message: 'Joining date must be a real date, as DD/MM/YYYY.' });
  }

  /* --- Plan and payment ----------------------------------------------- */

  const plan = findPlan(form.planId);
  if (!plan) {
    errors.push({
      field: 'plan',
      message: 'Pick a plan — a member cannot be created without one.',
    });
  }

  if (form.mode === 'Pay later' && (plan?.amount ?? 0) > 0) {
    errors.push({
      field: 'mode',
      // The amount is the whole point of the confirmation: "an outstanding
      // due" is not a decision anyone can make, "an outstanding due of ₹2,300"
      // is.
      message: `Pay later creates an outstanding due of ${rupees(plan?.amount ?? 0)}. Confirm again to accept.`,
      confirmable: true,
    });
  }

  return errors;
}

/**
 * Can this be submitted?
 *
 * Blocking errors always stop it. Confirmable ones stop the FIRST attempt only:
 * showing the warning and then accepting the same click would mean the owner
 * never actually saw it.
 */
export function canSubmitRegistration(
  errors: readonly RegistrationError[],
  alreadyWarned: boolean,
): boolean {
  if (errors.some((error) => !error.confirmable)) return false;
  if (errors.length === 0) return true;
  return alreadyWarned;
}

/** The fields to highlight, derived from the errors rather than from their text. */
export function invalidFields(errors: readonly RegistrationError[]): Set<RegistrationErrorField> {
  return new Set(errors.map((error) => error.field));
}
