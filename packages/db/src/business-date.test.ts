import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE, businessDayRange, toBusinessDate } from './business-date.js';

const IST = 'Asia/Kolkata';

describe('toBusinessDate', () => {
  it('defaults to IST', () => {
    expect(DEFAULT_TIMEZONE).toBe(IST);
    const instant = new Date('2026-08-11T19:00:00Z');
    expect(toBusinessDate(instant)).toBe(toBusinessDate(instant, IST));
  });

  /**
   * The case this whole module exists for. 00:30 IST is 19:00 UTC on the PREVIOUS day, so
   * the naive `toISOString().slice(0,10)` returns 2026-08-11 for a visit everyone in the
   * gym experienced as the 12th. Late-opening branches would have every late-night
   * check-in silently counted against yesterday.
   */
  it('puts a 00:30 IST check-in on the IST day, not the UTC day', () => {
    const lateNightIst = new Date('2026-08-11T19:00:00Z');

    expect(lateNightIst.toISOString().slice(0, 10)).toBe('2026-08-11');
    expect(toBusinessDate(lateNightIst, IST)).toBe('2026-08-12');
  });

  it.each([
    ['2026-08-11T18:29:59Z', '2026-08-11', '23:59:59 IST — last second of the day'],
    ['2026-08-11T18:30:00Z', '2026-08-12', '00:00:00 IST — first instant of the next day'],
    ['2026-08-11T18:30:01Z', '2026-08-12', 'one second after midnight IST'],
    ['2026-08-12T05:00:00Z', '2026-08-12', '10:30 IST — an ordinary morning session'],
    ['2026-08-12T13:00:00Z', '2026-08-12', '18:30 IST — an ordinary evening session'],
  ])('maps %s to %s (%s)', (iso, expected) => {
    expect(toBusinessDate(new Date(iso), IST)).toBe(expected);
  });

  it('rolls the year over correctly at the IST new year', () => {
    // 2025-12-31T18:30:00Z is 2026-01-01T00:00 IST.
    expect(toBusinessDate(new Date('2025-12-31T18:29:59Z'), IST)).toBe('2025-12-31');
    expect(toBusinessDate(new Date('2025-12-31T18:30:00Z'), IST)).toBe('2026-01-01');
  });

  it('zero-pads month and day so the value is a valid Postgres date', () => {
    expect(toBusinessDate(new Date('2026-01-05T06:00:00Z'), IST)).toBe('2026-01-05');
    expect(toBusinessDate(new Date('2026-01-05T06:00:00Z'), IST)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles a zone with a negative offset, where the day can go backwards', () => {
    // 03:00 UTC is still the previous evening in New York.
    expect(toBusinessDate(new Date('2026-08-12T03:00:00Z'), 'America/New_York')).toBe('2026-08-11');
  });

  it('throws on an invalid Date rather than emitting "NaN-NaN-NaN"', () => {
    expect(() => toBusinessDate(new Date('nonsense'), IST)).toThrow(RangeError);
  });

  /**
   * Must throw, never fall back to UTC. A silent fallback produces dates that are wrong by
   * one day — plausible enough to survive review and corrupt months of metrics. This also
   * guards the Android/Hermes case, where an ICU-less build can otherwise resolve any
   * timezone to UTC without complaint.
   */
  it('throws on an unknown timezone instead of silently using UTC', () => {
    expect(() => toBusinessDate(new Date('2026-08-12T03:00:00Z'), 'Mars/Olympus')).toThrow();
  });
});

describe('businessDayRange', () => {
  it('spans IST midnight to IST midnight, expressed in UTC', () => {
    const { start, end } = businessDayRange('2026-08-12', IST);

    expect(start.toISOString()).toBe('2026-08-11T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-08-12T18:30:00.000Z');
  });

  it('is exactly 24 hours in a zone without DST', () => {
    const { start, end } = businessDayRange('2026-08-12', IST);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  /**
   * Half-open [start, end). The boundary instant belongs to the NEXT day — that is what
   * makes `>= start AND < end` partition days with no gap and no overlap. A closed range
   * with a 23:59:59.999 sentinel drops anything in the final millisecond, and drops far
   * more once Postgres microsecond precision is involved.
   */
  it('excludes its end instant, which is the next day start', () => {
    const day = businessDayRange('2026-08-12', IST);
    const nextDay = businessDayRange('2026-08-13', IST);

    expect(day.end.getTime()).toBe(nextDay.start.getTime());
    expect(toBusinessDate(day.start, IST)).toBe('2026-08-12');
    expect(toBusinessDate(new Date(day.end.getTime() - 1), IST)).toBe('2026-08-12');
    expect(toBusinessDate(day.end, IST)).toBe('2026-08-13');
  });

  it('round-trips every instant in a day back to that business date', () => {
    const { start, end } = businessDayRange('2026-08-12', IST);
    for (let t = start.getTime(); t < end.getTime(); t += 60 * 60 * 1000) {
      expect(toBusinessDate(new Date(t), IST)).toBe('2026-08-12');
    }
  });

  it('crosses a month boundary correctly', () => {
    const { start, end } = businessDayRange('2026-09-01', IST);
    expect(start.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T18:30:00.000Z');
  });

  it('survives a DST transition in a zone that has one', () => {
    // US DST ends 2026-11-01; that local day is 25 hours long.
    const { start, end } = businessDayRange('2026-11-01', 'America/New_York');
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it.each(['2026-8-12', '20260812', '', 'yesterday', '2026-08-12T00:00:00Z'])(
    'rejects %j as a business date',
    (value) => {
      expect(() => businessDayRange(value, IST)).toThrow(RangeError);
    },
  );
});
