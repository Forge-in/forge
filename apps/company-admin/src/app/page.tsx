import { redirect } from 'next/navigation';

/**
 * `proxy.ts` already routes `/` to the console or the login screen. This exists
 * as the fallback for any request that reaches the app without passing through
 * the gate (a direct render in tests, a custom server).
 */
export default function RootPage(): never {
  redirect('/overview');
}
