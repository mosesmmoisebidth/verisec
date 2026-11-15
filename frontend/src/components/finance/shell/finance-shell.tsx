import type { ReactNode } from "react";

import { DetailsAutoClose } from "@/components/shell/details-autoclose";
import { PageAccess } from "@/components/shell/page-access";
import { RequireAuth } from "@/components/shell/require-auth";
import { IdleSessionTimeout } from "@/components/shell/idle-session-timeout";
import type { FinShellData } from "@/lib/finance/types";

import { DeepReadWarmup } from "./deep-read-warmup";
import { FinanceSidebar } from "./finance-sidebar";
import { FinanceTopbar } from "./finance-topbar";

/**
 * The chrome every Financial Portal page sits in.
 *
 * The same frame as the KYC console's `ConsoleShell` (fixed viewport, rail on
 * the left, topbar, one scrolling `main`), with the Financial rail and topbar.
 * Auth and the outside-click menu closer are the console's own components.
 *
 * On merge day this and `ConsoleShell` become one component that takes the
 * portal's nav; nothing below needs to change for that.
 */
export function FinanceShell({ shell, children }: { shell: FinShellData; children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-page">
      <RequireAuth />
      <IdleSessionTimeout />
      <DetailsAutoClose />
      <DeepReadWarmup />
      <FinanceSidebar shell={shell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <FinanceTopbar shell={shell} />
        <main className="min-w-0 flex-1 overflow-y-auto px-gutter py-6">
          <div className="mx-auto flex w-full max-w-content flex-col gap-row">
            {/* a page this person's role can't open shows the shared "not part of your role" panel */}
            <PageAccess portal="fin">{children}</PageAccess>
          </div>
        </main>
      </div>
    </div>
  );
}
