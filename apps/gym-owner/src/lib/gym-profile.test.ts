import { describe, expect, it } from 'vitest';

import { DEFAULT_GYM_PROFILE, GYM_FIELDS, GYM_FIELD_SPECS } from './data';
import { isGymProfileValid, validateGymField } from './gym-profile';

const HELP = 'help text';

describe('validateGymField', () => {
  /** A blank display name or address is never a valid saved state. */
  it.each(GYM_FIELDS)('rejects an empty %s', (field) => {
    expect(validateGymField(field, '', HELP).invalid).toBe(true);
    expect(validateGymField(field, '   ', HELP).invalid).toBe(true);
  });

  it('returns the static help text when a field is fine', () => {
    expect(validateGymField('name', 'Ironhold Fitness', HELP)).toEqual({
      hint: HELP,
      invalid: false,
    });
  });

  describe('gstin', () => {
    it('accepts a well-formed GSTIN', () => {
      expect(validateGymField('gstin', '27AABCI1234K1ZV', HELP).invalid).toBe(false);
    });

    it('accepts a lowercase GSTIN, since the field is case-insensitive', () => {
      expect(validateGymField('gstin', '27aabci1234k1zv', HELP).invalid).toBe(false);
    });

    it('says how many characters were entered when the length is wrong', () => {
      const state = validateGymField('gstin', '27AABCI1234', HELP);
      expect(state.invalid).toBe(true);
      expect(state.hint).toContain('11');
    });

    /**
     * The failure a length check misses: fifteen characters of the wrong shape
     * is exactly what a padded PAN looks like, and it would reach every invoice
     * the gym issues.
     */
    it('rejects fifteen characters of the wrong shape', () => {
      expect(validateGymField('gstin', 'AAAAAAAAAAAAAAA', HELP).invalid).toBe(true);
      expect(validateGymField('gstin', '271234I1234K1ZV', HELP).invalid).toBe(true);
      expect(validateGymField('gstin', '27AABCI1234K1XV', HELP).invalid).toBe(true);
    });
  });

  describe('capacity', () => {
    it('accepts a positive whole number', () => {
      expect(validateGymField('capacity', '120', HELP).invalid).toBe(false);
    });

    it.each(['abc', '12a', '12.5', '-5', '1e3', ' 12 0'])('rejects %j', (value) => {
      expect(validateGymField('capacity', value, HELP).invalid).toBe(true);
    });

    /** Zero parses fine and would make every check-in an over-capacity warning. */
    it('rejects zero', () => {
      const state = validateGymField('capacity', '0', HELP);
      expect(state.invalid).toBe(true);
      expect(state.hint).toContain('at least 1');
    });
  });

  describe('email', () => {
    it('accepts a normal address', () => {
      expect(validateGymField('email', 'front@ironhold.in', HELP).invalid).toBe(false);
    });

    it.each(['front', 'front@', 'front@ironhold', '@ironhold.in', 'a b@c.in'])(
      'rejects %j',
      (value) => {
        expect(validateGymField('email', value, HELP).invalid).toBe(true);
      },
    );
  });

  describe('phone', () => {
    it.each(['020 4155 8890', '+91 20 4155 8890', '9876500011', '(020) 4155-8890'])(
      'accepts %j',
      (value) => {
        expect(validateGymField('phone', value, HELP).invalid).toBe(false);
      },
    );

    it.each(['12345', 'call us', '020415588901234567890'])('rejects %j', (value) => {
      expect(validateGymField('phone', value, HELP).invalid).toBe(true);
    });
  });
});

describe('isGymProfileValid', () => {
  it('accepts the shipped default profile', () => {
    expect(isGymProfileValid(DEFAULT_GYM_PROFILE, GYM_FIELD_SPECS)).toBe(true);
  });

  it('rejects the profile when any single field is wrong', () => {
    for (const field of GYM_FIELDS) {
      expect(isGymProfileValid({ ...DEFAULT_GYM_PROFILE, [field]: '' }, GYM_FIELD_SPECS)).toBe(
        false,
      );
    }
  });

  it('rejects a malformed GSTIN even though everything else is fine', () => {
    expect(
      isGymProfileValid({ ...DEFAULT_GYM_PROFILE, gstin: 'NOTAGSTIN12345' }, GYM_FIELD_SPECS),
    ).toBe(false);
  });
});
