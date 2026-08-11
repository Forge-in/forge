import { ConsoleProvider } from '@/components/console/console-provider';
import { InviteDrawer } from '@/components/console/invite-drawer';
import { Sidebar } from '@/components/console/sidebar';
import { Toast } from '@/components/console/toast';
import { ToastProvider } from '@/components/console/toast-provider';
import { TopBar } from '@/components/console/top-bar';

/**
 * The console shell: fixed sidebar, sticky page header, one scrolling content
 * column. Height is pinned to the viewport so the sidebar and header never move
 * and only the content scrolls — the behaviour an operator expects from a
 * dashboard they keep open all day.
 */
export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return (
    <ToastProvider>
      <ConsoleProvider>
        <div className="bg-canvas text-ink flex h-dvh overflow-hidden">
          <Sidebar />

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
