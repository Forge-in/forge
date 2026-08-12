import { describe, expect, it } from 'vitest';

import { SECURITY_HEADERS } from '@forge/shared';

import nextConfig from '../next.config';

/**
 * Regression guard for a gap this app actually shipped with: company-admin sent the baseline
 * security headers and gym-owner sent none, so the gym owner dashboard was framable.
 * A missing `headers()` produces no error and no visible symptom — only a test catches it.
 */
describe('gym-owner next.config', () => {
  it('serves the shared baseline security headers on every path', async () => {
    expect(nextConfig.headers).toBeTypeOf('function');

    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);

    const rule = rules[0]!;
    // '/:path*' matches every route including '/'; '/:path+' would miss the root.
    expect(rule.source).toBe('/:path*');
    expect(rule.headers).toEqual([...SECURITY_HEADERS]);
  });

  it('does not drop any header from the shared list', async () => {
    const rules = await nextConfig.headers!();
    const served = new Set(rules[0]!.headers.map((h) => h.key));

    for (const { key } of SECURITY_HEADERS) {
      expect(served, `${key} must be served`).toContain(key);
    }
  });

  it('compiles @forge/shared rather than treating it as a prebuilt external', () => {
    expect(nextConfig.transpilePackages).toContain('@forge/shared');
  });
});
