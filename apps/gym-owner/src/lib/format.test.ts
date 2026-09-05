import { describe, expect, it } from 'vitest';

import {
  count,
  firstName,
  groupIndian,
  initials,
  meterWidth,
  negativeRupees,
  percent,
  phoneDigits,
  ratio,
  rupees,
  subscriberNumber,
} from './format';

describe('groupIndian', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [99999, '99,999'],
    [100000, '1,00,000'],
    [842500, '8,42,500'],
    [5618000, '56,18,000'],
    [9240000, '92,40,000'],
    [10000000, '1,00,00,000'],
  ])('groups %i as %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });

  /**
   * The grouping must match `toLocaleString('en-IN')` exactly — that is the
   * output an owner recognises — while never calling it, because its result
   * depends on the runtime's ICU data and would differ between the server
   * render and the browser's hydration.
   */
  it('matches the Intl grouping it deliberately avoids calling', () => {
    for (const value of [1, 999, 1000, 12345, 100000, 842500, 5618000, 98765432]) {
      expect(groupIndian(value)).toBe(value.toLocaleString('en-IN'));
    }
  });

  it('keeps the sign outside the grouping', () => {
    expect(groupIndian(-842500)).toBe('-8,42,500');
  });

  it('truncates rather than rounding, so a figure never grows', () => {
    expect(groupIndian(999.9)).toBe('999');
  });

  it('renders a readable zero for non-finite input instead of NaN', () => {
    expect(groupIndian(Number.NaN)).toBe('0');
    expect(groupIndian(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('rupees', () => {
  it('writes the amount in full, never compacted to lakh or crore', () => {
    expect(rupees(842500)).toBe('₹8,42,500');
    expect(rupees(5618000)).toBe('₹56,18,000');
  });

  it('renders zero as an amount rather than as a dash', () => {
    expect(rupees(0)).toBe('₹0');
  });

  it('writes a credit note with the sign outside the symbol', () => {
    expect(negativeRupees(-9439)).toBe('− ₹9,439');
    expect(negativeRupees(9439)).toBe('− ₹9,439');
  });
});

describe('count', () => {
  it('groups whole counts', () => {
    expect(count(412)).toBe('412');
    expect(count(43548)).toBe('43,548');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Aarav Shah')).toBe('AS');
    expect(initials('Anjali Rane · freelance')).toBe('AR');
  });

  it('handles a single name', () => {
    expect(initials('Ramesh')).toBe('R');
  });

  it('never returns an empty string, so an avatar is never a blank circle', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Rahul Mehra')).toBe('Rahul');
  });

  it('passes a single word through', () => {
    expect(firstName('Rahul')).toBe('Rahul');
  });
});

describe('ratio', () => {
  it('divides', () => {
    expect(ratio(68, 120)).toBeCloseTo(0.5667, 4);
  });

  /** A class with capacity 0 is a data error the dashboard survives. */
  it('returns 0 rather than dividing by zero', () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(5, -1)).toBe(0);
  });

  it('clamps above 1, so an over-capacity gym cannot overflow a meter', () => {
    expect(ratio(130, 120)).toBe(1);
  });

  it('clamps below 0', () => {
    expect(ratio(-5, 120)).toBe(0);
  });
});

describe('meterWidth', () => {
  it('floors, so 99.6% full never renders as a full bar', () => {
    expect(meterWidth(499, 500)).toBe('99%');
  });

  it('gives a small non-zero value a visible floor', () => {
    expect(meterWidth(1, 400)).toBe('2%');
  });

  it('renders exactly nothing at zero — the one honest empty bar', () => {
    expect(meterWidth(0, 20)).toBe('0%');
  });

  it('fills completely at capacity', () => {
    expect(meterWidth(20, 20)).toBe('100%');
  });

  it('does not overflow past capacity', () => {
    expect(meterWidth(25, 20)).toBe('100%');
  });
});

describe('percent', () => {
  it('rounds to a whole percentage', () => {
    expect(percent(0.864)).toBe('86%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });
});

describe('phone helpers', () => {
  it('strips every non-digit', () => {
    expect(phoneDigits('+91 98204-11238')).toBe('919820411238');
  });

  /**
   * The duplicate check compares subscriber numbers, so the same person typed
   * three different ways resolves to one value.
   */
  it('reduces every written form of one number to the same ten digits', () => {
    const expected = '9820411238';
    expect(subscriberNumber('98204 11238')).toBe(expected);
    expect(subscriberNumber('+919820411238')).toBe(expected);
    expect(subscriberNumber('919820411238')).toBe(expected);
    expect(subscriberNumber('09820411238')).toBe(expected);
    expect(subscriberNumber('+91 98204-11238')).toBe(expected);
  });
});
