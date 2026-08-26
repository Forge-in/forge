import { describe, expect, it } from 'vitest';

import { CURRENT_DAY } from './data';
import {
  parseClassFilters,
  parseFeeBucket,
  parseMemberFilters,
  parseRevenueScope,
  parseStaffFilter,
  type SearchParams,
} from './search-params';

/**
 * A query string is user input that arrives with no form around it, so every
 * parser here is tested against what an attacker or a stale bookmark sends —
 * not just against what the UI writes.
 */
const HOSTILE: SearchParams[] = [
  {},
  { status: '' },
  { status: 'nope' },
  { status: '<script>alert(1)</script>' },
  { status: '__proto__' },
  { status: 'constructor' },
  { status: [] },
  { status: ['nope', 'Overdue'] },
  { status: undefined },
];

describe('parseMemberFilters', () => {
  it('defaults to everything', () => {
    expect(parseMemberFilters({})).toEqual({ query: '', status: 'All' });
  });

  it('accepts a valid status', () => {
    expect(parseMemberFilters({ status: 'Overdue' }).status).toBe('Overdue');
  });

  it('accepts the cross-cutting Dues filter', () => {
    expect(parseMemberFilters({ status: 'Dues' }).status).toBe('Dues');
  });

  it.each(HOSTILE)('falls back to All rather than throwing on %j', (params) => {
    expect(parseMemberFilters(params).status).toBe('All');
  });

  /**
   * Untrimmed on purpose: the search box syncs itself from this value during
   * render, and trimming here would edit the box mid-keystroke.
   */
  it('passes the query through untouched, including whitespace', () => {
    expect(parseMemberFilters({ q: '  nair ' }).query).toBe('  nair ');
  });

  it('takes the first value when a key is repeated', () => {
    expect(parseMemberFilters({ q: ['a', 'b'] }).query).toBe('a');
  });

  /**
   * `?status=Overdue&status=Trial` is one intent expressed twice, not two
   * filters. Taking the first is deliberate — validating the array as a whole
   * would reject a duplicated parameter a proxy or a form can legitimately
   * produce.
   */
  it('honours the first of a repeated status and ignores the rest', () => {
    expect(parseMemberFilters({ status: ['Overdue', 'Trial'] }).status).toBe('Overdue');
  });
});

describe('parseRevenueScope', () => {
  it('defaults to the month', () => {
    expect(parseRevenueScope({})).toBe('Month');
  });

  it.each(['Day', 'Month', 'Year'] as const)('accepts %s', (scope) => {
    expect(parseRevenueScope({ scope })).toBe(scope);
  });

  it.each(['week', '', 'DAY', 'toString'])('falls back on %j', (scope) => {
    expect(parseRevenueScope({ scope })).toBe('Month');
  });
});

describe('parseFeeBucket', () => {
  /** Overdue is the bucket with money at risk, so it is the cold-open default. */
  it('defaults to Overdue', () => {
    expect(parseFeeBucket({})).toBe('Overdue');
  });

  it('accepts a bucket whose name contains a space', () => {
    expect(parseFeeBucket({ bucket: 'This week' })).toBe('This week');
  });

  it('falls back on an unknown bucket', () => {
    expect(parseFeeBucket({ bucket: 'Last year' })).toBe('Overdue');
  });
});

describe('parseClassFilters', () => {
  it('defaults to today and the group view', () => {
    expect(parseClassFilters({})).toEqual({ day: CURRENT_DAY, view: 'Group' });
  });

  it('accepts a valid day and view', () => {
    expect(parseClassFilters({ day: 'Sun', view: 'Personal' })).toEqual({
      day: 'Sun',
      view: 'Personal',
    });
  });

  it('falls back independently, so one bad key does not reset the other', () => {
    expect(parseClassFilters({ day: 'Funday', view: 'Personal' })).toEqual({
      day: CURRENT_DAY,
      view: 'Personal',
    });
  });
});

describe('parseStaffFilter', () => {
  it('defaults to All', () => {
    expect(parseStaffFilter({})).toBe('All');
  });

  it('accepts a declared group', () => {
    expect(parseStaffFilter({ role: 'Front desk' })).toBe('Front desk');
  });

  it('falls back on anything else', () => {
    expect(parseStaffFilter({ role: 'Owner' })).toBe('All');
  });
});
