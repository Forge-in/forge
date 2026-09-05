import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_PLANS } from './data';
import {
  canSubmitRegistration,
  invalidFields,
  parseDayMonthYear,
  registrationAmount,
  validateRegistration,
  yearsBetween,
  type RegistrationForm,
} from './registration';

/** 19 Aug 2026 — the day the whole dataset is written against. */
const NOW = new Date(Date.UTC(2026, 7, 19));

const VALID: RegistrationForm = {
  name: 'Sneha Kale',
  phone: '9876500011',
  email: 'sneha@example.com',
  dob: '14/03/1996',
  address: 'Baner',
  start: '19/08/2026',
  planId: 'monthly-gym',
  trainerId: 'none',
  mode: 'UPI',
};

function validate(overrides: Partial<RegistrationForm> = {}) {
  return validateRegistration({ ...VALID, ...overrides }, { now: NOW });
}

function fieldsWithErrors(overrides: Partial<RegistrationForm> = {}) {
  return [...invalidFields(validate(overrides))];
}

describe('parseDayMonthYear', () => {
  it('parses a real date', () => {
    expect(parseDayMonthYear('14/03/1996')?.toISOString()).toBe('1996-03-14T00:00:00.000Z');
  });

  /**
   * The round-trip check is the whole point: `Date.UTC(2026, 1, 31)` silently
   * rolls forward to 3 March, so a regex alone cannot tell a date that exists
   * from one that merely has the right number of digits.
   */
  it.each(['31/02/2026', '32/01/2026', '01/13/2026', '00/01/2026', '01/00/2026'])(
    'rejects the impossible date %s',
    (value) => {
      expect(parseDayMonthYear(value)).toBeNull();
    },
  );

  it.each(['1/3/1996', '1996-03-14', '14-03-1996', '', 'not a date'])(
    'rejects the malformed value %s',
    (value) => {
      expect(parseDayMonthYear(value)).toBeNull();
    },
  );

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(parseDayMonthYear('29/02/2024')).not.toBeNull();
    expect(parseDayMonthYear('29/02/2025')).toBeNull();
  });
});

describe('yearsBetween', () => {
  it('counts whole years', () => {
    expect(yearsBetween(new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2026, 0, 1)))).toBe(26);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(yearsBetween(new Date(Date.UTC(2000, 11, 31)), new Date(Date.UTC(2026, 0, 1)))).toBe(25);
  });

  it('counts the birthday itself', () => {
    expect(yearsBetween(new Date(Date.UTC(2010, 7, 19)), NOW)).toBe(16);
  });
});

describe('registrationAmount', () => {
  it('reads the amount from the plan record, never from its label', () => {
    expect(registrationAmount(VALID)).toBe(2300);
  });

  it('is zero for the free trial', () => {
    expect(registrationAmount({ ...VALID, planId: 'trial-7' })).toBe(0);
  });

  it('is zero when no plan is chosen', () => {
    expect(registrationAmount({ ...VALID, planId: '' })).toBe(0);
  });

  it('agrees with the plan catalogue for every plan', () => {
    for (const plan of MEMBERSHIP_PLANS) {
      expect(registrationAmount({ ...VALID, planId: plan.id })).toBe(plan.amount);
    }
  });
});

