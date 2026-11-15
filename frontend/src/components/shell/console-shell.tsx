import type { ReactNode } from "react";

import { DetailsAutoClose } from "./details-autoclose";
import { PageAccess } from "./page-access";
import { RequireAuth } from "./require-auth";
import { IdleSessionTimeout } from "./idle-session-timeout";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellData } from "@/lib/console/types";

/**
 * The chrome every console page sits in.
 *
 * One component rather than a route-group layout, because a layout cannot read
 * the data a page already awaited and would fetch the shell a second time. The
 * rail highlights the current entry from `usePathname()`, so a new page needs
 * nothing here beyond existing.
 *
 * `h-dvh` plus an inner scroll region keeps the rail and topbar in place while
 * content scrolls under them.
 */
export function ConsoleShell({ shell, children }: { shell: ShellData; children: ReactNode }) {
  return (
    // `fixed inset-0` locks the shell to the viewport and keeps it out of the
    // document flow, so the body never grows past the viewport and the window
    // itself never scrolls — only `main` does. (A plain `h-dvh` here leaked a
    // second, window-level scrollbar next to the content one.)
    <div className="fixed inset-0 flex overflow-hidden bg-page">
      <RequireAuth />
      <IdleSessionTimeout />
      <DetailsAutoClose />
      <Sidebar shell={shell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar shell={shell} />
        <main className="min-w-0 flex-1 overflow-y-auto px-gutter py-6">
          <div className="mx-auto flex w-full max-w-content flex-col gap-row">
            {/* a page the person's role does not include shows why instead (the console refuses its data anyway) */}
            <PageAccess portal="kyc">{children}</PageAccess>
          </div>
        </main>
      </div>
    </div>
  );
}
