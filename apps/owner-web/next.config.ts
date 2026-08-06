import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @forge/shared is a workspace package; let Next compile it rather than
  // treating it as a pre-built external.
  transpilePackages: ['@forge/shared'],
};

export default nextConfig;
