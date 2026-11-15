import { Suspense } from "react";

import { Loading } from "@/components/finance/parts";
import { ScanDetail } from "@/components/finance/scan-detail";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { DETAIL } from "@/lib/finance/content";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Scan · Financial · VeriSec" };

/**
 * One scan, by `?id=`. A query parameter rather than a `[id]` route because
 * scans are created after the site is built, and a static export can only
 * pre-render ids it knows at build time.
 */
export default async function FinanceScanPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <Suspense fallback={<Loading label={DETAIL.loading} />}>
        <ScanDetail />
      </Suspense>
    </FinanceShell>
  );
}
