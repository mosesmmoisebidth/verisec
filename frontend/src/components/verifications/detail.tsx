import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Download, ShieldCheck } from "lucide-react";

import { WarningList } from "@/components/verifications/evidence";
import { DetailGroups } from "@/components/verifications/groups";
import { VerdictBadge } from "@/components/verifications/parts";
import type { SealBadge, VerificationDetail, VerificationTab, VerificationTabId } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The chrome around a verification's nine tabs — Desktop-33 and its eight
 * siblings, which differ only in what fills the right card.
 *
 * The tab strip is a set of LINKS, not client state. Each tab gets its own URL,
 * so a reviewer can be sent straight to the NFC panel, the browser's back
 * button works, and the whole screen stays a server component with no JS. The
 * cost is a navigation per tab; on a static export that is a prefetched HTML
 * file, which is cheaper than the alternative.
 */
export function VerificationDetailView({
  record,
  tabs,
  current,
  children,
  tabHref,
  actions,
}: {
  record: VerificationDetail;
  tabs: VerificationTab[];
  current: VerificationTabId;
  children: ReactNode;
  /** Where each tab links to (live records use one page with ?tab=). Defaults to /verifications/{id}/{tab}. */
  tabHref?: (tab: VerificationTabId) => string;
  /** Operator controls shown in the header (live records). Replaces the unwired download button. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={record.backHref}
            className="inline-flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine"
          >
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            {record.backLabel}
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">
              {record.applicant}
            </h1>
            <VerdictBadge verdict={record.verdict} />
          </div>
        </div>

        {actions ?? (
        /* A button, not a link: there is no report endpoint yet, and a link to
            nowhere is worse than a control that is visibly not wired. */
        <button
          type="button"
          className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-opacity hover:opacity-90"
        >
          <Download aria-hidden className="size-4" strokeWidth={2} />
          {record.downloadLabel}
        </button>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[379fr_661fr] lg:gap-[54px]">
        {/* Left: the seal, then what matters for the open tab. On large screens both columns
            have the same fixed height and scroll inside, so the page itself stays still. */}
        <div className="flex min-w-0 flex-col gap-4 lg:h-[calc(100dvh-190px)] lg:min-h-[520px] lg:overflow-y-auto lg:pr-1">
          <TrustSeal seal={record.seal} progress={record.progress} />
          <SidePanel side={record.side} current={current} />
        </div>

        <section className="flex min-w-0 flex-col gap-4 rounded-shell border border-edge bg-panel p-6 lg:h-[calc(100dvh-190px)] lg:min-h-[520px]">
          <TabStrip tabs={tabs} current={current} id={record.id} tabHref={tabHref} />
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:-mr-3 lg:overflow-y-auto lg:pr-3">{children}</div>
        </section>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Side panel (live records)
---------------------------------------------------------------------------- */

function SidePanel({ side, current }: { side?: VerificationDetail["side"]; current: VerificationTabId }) {
  const groups = side?.groups?.[current];
  const flags = side?.flags?.[current];
  if (!flags && !groups?.length) return null;
  return (
    <section className="flex flex-col gap-5 rounded-shell border border-edge bg-panel p-5">
      {flags && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 flex items-center justify-between gap-2 text-section font-medium text-pine">
            Warnings
            {flags.length ? <span className="tnum rounded-pill bg-well px-2 py-0.5 text-micro font-normal text-slate">{flags.length}</span> : null}
          </h3>
          <WarningList flags={flags} limit={6} />
        </div>
      )}
      <DetailGroups groups={groups} compact />
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Trust Seal
---------------------------------------------------------------------------- */

const R = 76;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * The score dial and its badges.
 *
 * The arc is the score, drawn from the same number the ring's centre prints —
 * a stored arc length and a stored figure are two things that can disagree, and
 * on a trust score they must not.
 */
function TrustSeal({ seal, progress }: { seal: VerificationDetail["seal"]; progress?: VerificationDetail["progress"] }) {
  // An unfinished session has no seal yet: the dial shows how far the applicant got instead.
  const unfinished = !!seal.provisional && !!progress && progress.state !== "completed" && progress.state !== "redacted";
  const value = unfinished ? progress!.percent : seal.score;
  const swept = CIRCUMFERENCE * (Math.max(0, Math.min(100, value)) / 100);
  const stroke = unfinished
    ? progress!.state === "abandoned"
      ? "var(--color-caution)"
      : "var(--color-lime)"
    : seal.rule === "knockout"
      ? "var(--color-danger)"
      : seal.rule && seal.rule !== "clear"
        ? "var(--color-caution)"
        : "var(--color-lime)";

  return (
    <section className="flex flex-col items-center gap-3 rounded-shell border border-edge bg-panel p-6">
      <div className="relative grid size-[180px] place-items-center">
        <svg viewBox="0 0 180 180" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--color-well)" strokeWidth="12" />
          <circle cx="90" cy="90" r={R} fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${swept} ${CIRCUMFERENCE}`} />
        </svg>
        <span className="relative flex flex-col items-center gap-1">
          <ShieldCheck aria-hidden className={cn("size-7", unfinished ? "text-muted" : "text-lime")} strokeWidth={1.6} />
          <span className="tnum text-stat font-medium text-pine">{unfinished ? `${value}%` : value}</span>
          <span className="text-micro tracking-[0.564px] text-muted uppercase">{unfinished ? (progress!.state === "abandoned" ? "Stopped" : "In progress") : seal.label}</span>
        </span>
      </div>
      {unfinished ? (
        <p className="m-0 max-w-[30ch] text-center text-micro text-muted">
          No Trust Seal until the applicant finishes. {progress!.at ? `${progress!.state === "abandoned" ? "Stopped at" : "Now at"} ${progress!.at.toLowerCase()}.` : null}
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
        {seal.badges.map((badge) => (
          <li key={badge.label}>
            <Badge {...badge} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One seal badge.
 *
 * Lit means the check produced a clear result; dim means it did not run. The
 * AML tab's own copy says as much — "the AML-clear badge dim until it's live
 * for your account" — so the state is spelled out for a screen reader too
 * rather than being left to the fill colour.
 */
function Badge({ label, on }: SealBadge) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-micro",
        on ? "bg-pine text-lime" : "bg-inert-tint text-inert",
      )}
    >
      {label}
      <span className="sr-only">{on ? ", cleared" : ", not run"}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Tab strip
---------------------------------------------------------------------------- */

function TabStrip({
  tabs,
  current,
  id,
  tabHref,
}: {
  tabs: VerificationTab[];
  current: VerificationTabId;
  id: string;
  tabHref?: (tab: VerificationTabId) => string;
}) {
  return (
    // The strip overflows its card at every width the frames draw, so it
    // scrolls rather than wrapping — a nine-item tab bar on two lines stops
    // reading as one control. The fade marks that there is more to the right.
    <div className="relative -mx-1">
      <nav
        aria-label="Verification detail"
        className="flex gap-0.5 overflow-x-auto rounded-tab bg-page p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const active = tab.id === current;
          return (
            <Link
              key={tab.id}
              href={tabHref ? tabHref(tab.id) : `/verifications/${id}/${tab.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-well px-3.5 py-2 text-body whitespace-nowrap transition-colors",
                active
                  ? "bg-lime-tint font-medium text-pine"
                  : "text-slate hover:bg-hover-light hover:text-pine",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-0 w-10 rounded-r-tab bg-[linear-gradient(90deg,transparent,var(--color-page))]"
      />
    </div>
  );
}
