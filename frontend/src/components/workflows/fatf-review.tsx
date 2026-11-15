"use client";

import { useEffect, useState } from "react";
import { Check, Globe, Loader2, X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/access";
import { workflowsApi, type FatfState } from "@/lib/console/workflows-api";

/**
 * A banner on the Workflows page when the FATF high-risk / monitored list has changed upstream.
 *
 * The server never changes a compliance list on its own: it reads a public mirror weekly and holds any difference
 * here for a person to confirm (see FatfService). Applying it updates every workflow that screens on FATF countries
 * and the builder preset at once; keeping the current list leaves everything as it is. Nothing shows when the list
 * in force already matches.
 */
export function FatfReview() {
  const canManage = useAccess().can("workflows.manage");
  const [state, setState] = useState<FatfState | null>(null);
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    void workflowsApi.fatf().then((r) => {
      if (r.ok) setState(r.data);
    });
  }, []);

  const pending = state?.pending;
  if (!pending || hidden) return null;

  const name = (c: string) => state?.names?.[c] ?? c;
  const list = (codes: string[]) => codes.map(name).join(", ");

  const approve = async () => {
    setBusy("approve");
    const r = await workflowsApi.fatfApprove();
    setBusy(null);
    if (!r.ok || !r.data.ok) {
      toast.error("Couldn't update the FATF list", r.ok ? r.data.reason ?? "" : r.message);
      return;
    }
    toast.success("FATF list updated", "Every workflow that screens on FATF countries now uses the new list.");
    setHidden(true);
  };

  const dismiss = async () => {
    setBusy("dismiss");
    const r = await workflowsApi.fatfDismiss();
    setBusy(null);
    if (!r.ok || !r.data.ok) {
      toast.error("Couldn't dismiss", r.ok ? r.data.reason ?? "" : r.message);
      return;
    }
    toast.success("Left unchanged", "The current FATF list stays in force.");
    setHidden(true);
  };

  return (
    <section className="flex flex-col gap-3 rounded-shell border border-caution/30 bg-caution-tint/40 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-caution/15 text-caution">
          <Globe className="size-4" strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-body font-medium text-pine">The FATF high-risk list has changed</p>
          <p className="m-0 text-micro text-slate">
            The public list{pending.asOf.greylist ? ` (as of ${pending.asOf.greylist})` : ""} differs from the one your
            workflows use. Review the change and apply it, or keep the current list.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-box border border-hairline bg-page p-3">
        {pending.added.length ? (
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-micro">
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ramp-2">
              <Check aria-hidden className="size-3.5" strokeWidth={2.2} /> Add
            </span>
            <span className="text-pine">{list(pending.added)}</span>
          </p>
        ) : null}
        {pending.removed.length ? (
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-micro">
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-danger">
              <X aria-hidden className="size-3.5" strokeWidth={2.2} /> Remove
            </span>
            <span className="text-pine">{list(pending.removed)}</span>
          </p>
        ) : null}
        <p className="m-0 text-[11px] text-muted">
          Source: {pending.source}. The committed list stays the fallback, so nothing changes until you apply it.
        </p>
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={approve}
            className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-pine px-4 text-micro font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
          >
            {busy === "approve" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden className="size-3.5" strokeWidth={2.2} />}
            Apply the update
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={dismiss}
            className="inline-flex h-9 items-center rounded-pill border border-hairline bg-page px-4 text-micro font-medium text-pine transition-colors hover:bg-hover-panel disabled:opacity-60"
          >
            {busy === "dismiss" ? <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" /> : null}
            Keep current list
          </button>
        </div>
      ) : (
        <p className="m-0 text-micro text-slate">An administrator can review and apply this change.</p>
      )}
    </section>
  );
}
