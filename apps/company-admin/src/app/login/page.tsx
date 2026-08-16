import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginScreen } from '@/components/auth/login-screen';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function LoginPage() {
  // `LoginScreen` reads `?next=`, so it needs a boundary to stay statically
  // renderable up to the point the search params are known.
  return (
    <Suspense fallback={<div className="bg-canvas min-h-dvh" />}>
      <LoginScreen />
    </Suspense>
  );
}
