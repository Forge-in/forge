import { describe, expect, it } from 'vitest';

import { SECURITY_HEADERS } from './security-headers.js';

/**
 * These assertions are the reason the list is shared. Each one encodes a decision that
 * is invisible at a glance in a next.config diff, and silently losing any of them
 * downgrades a console's security posture with no visible symptom.
 */
describe('SECURITY_HEADERS', () => {
  const byKey = new Map(SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it.each([
    ['X-Frame-Options', 'DENY'],
    ['Content-Security-Policy', "frame-ancestors 'none'"],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-DNS-Prefetch-Control', 'off'],
  ])('sets %s to %s', (key, value) => {
    expect(byKey.get(key)).toBe(value);
  });

  it('denies framing via both the legacy and the modern mechanism', () => {
    // X-Frame-Options alone is ignored by some modern browsers; CSP frame-ancestors
    // alone is ignored by older ones. Dropping either leaves a real gap.
    expect(byKey.get('X-Frame-Options')).toBe('DENY');
    expect(byKey.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it.each(['camera', 'microphone', 'geolocation'])(
    'disables the %s permission by default',
    (feature) => {
      expect(byKey.get('Permissions-Policy')).toContain(`${feature}=()`);
    },
  );

  it('declares no duplicate header keys', () => {
    expect(byKey.size).toBe(SECURITY_HEADERS.length);
  });

  it('has no empty keys or values', () => {
    for (const { key, value } of SECURITY_HEADERS) {
      expect(key.trim()).not.toBe('');
      expect(value.trim()).not.toBe('');
    }
  });

  // A stray newline in a header value is a response-splitting primitive.
  it('contains no CR or LF in any value', () => {
    for (const { key, value } of SECURITY_HEADERS) {
      expect(value, `${key} must not contain CR/LF`).not.toMatch(/[\r\n]/);
    }
  });

  it('sets Referrer-Policy to a value that never leaks a full path cross-origin', () => {
    const policy = byKey.get('Referrer-Policy');
    // Console paths carry gym ids and search terms. 'unsafe-url' and 'origin-when-
    // cross-origin' would send them (or the origin) to third parties.
    expect(['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']).toContain(policy);
  });
});
