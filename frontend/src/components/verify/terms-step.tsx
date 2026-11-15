"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import type { Panel, ScreenContext } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * Terms & Privacy — every agreement must be ticked before Continue is enabled.
 *
 * The static consent panel rendered real checkboxes but the footer's Continue
 * was a plain link, so the flow advanced whether or not anything was accepted.
 * This client version gates the footer: Continue stays disabled until BOTH
 * statements are ticked (tick one, not the other, and you cannot continue), then
 * it navigates to the next slug. Consent that is pre-ticked is not consent, so
 * every box starts empty.
 */
export function TermsStepClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const panel = ctx.screen.panel as Extract<Panel, { kind: "consent" }>;
  const agreements = useMemo(() => panel.agreements ?? [], [panel.agreements]);
  const [checked, setChecked] = useState<boolean[]>(() => agreements.map(() => false));

  const allChecked = checked.length > 0 && checked.every(Boolean);
  const next = ctx.screen.next?.to;

  const nav = {
    onNext: () => {
      if (allChecked && next) router.push(`/verify/${next}`);
    },
    nextDisabled: !allChecked,
  };

  const toggle = (i: number) => setChecked((c) => c.map((v, j) => (j === i ? !v : v)));

  return (
    <FlowShell ctx={ctx} nav={nav}>
      <div className="ml-auto flex w-full max-w-[430px] flex-col gap-2.5">
        {agreements.map((agreement, i) => (
          <label
            key={agreement}
            className={cn(
              "group flex cursor-pointer items-center gap-3 rounded-well border bg-white px-3.5 py-3 transition-colors",
              checked[i] ? "border-pine/35" : "border-divider hover:border-pine/28",
            )}
          >
            {/* The control is a ticked circle, not a plain filled dot: it shows a
                check when on, so accepting reads unambiguously. */}
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={() => toggle(i)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                checked[i] ? "border-lime bg-lime text-pine" : "border-pine/25 bg-white",
              )}
            >
              {checked[i] ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="text-read text-pine/82">{agreement}</span>
          </label>
        ))}

        {!allChecked ? (
          <p className="m-0 pt-1 text-eyebrow text-pine/60" role="status" aria-live="polite">
            Tick both agreements to continue.
          </p>
        ) : null}
      </div>
    </FlowShell>
  );
}
