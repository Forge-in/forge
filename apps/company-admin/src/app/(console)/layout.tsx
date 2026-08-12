import { ConsoleProvider } from '@/components/console/console-provider';
import { InviteDrawer } from '@/components/console/invite-drawer';
import { Sidebar } from '@/components/console/sidebar';
import { Toast } from '@/components/console/toast';
import { ToastProvider } from '@/components/console/toast-provider';
import { TopBar } from '@/components/console/top-bar';
import { requireAdmin } from '@/lib/dal';

/**
 * The console shell: fixed sidebar, sticky page header, one scrolling content
 * column. Height is pinned to the viewport so the sidebar and header never move
 * and only the content scrolls — the behaviour an operator expects from a
 * dashboard they keep open all day.
 *
 * THIS IS ALSO THE AUTHORIZATION BOUNDARY for everything in the route group.
 *
 * `proxy.ts` already redirected anyone without a session cookie, but that check cannot tell
 * a live session from a forged cookie — it reads a name and nothing more. `requireAdmin()`
 * asks the API to verify the signature, consult the revocation list, and re-read the
 * account's status, which is what makes a suspended administrator's open tab stop working
 * rather than keep rendering.
 *
 * A layout is the right place for it precisely because a page is not: adding a route under
 * `(console)/` inherits the guard, where a per-page check is one someone can forget, and the
 * omission looks like nothing at all in a diff.
 */
export default async function ConsoleLayout({ children }: LayoutProps<'/'>) {
  const { admin } = await requireAdmin();

  return (
    <ToastProvider>
      <ConsoleProvider>
        <div className="bg-canvas text-ink flex h-dvh overflow-hidden">
          {/* The verified identity is passed down rather than re-fetched: `requireAdmin` is
              memoised per render pass, but threading the value makes the dependency
              obvious at the call site instead of implicit in a cache. */}
          <Sidebar admin={admin} />

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">{children}</main>
          </div>

          <InviteDrawer />
          <Toast />
        </div>
      </ConsoleProvider>
    </ToastProvider>
  );
}
