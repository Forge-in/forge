import { SECURITY_HEADERS } from '@forge/shared';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @forge/shared is a workspace package; let Next compile it rather than
  // treating it as a pre-built external.
  transpilePackages: ['@forge/shared'],

  // This dashboard can change staff access and billing details, so it gets the same
  // baseline as the platform console. The list is shared (see @forge/shared/web) because
  // it was previously present in admin and absent here — exactly the drift a preset prevents.
  async headers() {
    return [{ source: '/:path*', headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
