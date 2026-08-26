import { describe, expect, it } from 'vitest';

import { MEMBERS, MEMBER_FILTERS, REVENUE_SERIES, type Member } from './data';
import {
  chartBars,
  fillTone,
  filterMembers,
  greeting,
  isChurnRisk,
  isMemberFilter,
  isRevenueScope,
  membersWithDues,
  ringGeometry,
} from './metrics';

function names(rows: readonly Member[]): string[] {
  return rows.map((member) => member.name);
}

describe('filterMembers', () => {
  it('returns everyone with no query and no filter', () => {
    expect(filterMembers(MEMBERS, { query: '', filter: 'All' })).toHaveLength(MEMBERS.length);
  });

  it('matches a name case-insensitively, on a substring', () => {
    expect(names(filterMembers(MEMBERS, { query: 'nair', filter: 'All' }))).toEqual(['Priya Nair']);
    expect(names(filterMembers(MEMBERS, { query: 'PRIYA', filter: 'All' }))).toEqual([
      'Priya Nair',
    ]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(names(filterMembers(MEMBERS, { query: '  nair  ', filter: 'All' }))).toEqual([
      'Priya Nair',
    ]);
  });

  /**
   * The roll stores "99678 40921" and a person searching types "9967840921".
   * Comparing the raw strings finds neither.
   */
  it('matches a phone number typed without the space', () => {
    expect(names(filterMembers(MEMBERS, { query: '9967840921', filter: 'All' }))).toEqual([
      'Priya Nair',
    ]);
  });

  it('matches a partial phone number', () => {
    expect(names(filterMembers(MEMBERS, { query: '40921', filter: 'All' }))).toEqual([
      'Priya Nair',
    ]);
  });

  /**
   * `''.includes('')` is true, so a query with no digits must not fall through
   * to the phone branch — it would make every member match.
   */
  it('does not match everyone when the query has no digits and no name hit', () => {
    expect(filterMembers(MEMBERS, { query: 'zzzz', filter: 'All' })).toEqual([]);
  });

  it('filters by a single status', () => {
    const overdue = filterMembers(MEMBERS, { query: '', filter: 'Overdue' });
    expect(overdue.every((member) => member.status === 'Overdue')).toBe(true);
    expect(overdue.length).toBeGreaterThan(0);
  });

  /** "Dues" cuts across statuses rather than being one of them. */
  it('filters by outstanding balance regardless of status', () => {
    const dues = filterMembers(MEMBERS, { query: '', filter: 'Dues' });
    expect(dues.every((member) => member.due > 0)).toBe(true);
    expect(new Set(dues.map((member) => member.status)).size).toBeGreaterThan(1);
  });

  it('applies the query and the status together', () => {
    expect(names(filterMembers(MEMBERS, { query: 'a', filter: 'Frozen' }))).toEqual([
      'Sana Qureshi',
    ]);
  });

  it('returns nothing rather than throwing when the pair matches nobody', () => {
    expect(filterMembers(MEMBERS, { query: 'Priya', filter: 'Trial' })).toEqual([]);
  });

  it('handles every declared filter without error', () => {
    for (const filter of MEMBER_FILTERS) {
      expect(() => filterMembers(MEMBERS, { query: '', filter })).not.toThrow();
    }
  });
});

describe('isChurnRisk', () => {
  it('flags a member whose attendance has collapsed', () => {
    const priya = MEMBERS.find((member) => member.name === 'Priya Nair');
    expect(priya && isChurnRisk(priya)).toBe(true);
  });

  /** A held membership is paused, not slipping — flagging it wastes a nudge. */
  it('never flags a frozen membership, whose attendance is zero by definition', () => {
    const sana = MEMBERS.find((member) => member.name === 'Sana Qureshi');
    expect(sana?.attendance).toBe(0);
    expect(sana && isChurnRisk(sana)).toBe(false);
  });

  it('does not flag a regular attender', () => {
    const kabir = MEMBERS.find((member) => member.name === 'Kabir Rao');
    expect(kabir && isChurnRisk(kabir)).toBe(false);
  });
});

describe('membersWithDues', () => {
  it('counts only members carrying a balance', () => {
    expect(membersWithDues(MEMBERS)).toBe(MEMBERS.filter((member) => member.due > 0).length);
  });
});

describe('chartBars', () => {
  it('scales every bar against the tallest', () => {
    const bars = chartBars([10, 20, 40], ['a', 'b', 'c']);
    expect(bars.map((bar) => bar.share)).toEqual([0.25, 0.5, 1]);
  });

  it('marks exactly one peak', () => {
    const bars = chartBars([10, 40, 40], ['a', 'b', 'c']);
    expect(bars.filter((bar) => bar.peak)).toHaveLength(1);
    expect(bars[1]?.peak).toBe(true);
  });

  it('labels every nth bar and blanks the rest', () => {
    const bars = chartBars([1, 2, 3, 4], ['a', 'b', 'c', 'd'], 2);
    expect(bars.map((bar) => bar.label)).toEqual(['a', '', 'c', '']);
  });

  /** Reachable on the first day of a financial year. */
  it('survives an all-zero series without dividing by zero', () => {
    const bars = chartBars([0, 0, 0], ['a', 'b', 'c']);
    expect(bars.every((bar) => bar.share === 0)).toBe(true);
    expect(bars.every((bar) => bar.empty)).toBe(true);
    expect(bars.some((bar) => bar.peak)).toBe(false);
  });

  it('marks a not-yet-happened period as empty rather than as a zero-height bar', () => {
    const bars = chartBars([5, 0], ['a', 'b']);
    expect(bars[1]?.empty).toBe(true);
    expect(bars[0]?.empty).toBe(false);
  });

  it('gives every bar a stable, unique key', () => {
    const bars = chartBars([1, 1, 1], ['a', 'a', 'a']);
    expect(new Set(bars.map((bar) => bar.key)).size).toBe(3);
  });

  it('handles an empty series', () => {
    expect(chartBars([], [])).toEqual([]);
  });

  it('draws every declared revenue scope', () => {
    for (const series of Object.values(REVENUE_SERIES)) {
      const bars = chartBars(series.values, series.labels, series.labelEvery);
      expect(bars).toHaveLength(series.values.length);
      expect(bars.every((bar) => bar.share >= 0 && bar.share <= 1)).toBe(true);
    }
  });
});

describe('ringGeometry', () => {
  it('computes the circumference from the radius rather than a literal', () => {
    expect(Number(ringGeometry(84, 0).dashArray)).toBeCloseTo(2 * Math.PI * 84, 1);
  });

  it('leaves the ring empty at zero and full at one', () => {
    const radius = 84;
    const circumference = 2 * Math.PI * radius;
    expect(Number(ringGeometry(radius, 0).dashOffset)).toBeCloseTo(circumference, 1);
    expect(Number(ringGeometry(radius, 1).dashOffset)).toBeCloseTo(0, 1);
  });

  /** An over-capacity gym would otherwise draw the arc backwards over itself. */
  it('clamps a fraction above one', () => {
    expect(ringGeometry(84, 1.4).dashOffset).toBe(ringGeometry(84, 1).dashOffset);
  });

  it('clamps a negative fraction', () => {
    expect(ringGeometry(84, -1).dashOffset).toBe(ringGeometry(84, 0).dashOffset);
  });

  it('treats a non-finite fraction as empty', () => {
    expect(ringGeometry(84, Number.NaN).dashOffset).toBe(ringGeometry(84, 0).dashOffset);
  });
});

describe('fillTone', () => {
  it('is neutral when nobody has booked', () => {
    expect(fillTone(0, 20)).toBe('neutral');
  });

  it('is gold while a class is filling', () => {
    expect(fillTone(12, 20)).toBe('gold');
  });

  /** A sold-out class is a good problem, not an incident. */
  it('is neutral once a class is full', () => {
    expect(fillTone(20, 20)).toBe('neutral');
    expect(fillTone(22, 20)).toBe('neutral');
  });

  it('is neutral for a nonsensical capacity rather than throwing', () => {
    expect(fillTone(3, 0)).toBe('neutral');
  });
});

describe('greeting', () => {
  /**
   * Boundaries are stated in IST because the gym is in Pune — and because a
   * server in another region computing a different word from the browser is a
   * hydration mismatch on the page's largest heading.
   */
  it.each([
    ['2026-08-19T00:00:00Z', 'Good morning'], // 05:30 IST
    ['2026-08-19T06:00:00Z', 'Good morning'], // 11:30 IST
    ['2026-08-19T06:30:00Z', 'Good afternoon'], // 12:00 IST
    ['2026-08-19T11:29:00Z', 'Good afternoon'], // 16:59 IST
    ['2026-08-19T11:30:00Z', 'Good evening'], // 17:00 IST
    ['2026-08-19T18:29:00Z', 'Good evening'], // 23:59 IST
    ['2026-08-19T18:30:00Z', 'Good morning'], // 00:00 IST next day
  ])('greets at %s with "%s"', (iso, expected) => {
    expect(greeting(new Date(iso))).toBe(expected);
  });

  it('does not depend on the machine running the test', () => {
    // A UTC instant maps to one IST word regardless of the host's zone.
    expect(greeting(new Date('2026-01-01T20:00:00Z'))).toBe('Good morning');
  });
});

describe('guards', () => {
  it('accepts declared member filters and rejects anything else', () => {
    expect(isMemberFilter('Overdue')).toBe(true);
    expect(isMemberFilter('Dues')).toBe(true);
    expect(isMemberFilter('nope')).toBe(false);
    expect(isMemberFilter(null)).toBe(false);
    expect(isMemberFilter(7)).toBe(false);
  });

  it('accepts declared revenue scopes and rejects anything else', () => {
    expect(isRevenueScope('Year')).toBe(true);
    expect(isRevenueScope('Decade')).toBe(false);
    expect(isRevenueScope(undefined)).toBe(false);
  });
});
