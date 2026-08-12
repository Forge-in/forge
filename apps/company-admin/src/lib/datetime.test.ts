import { describe, expect, it } from 'vitest';

import { absoluteDate, absoluteTime, hasExpired, timeAgo, timeUntil } from './datetime';

/**
 * Relative time is the kind of logic that is either tested at its boundaries or is wrong at
 * them. Every case here is a specific way these functions would embarrass the console: a
 * negative countdown, an "Invalid Date" in a table cell, "1 days ago", or a timestamp that
 * reads differently depending on whose laptop it is.
 */

const NOW = new Date('2026-08-13T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const ahead = (ms: number): string => new Date(NOW.getTime() + ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('absoluteTime', () => {
  /**
   * Pinned to IST, not the runner's timezone. Without the explicit zone this test passes in
   * India and fails in CI — and, worse, the console would show different times to different
   * people during the incident where that matters most.
   */
  it('renders in IST regardless of the machine timezone', () => {
    // 12:00 UTC is 17:30 IST.
    expect(absoluteTime('2026-08-13T12:00:00.000Z')).toContain('17:30');
    expect(absoluteTime('2026-08-13T12:00:00.000Z')).toContain('IST');
  });

  it('crosses the date boundary correctly', () => {
    // 20:00 UTC on the 12th is 01:30 IST on the 13th.
    const rendered = absoluteTime('2026-08-12T20:00:00.000Z');
    expect(rendered).toContain('13 Aug 2026');
    expect(rendered).toContain('01:30');
  });

  // A table cell reading "Invalid Date" is worse than one reading "—": it looks like data.
  it.each([[null], [undefined], [''], ['not a date']])('renders %j as an em dash', (value) => {
    expect(absoluteTime(value)).toBe('—');
    expect(absoluteDate(value)).toBe('—');
  });
});

describe('timeAgo', () => {
  it.each<[number, string]>([
    [0, 'just now'],
    [30_000, 'just now'],
    [MINUTE, '1 minute ago'],
    [2 * MINUTE, '2 minutes ago'],
    [HOUR, '1 hour ago'],
    [5 * HOUR, '5 hours ago'],
    [DAY, '1 day ago'],
    [3 * DAY, '3 days ago'],
  ])('renders %d ms ago as %j', (elapsed, expected) => {
    expect(timeAgo(ago(elapsed), NOW)).toBe(expected);
  });

  // "1 days ago" is the classic tell that nobody looked at this screen.
  it('gets singular and plural right at every boundary', () => {
    expect(timeAgo(ago(MINUTE), NOW)).toBe('1 minute ago');
    expect(timeAgo(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(timeAgo(ago(DAY), NOW)).toBe('1 day ago');
  });

  /**
   * Server and browser clocks drift by seconds routinely. A "last signed in" column showing
   * "in -4 seconds" reads as a bug; treating a near-future timestamp as "just now" is both
   * truthful enough and calm.
   */
  it('does not produce a negative duration when the clock is slightly ahead', () => {
    expect(timeAgo(ahead(5_000), NOW)).toBe('just now');
    expect(timeAgo(ahead(30 * MINUTE), NOW)).toBe('just now');
  });

  // Past a month a relative figure stops being useful — nobody counts 47 days in their head.
  it('falls back to a date beyond a month', () => {
    expect(timeAgo(ago(45 * DAY), NOW)).toBe('29 Jun 2026');
  });

  it('renders a missing value as an em dash', () => {
    expect(timeAgo(null, NOW)).toBe('—');
  });
});

describe('timeUntil', () => {
  it.each<[number, string]>([
    [30_000, 'in under a minute'],
    [MINUTE, 'in 1 minute'],
    [40 * MINUTE, 'in 40 minutes'],
    [HOUR, 'in 1 hour'],
    [5 * HOUR, 'in 5 hours'],
    [DAY, 'in 1 day'],
    [3 * DAY, 'in 3 days'],
  ])('renders %d ms ahead as %j', (remaining, expected) => {
    expect(timeUntil(ahead(remaining), NOW)).toBe(expected);
  });

  /**
   * THE CASE THAT MATTERS.
   *
   * The API filters expired invites out of the list, but a console left open crosses the
   * expiry with the row still on screen. It must read "expired" rather than counting down
   * into negative numbers next to a button that will no longer work.
   */
  it.each([[0], [1_000], [DAY]])('says "expired" once %d ms past', (elapsed) => {
    expect(timeUntil(ago(elapsed), NOW)).toBe('expired');
  });

  it('renders a missing value as an em dash', () => {
    expect(timeUntil(undefined, NOW)).toBe('—');
  });
});

describe('hasExpired', () => {
  it('is true at and after the expiry instant', () => {
    expect(hasExpired(NOW.toISOString(), NOW)).toBe(true);
    expect(hasExpired(ago(1), NOW)).toBe(true);
  });

  it('is false while there is time left', () => {
    expect(hasExpired(ahead(1), NOW)).toBe(false);
  });

  /**
   * False, not true, for an unparseable value. Treating "we cannot tell" as "expired" would
   * disable a revoke button on an invite that is in fact still live and still usable — the
   * more dangerous of the two wrong answers.
   */
  it.each([[null], [undefined], ['nonsense']])('is false for %j', (value) => {
    expect(hasExpired(value, NOW)).toBe(false);
  });
});
