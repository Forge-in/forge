import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatMoney,
  groupIndian,
  initials,
  parseMoney,
  rankLabel,
  ratio,
} from './format';

describe('groupIndian', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [12345, '12,345'],
    [123456, '1,23,456'],
    [1234567, '12,34,567'],
    [12345678, '1,23,45,678'],
    [1234567890, '1,23,45,67,890'],
  ])('groups %i as %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });

  it('is exactly at the 3-to-4 digit boundary', () => {
    expect(groupIndian(999)).toBe('999');
    expect(groupIndian(1000)).toBe('1,000');
  });

  it('keeps the sign outside the grouping', () => {
    expect(groupIndian(-1234567)).toBe('-12,34,567');
    expect(groupIndian(-999)).toBe('-999');
  });

  it('truncates rather than rounds a fractional input', () => {
    expect(groupIndian(1234.99)).toBe('1,234');
    expect(groupIndian(-1234.99)).toBe('-1,234');
  });

  it.each([
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
  ])('returns "0" for a non-finite input (%s)', (input) => {
    expect(groupIndian(input)).toBe('0');
  });

  // -0 is finite and `-0 < 0` is false, so it must not pick up a sign.
  it('does not render negative zero with a sign', () => {
    expect(groupIndian(-0)).toBe('0');
  });
});

describe('formatCount', () => {
  it('groups whole counts', () => {
    expect(formatCount(43548)).toBe('43,548');
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '₹0'],
    [999, '₹999'],
    [99999, '₹99,999'],
    [100000, '₹1.0L'],
    [1030000, '₹10.3L'],
    [9999999, '₹100.0L'],
    [10000000, '₹1.00Cr'],
    [12400000, '₹1.24Cr'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  // The lakh/crore switch points are the whole reason this helper exists — a one-rupee
  // slip either side changes the unit shown to a finance team.
  it('switches unit exactly at 1 lakh and 1 crore', () => {
    expect(formatMoney(99_999)).toBe('₹99,999');
    expect(formatMoney(100_000)).toBe('₹1.0L');
    expect(formatMoney(9_999_999)).toBe('₹100.0L');
    expect(formatMoney(10_000_000)).toBe('₹1.00Cr');
  });

  it('places the sign before the rupee symbol', () => {
    expect(formatMoney(-12_400_000)).toBe('-₹1.24Cr');
    expect(formatMoney(-500)).toBe('-₹500');
  });

  it('returns ₹0 for a non-finite amount', () => {
    expect(formatMoney(Number.NaN)).toBe('₹0');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('₹0');
  });
});

describe('ratio', () => {
  it('divides normally', () => {
    expect(ratio(1, 4)).toBe(0.25);
  });

  it('guards a zero denominator instead of returning Infinity', () => {
    expect(ratio(5, 0)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(ratio(Number.NaN, 10)).toBe(0);
    expect(ratio(10, Number.NaN)).toBe(0);
    expect(ratio(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });

  it('does not clamp — a part larger than the total is passed through', () => {
    expect(ratio(3, 2)).toBe(1.5);
  });
});

describe('initials', () => {
  it.each([
    ['Sameer Rathore', 'SR'],
    ['sameer rathore', 'SR'],
    ['Madonna', 'M'],
    ['A B C D', 'AB'],
  ])('reduces %s to %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('collapses runs of whitespace rather than emitting empty initials', () => {
    expect(initials('  Sameer   Rathore  ')).toBe('SR');
    expect(initials('Sameer\tRathore')).toBe('SR');
  });

  it.each([
    ['', 'empty string'],
    ['   ', 'whitespace only'],
  ])('falls back to "?" for %j — %s', (name) => {
    expect(initials(name)).toBe('?');
  });

  it('respects a custom max', () => {
    expect(initials('Aa Bb Cc Dd', 3)).toBe('ABC');
    expect(initials('Aa Bb Cc', 1)).toBe('A');
  });
});

describe('parseMoney', () => {
  it('reads a grouped rupee string back to a number', () => {
    expect(parseMoney('₹1,44,000')).toBe(144000);
    expect(parseMoney('₹999')).toBe(999);
  });

  it('returns 0 for a string with no digits', () => {
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('₹')).toBe(0);
    expect(parseMoney('-')).toBe(0);
  });

  /**
   * Documents a real asymmetry rather than asserting a round-trip that does not hold:
   * formatMoney compacts to "L"/"Cr", and parseMoney only strips non-digits, so
   * parseMoney(formatMoney(x)) loses the magnitude entirely above 1 lakh.
   *
   * This is exactly why the API contract must carry integer paise and let the console
   * format on the way out — never parse a display string back into money.
   */
  it('does NOT round-trip a compacted amount — the unit suffix is silently dropped', () => {
    expect(formatMoney(12_400_000)).toBe('₹1.24Cr');
    expect(parseMoney('₹1.24Cr')).toBe(1.24);
    expect(parseMoney(formatMoney(1_030_000))).toBe(10.3);
  });

  it('round-trips only below the lakh threshold', () => {
    expect(parseMoney(formatMoney(99_999))).toBe(99999);
  });
});

describe('rankLabel', () => {
  it.each([
    [0, '01'],
    [8, '09'],
    [9, '10'],
    [99, '100'],
  ])('renders index %i as %s', (index, expected) => {
    expect(rankLabel(index)).toBe(expected);
  });
});
