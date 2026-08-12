import { ForgeApiError } from '@forge/api-client';
import { redirect } from 'next/navigation';

import { serverApi } from '../lib/api';
import { readSession } from '../lib/session';

/**
 * The first screen in this repo backed by real data.
 *
 * A server component, so the API call happens with the httpOnly cookie attached and no token
 * ever reaches the browser.
 */
export default async function Home() {
  const { accessToken } = await readSession();
  if (!accessToken) redirect('/login');

  let me;
  try {
    me = await serverApi().me();
  } catch (error) {
    /**
     * A session can die between the cookie existing and the request being made — revoked,
     * expired past refresh, or the membership removed. Sending the user to sign in is the
     * only useful response; rendering an error page they cannot act on is not.
     */
    if (error instanceof ForgeApiError && error.requiresSignIn) redirect('/login');
    throw error;
  }

  return (
    <main className="flex flex-1 flex-col gap-8 p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {me.membership.studioName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {me.user.fullName ?? me.user.phone}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as {me.membership.role.replace('_', ' ')}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Accessible branches" value={String(me.accessibleGymIds.length)} />
        <Stat label="Studios you belong to" value={String(me.memberships.length)} />
        <Stat label="Role" value={me.membership.role} />
      </section>

      <p className="max-w-prose text-sm text-zinc-500 dark:text-zinc-400">
        Branch access is resolved server-side, once per request, and sent here already decided — so
        this page can never disagree with what the API would allow. Membership is held at the
        studio, so every branch above is reachable on one pass.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
