import { describe, expect, it } from 'vitest';

import { DEFAULT_GYM_FILTERS, parseAuditKind, parseGymFilters } from './search-params';

/**
 * Search params are untrusted input — anyone can hand-edit the URL. Every value must
 * validate against its allowed set and fall back rather than throw, because a bad
 * bookmark should render the default view, not a 500.
 */
describe('parseGymFilters', () => {
  it('returns the documented defaults for an empty URL', () => {
    expect(parseGymFilters({})).toEqual(DEFAULT_GYM_FILTERS);
  });

  it('accepts every valid plan, status and sort', () => {
    expect(parseGymFilters({ plan: 'Scale', status: 'Trial', sort: 'mrr', q: 'iron' })).toEqual({
      query: 'iron',
      plan: 'Scale',
      status: 'Trial',
      sort: 'mrr',
    });
  });

  it('accepts the explicit "All" sentinel for plan and status', () => {
    const result = parseGymFilters({ plan: 'All', status: 'All' });
    expect(result.plan).toBe('All');
    expect(result.status).toBe('All');
  });

  it('preserves a multi-word status containing a space', () => {
    expect(parseGymFilters({ status: 'Past due' }).status).toBe('Past due');
  });

  it.each([
    ['plan', 'Enterprise;DROP TABLE gyms'],
    ['plan', 'scale'],
    ['status', 'active'],
    ['status', 'Deleted'],
    ['sort', 'members;--'],
    ['sort', 'MRR'],
  ])('falls back when %s is %j', (key, value) => {
    const result = parseGymFilters({ [key]: value });
    const fallback = DEFAULT_GYM_FILTERS[key as 'plan' | 'status' | 'sort'];
    expect(result[key as 'plan' | 'status' | 'sort']).toBe(fallback);
  });

  // Casing matters: the allowed sets are the display strings, so `oneOf` is a strict
  // membership test. Locking this in means a future "be lenient about case" change is
  // a conscious decision rather than an accident.
  it('is case-sensitive', () => {
    expect(parseGymFilters({ plan: 'STUDIO' }).plan).toBe('All');
  });

  // Next passes a repeated query param as an array. Taking the first element must not
  // crash and must not stringify the array into "Scale,Studio".
  it('takes the first value when a param is repeated', () => {
    expect(parseGymFilters({ plan: ['Scale', 'Studio'] }).plan).toBe('Scale');
    expect(parseGymFilters({ q: ['iron', 'house'] }).query).toBe('iron');
  });

  it('falls back when a repeated param has an invalid first value', () => {
    expect(parseGymFilters({ plan: ['bogus', 'Scale'] }).plan).toBe('All');
  });

  it('falls back for an empty array', () => {
    expect(parseGymFilters({ plan: [] }).plan).toBe('All');
    expect(parseGymFilters({ q: [] }).query).toBe('');
  });

  it('treats an explicitly undefined value as absent', () => {
    expect(parseGymFilters({ plan: undefined, q: undefined })).toEqual(DEFAULT_GYM_FILTERS);
  });

  it('passes the free-text query through verbatim, including an empty string', () => {
    expect(parseGymFilters({ q: '' }).query).toBe('');
    expect(parseGymFilters({ q: '  Iron House  ' }).query).toBe('  Iron House  ');
  });

  // The query is rendered into the UI, so this documents that escaping is the
  // renderer's job — this parser is deliberately not a sanitiser.
  it('does not sanitise the free-text query', () => {
    expect(parseGymFilters({ q: '<script>' }).query).toBe('<script>');
  });
});

describe('parseAuditKind', () => {
  it('defaults to All', () => {
    expect(parseAuditKind({})).toBe('All');
  });

  it.each(['Invite', 'Billing', 'Plan', 'Org', 'Access'])('accepts %s', (kind) => {
    expect(parseAuditKind({ kind })).toBe(kind);
  });

  it.each([
    ['billing', 'wrong case'],
    ['Unknown', 'not in the set'],
    ['', 'empty'],
  ])('falls back to All for %j — %s', (kind) => {
    expect(parseAuditKind({ kind })).toBe('All');
  });

  it('takes the first value when repeated', () => {
    expect(parseAuditKind({ kind: ['Org', 'Billing'] })).toBe('Org');
  });
});
