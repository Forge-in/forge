import { OwnerProvider } from '@/components/console/owner-provider';
import { RegisterDialog } from '@/components/console/register-dialog';
import { Sidebar } from '@/components/console/sidebar';
import { Toast } from '@/components/console/toast';
import { ToastProvider } from '@/components/console/toast-provider';
import { TopBar } from '@/components/console/top-bar';
import { DEFAULT_GYM_PROFILE } from '@/lib/data';
import { ownerDisplayName, requireOwner } from '@/lib/dal';
import { firstName } from '@/lib/format';
import { greeting } from '@/lib/metrics';
import type { PageHeading } from '@/lib/navigation';

/**
 * The console shell: fixed sidebar, sticky page header, one scrolling content
 * column. Height is pinned to the viewport so the sidebar and header never move
 * and only the content scrolls — the behaviour an owner expects from a
 * dashboard they keep open on the desk all day.
 *
 * THIS IS ALSO THE AUTHORIZATION BOUNDARY for everything in the route group.
 *
 * `proxy.ts` already redirected anyone without a session cookie, but that check
 * cannot tell a live session from a forged cookie — it reads a name and nothing
 * more. `requireOwner()` asks the API to verify the signature, consult the
 * revocation list and re-read the membership, which is what makes a removed
 * owner's open tab stop working rather than keep rendering their gym.
 *
 * A layout is the right place for it precisely because a page is not: adding a
 * route under `(console)/` inherits the guard, where a per-page check is one
 * someone can forget, and the omission looks like nothing at all in a diff.
 */
export default async function ConsoleLayout({ children }: LayoutProps<'/'>) {
  const session = await requireOwner();
  const ownerName = ownerDisplayName(session);

  /**
   * The overview's heading, computed here rather than in the client.
   *
   * Two reasons. The greeting depends on the time of day, and a browser in
   * another timezone would render a different word from the server — a
   * hydration mismatch on the page's largest heading. And the gym's name comes
   * from the verified membership, which only exists server-side.
   */
  const overviewHeading: PageHeading = {
    crumb: `Ops · ${session.membership.studioName || DEFAULT_GYM_PROFILE.name}`,
    title: `${greeting()}, ${firstName(ownerName)}`,
  };

  return (
    <ToastProvider>
      <OwnerProvider>
        <div className="bg-bg text-ink relative flex h-dvh overflow-hidden">
          {/* The ambient glow behind the header. Decorative and non-interactive,
              so it never intercepts a click meant for the content under it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-[260px] left-[180px] h-[600px] w-[760px] rounded-full"
            style={{
              background: 'radial-gradient(ellipse, var(--ow-glow) 0%, rgb(0 0 0 / 0) 68%)',
            }}
          />

          <Sidebar />

          <div className="relative z-1 flex min-w-0 flex-1 flex-col">
            <TopBar ownerName={ownerName} overviewHeading={overviewHeading} />
            <main className="min-h-0 flex-1 overflow-y-auto px-7 pt-[26px] pb-[34px]">
              {children}
            </main>
          </div>

          <RegisterDialog />
          <Toast />
        </div>
      </OwnerProvider>
    </ToastProvider>
  );
}
