import type { NextConfig } from 'next';

/**
 * Baseline security headers for the console.
 *
 * This app can suspend organisations and rotate keys, so the defaults matter:
 * it must never be framed (clickjacking a "Suspend" button is a real attack),
 * and it must not leak the URLs an operator visits — those paths carry
 * organisation ids and search terms.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Belt and braces with X-Frame-Options, and the only one modern browsers honour.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // @forge/shared is a workspace package; let Next compile it rather than
  // treating it as a pre-built external.
  transpilePackages: ['@forge/shared'],

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
