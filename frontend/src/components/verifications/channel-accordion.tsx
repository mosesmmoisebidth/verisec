"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { CheckGlyph } from "@/components/ui/component-icon";
import { Tile } from "@/components/verifications/parts";
import type { ContactTab } from "@/lib/console/types";
import { cn } from "@/lib/utils";

type Channel = ContactTab["channels"][number];

/**
 * One channel card on the Contact tab (Phone / Email) — Desktop-56.
 *
 * Each card is its own accordion: exactly one section open at a time, and
 * opening a second closes the first *within this card only*. The two cards keep
 * independent state, so Phone's "Line intelligence" and Email's "Reputation"
 * can both sit open at once — opening one never disturbs the other column.
 *
 * The height animates with the `grid-template-rows: 0fr → 1fr` technique so the
 * panel slides rather than snapping (the "jump" the native `<details>` gave),
 * and because these are plain buttons the console shell's global
 * `DetailsAutoClose` — which collapses every open `<details>` on any outside
 * click — no longer reaches in and closes them.
 */
export function ChannelAccordion({ channel }: { channel: Channel }) {
  const seeded = channel.sections.findIndex((s) => s.open);
  const [openIndex, setOpenIndex] = useState(seeded >= 0 ? seeded : -1);

  return (
    <Tile className="flex flex-col gap-2">
      <h4 className="m-0 flex items-center gap-2 text-body font-medium text-pine">
        <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-lime-tint text-pine">
          <CheckGlyph icon={channel.icon} className="size-3.5" />
        </span>
        {channel.title}
      </h4>

      {channel.sections.map((section, i) => {
        const isOpen = i === openIndex;
        return (
          <div
            key={section.label}
            className="border-t border-rule pt-2 first:border-t-0 first:pt-0"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 py-1 text-left text-body text-pine"
            >
              {section.label}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-muted transition-transform duration-200 ease-out",
                  isOpen && "rotate-180",
                )}
                strokeWidth={1.8}
              />
            </button>

            {/* The 0fr↔1fr grid-rows slide. The animated track child must be a
                bare `min-h-0 overflow-hidden` wrapper with NO padding of its
                own, any padding on the grid child is a non-collapsible floor
                that stops `0fr` reaching zero (a cut sliver peeks under a closed
                header) and mis-sizes `1fr`. Padding lives on the inner <dl>. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <dl className="m-0 flex flex-col gap-1.5 pt-1 pb-2">
                  {section.rows.map((row) => (
                    <div key={row.term} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-micro text-muted">{row.term}</dt>
                      <dd className="m-0 min-w-0 text-right text-micro text-pine">{row.detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        );
      })}
    </Tile>
  );
}
