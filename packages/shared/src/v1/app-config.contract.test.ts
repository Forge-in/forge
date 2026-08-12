import { describe, expect, it } from 'vitest';

import { appConfigResponse, compareVersions, isBelowMinimum } from './app-config.contract.js';

/**
 * Version comparison decides whether a user's app keeps working. Getting it wrong in the
 * strict direction locks out people who DID update, which is a self-inflicted outage
 * affecting exactly the users who did the right thing.
 */
describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],
    ['2.0.0', '1.9.9', 1],
    ['1.1.0', '1.0.9', 1],
  ])('compares %s to %s as %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  /**
   * THE case. Lexicographically "1.10.0" < "1.9.0", because '1' sorts before '9'. A string
   * comparison here would reject a newer build as too old.
   */
  it('treats 1.10.0 as newer than 1.9.0', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect('1.10.0' < '1.9.0').toBe(true); // what the naive version would have concluded
  });

  it('treats 1.2 and 1.2.0 as equal, so a missing patch segment is not "older"', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.2')).toBe(0);
  });

  it('handles a longer version string', () => {
    expect(compareVersions('1.2.3.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3.4')).toBe(-1);
  });

  it('handles large numbers, where digit count would mislead', () => {
    expect(compareVersions('1.100.0', '1.99.0')).toBe(1);
    expect(compareVersions('10.0.0', '9.99.99')).toBe(1);
  });

  /**
   * A prerelease suffix degrades to "older" rather than poisoning the comparison with NaN.
   * NaN would make every comparison false and let ANY build through — failing open on the
   * one check that is meant to stop a broken build.
   */
  it('degrades a non-numeric segment to 0 instead of NaN', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0-beta', '1.2.1')).toBe(-1);
    expect(Number.isNaN(compareVersions('garbage', '1.0.0'))).toBe(false);
  });
});

describe('isBelowMinimum', () => {
  it.each([
    ['1.9.0', '2.0.0', true],
    ['2.0.0', '2.0.0', false],
    ['2.0.1', '2.0.0', false],
    ['1.10.0', '1.9.0', false],
  ])('%s below %s is %s', (version, minimum, expected) => {
    expect(isBelowMinimum(version, minimum)).toBe(expected);
  });

  /** The permissive default: 0.0.0 must never reject anything. */
  it('never rejects when the floor is 0.0.0', () => {
    expect(isBelowMinimum('0.0.1', '0.0.0')).toBe(false);
    expect(isBelowMinimum('0.0.0', '0.0.0')).toBe(false);
  });
});

describe('appConfigResponse', () => {
  it('accepts a minimal policy and defaults the optional parts', () => {
    const result = appConfigResponse.safeParse({
      minSupported: '1.0.0',
      latest: '1.2.0',
      message: 'Please update',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults matter: a policy written by hand during an incident should not need every
      // field to be valid.
      expect(result.data.maintenance).toBe(false);
      expect(result.data.flags).toEqual({});
    }
  });

  it('accepts a maintenance window with an explanation', () => {
    const result = appConfigResponse.safeParse({
      minSupported: '1.0.0',
      latest: '1.2.0',
      message: 'update',
      maintenance: true,
      maintenanceMessage: 'Back at 3am IST',
    });

    expect(result.success).toBe(true);
  });

  it('accepts resolved feature flags', () => {
    const result = appConfigResponse.safeParse({
      minSupported: '1.0.0',
      latest: '1.0.0',
      message: 'ok',
      flags: { newBilling: true, oldReports: false },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.flags.newBilling).toBe(true);
  });

  it('rejects a store URL that is not a URL, which would break the deep link', () => {
    const result = appConfigResponse.safeParse({
      minSupported: '1.0.0',
      latest: '1.0.0',
      message: 'ok',
      storeUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('requires the fields a blocking screen cannot render without', () => {
    expect(appConfigResponse.safeParse({ minSupported: '1.0.0' }).success).toBe(false);
    expect(appConfigResponse.safeParse({}).success).toBe(false);
  });
});
