import { SECURITY_HEADERS } from '@forge/shared';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @forge/shared is a workspace package; let Next compile it rather than
  // treating it as a pre-built external.
  transpilePackages: ['@forge/shared'],

  // Baseline headers live in @forge/shared/web so every web surface inherits them.
  // This app can suspend organisations and rotate keys, so the defaults matter: it must
  // never be framed, and it must not leak the URLs an operator visits — those paths
  // carry organisation ids and search terms.
  async headers() {
    return [{ source: '/:path*', headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
