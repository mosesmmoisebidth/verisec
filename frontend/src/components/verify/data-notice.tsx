import { Check, ShieldCheck } from "lucide-react";

import type { DataNotice } from "@/lib/verify/types";

/**
 * "How we handle your data" note for the biometric steps, shown in the left
 * explainer column under its body copy. Compact on purpose: it sits beside the
 * step's main content and must leave the footer (Start) visible without
 * scrolling. Links open in a new tab so the applicant never loses the flow.
 */
export function DataNoticeCard({ notice }: { notice: DataNotice }) {
  return (
    <section
      aria-labelledby="data-notice-title"
      className="flex flex-col gap-3 rounded-well border border-divider bg-white/70 p-4"
    >
      <h2 id="data-notice-title" className="m-0 flex items-center gap-2 text-body font-medium text-pine">
        <ShieldCheck aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
        {notice.title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {notice.points.map((point) => (
          <li key={point} className="flex gap-2 text-eyebrow leading-snug text-quiet">
            <span className="mt-px grid size-3.5 shrink-0 place-items-center rounded-full bg-lime text-pine">
              <Check aria-hidden className="size-2" strokeWidth={3.2} />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-divider pt-2.5 text-eyebrow text-quiet">
        {notice.links.map((link, i) => (
          <span key={link.href} className="inline-flex items-center gap-1.5">
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-pine underline underline-offset-2 transition-colors hover:text-pine/75"
            >
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {i < notice.links.length - 1 ? <span aria-hidden>·</span> : null}
          </span>
        ))}
      </p>
    </section>
  );
}
