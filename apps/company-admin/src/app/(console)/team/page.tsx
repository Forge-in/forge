import type { Metadata } from 'next';

import { AdminInvitesTable } from '@/components/admins/admin-invites-table';
import { AdminsTable } from '@/components/admins/admins-table';
import { consoleApi } from '@/lib/api';
import { requireAdmin } from '@/lib/dal';

export const metadata: Metadata = { title: 'Team & roles' };

/**
 * Platform admins and their outstanding invites.
 *
 * A SERVER component, and that is the security design rather than a rendering preference:
 * the session token lives in an httpOnly cookie the browser cannot read, so the only place
 * these lists can be fetched is here. The browser receives rendered rows, never a credential.
 *
 * WHAT THIS PAGE USED TO SHOW. A mock "internal team" of seven people with roles named
 * Superadmin / Ops / Finance / Support, and a permissions matrix describing what each could
 * do. None of it existed — Forge has exactly one platform role, and a schema test
 * (schema-contract.int-test.ts) exists specifically to stop those display labels being
 * mistaken for authorization. A matrix documenting four roles that cannot be granted is
 * worse than no matrix: it is a page people would plan around. It is gone until sub-roles
 * are real, at which point it should be generated from the roles rather than hand-written.
 */
export default async function TeamPage() {
  const { admin } = await requireAdmin();

  /**
   * Both lists in parallel. They are independent reads and the page needs both, so
   * sequencing them would just add a round trip to every load.
   *
   * NOT wrapped in a try/catch. An API refusal here means the session died between the
   * layout's check and this call, and `requireAdmin` has already routed that to sign-in; a
   * network failure is genuinely exceptional and belongs to the console's error boundary,
   * which offers a retry. Catching either would replace a working recovery path with an
   * empty table that looks like "there are no admins" — the most alarming possible lie on
   * this particular screen.
   */
  const api = consoleApi();
  const [{ admins }, { invites }] = await Promise.all([api.listAdmins(), api.listInvites()]);

  /**
   * The clock is read ONCE, on the server, and passed down.
   *
   * Every relative timestamp on this page is derived from it. Letting each component call
   * `new Date()` would make the server and client render different text for the same row and
   * produce a hydration mismatch — the classic way "2 minutes ago" starts throwing console
   * errors.
   */
  const now = new Date().toISOString();

  /** Newest first: a freshly added admin is the row an operator is looking for. */
  const sortedAdmins = [...admins].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  /** Soonest to expire first: the ones needing attention are the ones about to lapse. */
  const sortedInvites = [...invites].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <AdminsTable admins={sortedAdmins} currentAdminId={admin.adminId} now={now} />
      <AdminInvitesTable invites={sortedInvites} admins={sortedAdmins} now={now} />

      <p className="t-sm leading-prose text-muted max-w-[620px] text-pretty">
        Every admin here has the same access: every gym, every plan, every invoice. There are no
        lesser roles yet, so treat an invite as handing over the whole platform. Suspending someone
        signs them out everywhere immediately — not when their session expires.
      </p>
    </div>
  );
}
