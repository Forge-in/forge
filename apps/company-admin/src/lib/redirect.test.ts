import { describe, expect, it } from 'vitest';

import { safeDestination } from './redirect';

/**
 * The `?next=` parameter is attacker-controllable: a login link can be mailed to a real
 * admin with any value in it. If it ever resolves off-origin, that is a phishing primitive
 * against the platform console. Every case below is a real bypass technique.
 */
describe('safeDestination', () => {
  it('passes through a plain absolute path', () => {
    expect(safeDestination('/gyms')).toBe('/gyms');
  });

  it('preserves a query string on the destination', () => {
    expect(safeDestination('/gyms?plan=Scale&status=Trial')).toBe('/gyms?plan=Scale&status=Trial');
  });

  it('allows the bare root path', () => {
    expect(safeDestination('/')).toBe('/');
  });

  it.each([
    ['//evil.com', 'protocol-relative URL — the classic open-redirect bypass'],
    ['///evil.com', 'triple slash, still protocol-relative after normalisation'],
    ['/\\evil.com', 'backslash — browsers normalise \\ to / and read a host'],
    ['/\\\\evil.com', 'double backslash'],
    ['https://evil.com', 'absolute URL with scheme'],
    ['http://evil.com', 'absolute URL, plaintext scheme'],
    ['javascript:alert(1)', 'javascript: scheme'],
    ['data:text/html,<script>alert(1)</script>', 'data: URI'],
    ['evil.com', 'schemeless relative — resolves against the current directory'],
    ['../../etc/passwd', 'relative traversal'],
    ['', 'empty string'],
  ])('falls back for %j — %s', (next) => {
    expect(safeDestination(next)).toBe('/overview');
  });

  // Built from char codes rather than typed inline: these bytes are invisible in a diff,
  // and a reviewer must be able to see exactly which one each case exercises.
  // Browsers strip them before parsing, so "/<TAB>evil.com" can become "//evil.com".
  // Rejected outright rather than sanitised — sanitising just invites a second bypass.
  it.each([
    [0x00, 'NUL — bottom of the control range'],
    [0x09, 'TAB'],
    [0x0a, 'LF'],
    [0x0d, 'CR'],
    [0x1f, 'unit separator — top of the low control range'],
    [0x7f, 'DEL'],
  ])('rejects control character 0x%s injected into the path', (code) => {
    expect(safeDestination(`/${String.fromCharCode(code)}evil.com`)).toBe('/overview');
  });

  it('rejects a control character even in a trailing position', () => {
    expect(safeDestination(`/gyms${String.fromCharCode(0x09)}`)).toBe('/overview');
  });

  // A literal space is legal in a path and is NOT in the control range, so the guard must
  // not have widened into "reject anything unusual".
  it('allows a literal space in the path', () => {
    expect(safeDestination('/gyms/Iron House')).toBe('/gyms/Iron House');
  });

  it('allows a percent-encoded space', () => {
    expect(safeDestination('/gyms/Iron%20House')).toBe('/gyms/Iron%20House');
  });

  // Written as two cases rather than it.each: a [null, string] | [undefined, string]
  // union does not reduce to a single tuple, so the callback arity fails typecheck.
  it('falls back for null', () => {
    expect(safeDestination(null)).toBe('/overview');
  });

  it('falls back for undefined', () => {
    expect(safeDestination(undefined)).toBe('/overview');
  });

  it('honours an explicit fallback for both the empty and the hostile case', () => {
    expect(safeDestination(null, '/login')).toBe('/login');
    expect(safeDestination('//evil.com', '/login')).toBe('/login');
  });
});