describe('validateRegistration', () => {
  it('accepts a complete, correct form', () => {
    expect(validate()).toEqual([]);
  });

  /* --- Name ------------------------------------------------------------ */

  it('requires a name', () => {
    expect(fieldsWithErrors({ name: '' })).toContain('name');
  });

  it('treats a whitespace-only name as missing', () => {
    expect(fieldsWithErrors({ name: '   ' })).toContain('name');
  });

  /* --- Phone ----------------------------------------------------------- */

  it('requires a phone number', () => {
    expect(fieldsWithErrors({ phone: '' })).toContain('phone');
  });

  it('rejects a number that is too short, and says how short', () => {
    const [error] = validate({ phone: '98765' });
    expect(error?.field).toBe('phone');
    expect(error?.message).toContain('5');
  });

  it('accepts a number written with a country code', () => {
    expect(validate({ phone: '+91 98765 00011' })).toEqual([]);
  });

  it('accepts a number written with a leading zero', () => {
    expect(validate({ phone: '09876500011' })).toEqual([]);
  });

  /** Indian mobiles start 6-9; a landline cannot receive the SMS login. */
  it.each(['1234500011', '5876500011'])('rejects the non-mobile number %s', (phone) => {
    expect(fieldsWithErrors({ phone })).toContain('phone');
  });

  /* --- Duplicates ------------------------------------------------------ */

  it('refuses a number that already belongs to a member, and names them', () => {
    const errors = validate({ phone: '9820411238' });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('phone');
    expect(errors[0]?.message).toContain('Aarav Shah');
  });

  it('catches the duplicate however the number is typed', () => {
    for (const phone of ['98204 11238', '+919820411238', '09820411238']) {
      expect(validate({ phone })[0]?.message).toContain('Aarav Shah');
    }
  });

  /* --- Email ----------------------------------------------------------- */

  it('allows an empty email — it is optional', () => {
    expect(validate({ email: '' })).toEqual([]);
  });

  it.each(['nope', 'a@b', 'a@b.', '@example.com', 'a b@example.com'])(
    'rejects the malformed email %s',
    (email) => {
      expect(fieldsWithErrors({ email })).toContain('email');
    },
  );

  /* --- Dates ----------------------------------------------------------- */

  it('allows an empty date of birth', () => {
    expect(validate({ dob: '' })).toEqual([]);
  });

  it('rejects a date of birth that is not a real date', () => {
    expect(fieldsWithErrors({ dob: '31/02/1996' })).toContain('dob');
  });

  it('rejects a date of birth in the future', () => {
    expect(fieldsWithErrors({ dob: '01/01/2030' })).toContain('dob');
  });

  it('warns — but does not block — when the member is under 16', () => {
    const errors = validate({ dob: '01/01/2015' });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('dob');
    expect(errors[0]?.confirmable).toBe(true);
  });

  it('does not warn on the sixteenth birthday itself', () => {
    expect(validate({ dob: '19/08/2010' })).toEqual([]);
  });

  /**
   * Prefilled, but still required: an emptied joining date would otherwise
   * pro-rate the plan from nothing.
   */
  it('requires the joining date', () => {
    expect(fieldsWithErrors({ start: '' })).toContain('start');
  });

  it('rejects an impossible joining date', () => {
    expect(fieldsWithErrors({ start: '31/09/2026' })).toContain('start');
  });

  /* --- Plan and payment ------------------------------------------------ */

  it('requires a plan', () => {
    expect(fieldsWithErrors({ planId: '' })).toContain('plan');
  });

  it('rejects a plan id that is not in the catalogue', () => {
    expect(fieldsWithErrors({ planId: 'made-up' })).toContain('plan');
  });

  it('warns — but does not block — when Pay later leaves a balance', () => {
    const errors = validate({ mode: 'Pay later' });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('mode');
    expect(errors[0]?.confirmable).toBe(true);
  });

  /**
   * The amount is the whole point of the confirmation. "An outstanding due" is
   * not a decision anyone can make; "an outstanding due of ₹2,300" is.
   */
  it('states the amount Pay later leaves outstanding', () => {
    expect(validate({ mode: 'Pay later' })[0]?.message).toContain('₹2,300');
    expect(validate({ mode: 'Pay later', planId: 'annual-all' })[0]?.message).toContain('₹19,800');
  });

  /** Nothing is owed on a free trial, so there is nothing to confirm. */
  it('does not warn about Pay later on a zero-cost plan', () => {
    expect(validate({ mode: 'Pay later', planId: 'trial-7' })).toEqual([]);
  });

  /* --- Reporting ------------------------------------------------------- */

  it('reports every problem at once rather than one per submit', () => {
    const errors = validate({ name: '', phone: '', email: 'nope', planId: '' });
    expect(new Set(errors.map((error) => error.field))).toEqual(
      new Set(['name', 'phone', 'email', 'plan']),
    );
  });
});

describe('canSubmitRegistration', () => {
  const blocking = [{ field: 'name' as const, message: 'x' }];
  const confirmable = [{ field: 'mode' as const, message: 'x', confirmable: true }];

  it('submits when nothing is wrong', () => {
    expect(canSubmitRegistration([], false)).toBe(true);
  });

  it('never submits with a blocking error, however many times it is clicked', () => {
    expect(canSubmitRegistration(blocking, false)).toBe(false);
    expect(canSubmitRegistration(blocking, true)).toBe(false);
  });

  /** The first click has to SHOW the warning, or it was never really shown. */
  it('refuses a confirmable warning the first time and accepts it the second', () => {
    expect(canSubmitRegistration(confirmable, false)).toBe(false);
    expect(canSubmitRegistration(confirmable, true)).toBe(true);
  });

  it('still refuses when a blocking error sits alongside a confirmable one', () => {
    expect(canSubmitRegistration([...blocking, ...confirmable], true)).toBe(false);
  });
});

describe('invalidFields', () => {
  it('derives the highlighted fields from the error keys, not from their text', () => {
    expect(invalidFields(validate({ name: '', planId: '' }))).toEqual(new Set(['name', 'plan']));
  });
});
