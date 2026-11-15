"use client";

import { useState } from "react";

import type { AccordionItem } from "@/config/home";
import { TrustAccordion } from "@/components/sections/card-accordion";
import { Lottie } from "@/components/ui/lottie";

/**
 * Interactive half of the trust-problem section: the accordion drives which
 * animation shows on the right, matching the Figma where the open problem's
 * illustration is the one on display.
 */
export function TrustProblemVisual({
  items,
  defaultOpenId,
}: {
  items: readonly AccordionItem[];
  defaultOpenId: string;
}) {
  const [open, setOpen] = useState<string[]>([defaultOpenId]);
  const openId = open[0] ?? defaultOpenId;
  const active = items.find((i) => i.id === openId) ?? items[0];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <TrustAccordion items={items} value={open} onValueChange={setOpen} />
      <div className="mx-auto grid aspect-square w-full max-w-[560px] place-items-center rounded-site-card bg-surface/60 p-4">
        {active?.lottie ? (
          <Lottie
            key={active.lottie}
            name={active.lottie}
            ariaLabel={active.title}
            className="h-full w-full"
          />
        ) : null}
      </div>
    </div>
  );
}
