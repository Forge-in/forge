/**
 * Baseline response headers for every Forge web surface.
 *
 * Lives here rather than in one app's next.config because it was already duplicated-by-
 * omission: company-admin had these and gym-owner served none, so the gym owner
 * dashboard — which can change staff access and billing details — was framable. A single
 * exported list means a new web app inherits the baseline instead of forgetting it.
 *
 * Plain `{ key, value }` data on purpose: no Next types, so a non-Next surface (a BFF
 * route, an Express edge, a static export) can apply the same set.
 */
export interface HttpHeader {
  readonly key: string;
  readonly value: string;
}

export const SECURITY_HEADERS: readonly HttpHeader[] = [
  // Clickjacking a destructive control ("Suspend gym", "Remove trainer") is a real
  // attack against both consoles, not a theoretical one.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Belt and braces with X-Frame-Options — and the only one modern browsers honour.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Console URLs carry gym ids and search terms; they must not leak cross-origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
] as const;
