"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FlowShell } from "@/components/verify/flow-shell";
import type { ScreenContext } from "@/lib/verify/types";
import { readFlow } from "@/lib/verify/flow-store";
import type { FindingRow, FindingSection, FindingTone, Findings } from "@/lib/verify/kyc-api";
import { cn } from "@/lib/utils";

/**
 * "Here's What We Found": Figma VeriSec-Labs-V6, frame 737:1393 (content node
 * 738:1520). Every value comes from the screening the "checking" step ran;
 * nothing is sample data. Flagged items carry amber (review) or red (flagged)
 * badges. Watchlist outcomes never appear here (the server strips them).
 */

const ICON = "/figma/findings";

/** A design icon at its exact frame size, inside the frame's inset box. */
function Glyph({ src, box, inset, w, h }: { src: string; box: number; inset?: string; w?: number; h?: number }) {
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: box, height: box }}>
      {inset ? (
        <span className="absolute grid place-items-center" style={{ inset }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={`${ICON}/${src}`} width={w} height={h} className="block max-w-none" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={`${ICON}/${src}`} width={w ?? box} height={h ?? box} className="absolute inset-0 block max-w-none" />
      )}
    </span>
  );
}

const CHIP_ICON: Record<string, { src: string; inset: string; w: number; h: number }> = {
  doc: { src: "doc-text.svg", inset: "8.33% 12.5%", w: 9.75, h: 10.75 },
  user: { src: "document.svg", inset: "8.33% 12.5%", w: 9.75, h: 10.75 },
  phone: { src: "phone-sm.svg", inset: "0", w: 12, h: 12 },
  mail: { src: "letter-sm.svg", inset: "16.67% 8.33%", w: 10.75, h: 8.75 },
  globe: { src: "internet.svg", inset: "8.33% 7.36% 8.33% 8.33%", w: 10.8665, h: 10.75 },
};

/** Pill for a flag state; `null` for a clean state (no badge). */
function FlagPill({ tone, children }: { tone: FindingTone; children?: React.ReactNode }) {
  if (tone === "pass") return null;
  const label = children ?? (tone === "fail" ? "Flagged" : tone === "warn" ? "Review" : "Not checked");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill px-2 py-[2px] text-[10px] leading-4 font-bold",
        tone === "fail" && "bg-danger-tint text-danger",
        tone === "warn" && "bg-caution-tint text-caution",
        tone === "na" && "bg-inert-tint text-inert font-normal",
      )}
    >
      {label}
    </span>
  );
}

/** The dark pill used for LOW / PASS / Verified; amber or red when flagged. */
export function StatusPill({ tone, children, size = 10 }: { tone: FindingTone; children: React.ReactNode; size?: 10 | 12 }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-pill px-2 py-[2px] leading-4 font-bold",
        size === 12 ? "text-[12px]" : "text-[10px]",
        tone === "pass" && "bg-pine text-lime",
        tone === "warn" && "bg-caution-tint text-caution",
        tone === "fail" && "bg-danger-tint text-danger",
        tone === "na" && "bg-inert-tint text-inert",
      )}
    >
      {children}
    </span>
  );
}

function codeTone(tone: FindingTone) {
  return tone === "fail"
    ? "border-danger/25 bg-danger-tint text-danger"
    : tone === "warn"
      ? "border-caution/25 bg-caution-tint text-caution"
      : "border-pine/15 bg-pine/8 text-pine/80";
}

/* --------------------------------------------------------------- summary -- */

function Summary({ f }: { f: Findings }) {
  const cells = [
    { label: "Phone risk", value: f.scores.phoneRisk == null ? "n/a" : `${f.scores.phoneRisk}/100` },
    { label: "Email risk", value: f.scores.emailRisk == null ? "n/a" : `${f.scores.emailRisk}/100` },
    { label: "Identity score", value: `${f.scores.identityScore}/100` },
  ];
  const levelTone: FindingTone = f.riskLevel === "LOW" ? "pass" : f.riskLevel === "MEDIUM" ? "warn" : "fail";
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[16px] border border-pine/15 bg-gradient-to-b from-white to-lime">
      <div className="flex w-full flex-wrap items-center">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-[2px] border-r border-pine/15 px-2.5 py-2 whitespace-nowrap">
            <span className="text-[10px] leading-[15px] tracking-[0.5px] text-inert uppercase">{c.label}</span>
            <span className="tnum text-[18px] leading-7 font-medium text-pine">{c.value}</span>
          </div>
        ))}
        <div className="flex h-[61px] flex-col gap-1 border-r border-pine/15 px-2.5 py-2">
          <span className="text-[10px] leading-[15px] tracking-[0.5px] whitespace-nowrap text-inert uppercase">Risk level</span>
          <StatusPill tone={levelTone}>{f.riskLevel}</StatusPill>
        </div>
        <div className="flex h-[61px] flex-col gap-1 px-2.5 py-2">
          <span className="text-[10px] leading-[15px] tracking-[0.5px] whitespace-nowrap text-inert uppercase">Decision</span>
          <StatusPill tone={f.decision === "PASS" ? "pass" : "warn"}>{f.decision}</StatusPill>
        </div>
      </div>
      <div className="flex w-full flex-wrap gap-x-1.5 gap-y-[9px] border-t border-pine/15 px-3 py-2.5">
        {(f.codes ?? []).map((c) => (
          <span key={c.code} title={c.code} className={cn("rounded-pill border px-2 py-[2px] text-[10px] leading-[15px] whitespace-nowrap", codeTone(c.tone))}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- channels -- */

/** ISO timestamps are shown in the viewer's local time, as in the frame. */
function display(row: FindingRow): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(row.value)) {
    const d = new Date(row.value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  }
  return row.value;
}

function Row({ row, last }: { row: FindingRow; last: boolean }) {
  const verified = row.label === "Result";
  return (
    <div className={cn("flex w-full items-start justify-between gap-3 py-1.5", !last && "border-b border-divider/60")}>
      <span className="shrink-0 text-[12px] leading-4 whitespace-nowrap text-inert">{row.label}</span>
      {verified ? (
        row.tone === "pass" ? (
          <span className="flex h-5 w-[69px] shrink-0 items-center justify-center gap-1 rounded-pill bg-pine">
            <Glyph src="check.svg" box={10.5} />
            <span className="text-[10px] leading-4 text-lime">{row.value}</span>
          </span>
        ) : (
          <StatusPill tone={row.tone ?? "warn"}>{row.value}</StatusPill>
        )
      ) : (
        <span
          className={cn(
            "min-w-0 text-right text-[12px] leading-4 [overflow-wrap:anywhere]",
            row.tone === "fail" ? "font-medium text-danger" : row.tone === "warn" ? "font-medium text-caution" : row.tone === "na" ? "text-inert" : "text-pine",
          )}
        >
          {display(row)}
        </span>
      )}
    </div>
  );
}

function Accordion({ section, defaultOpen, last }: { section: FindingSection; defaultOpen: boolean; last: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `acc-${section.title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={cn("flex w-full flex-col", !last && "border-b border-card-line", defaultOpen && "pt-1")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-pine/28"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[14px] leading-5 whitespace-nowrap text-pine">{section.title}</span>
          {section.tone === "warn" || section.tone === "fail" ? <FlagPill tone={section.tone} /> : null}
        </span>
        <span className={cn("grid place-items-center transition-transform", open && "rotate-180")}>
          <Glyph src="chevron-down.svg" box={14} />
        </span>
      </button>
      {open ? (
        <div id={id} className="flex w-full flex-col pb-3">
          {(section.rows ?? []).map((r, i) => (
            <Row key={r.label} row={r} last={i === section.rows.length - 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChannelCard({ title, icon, sections }: { title: string; icon: "phone" | "mail"; sections: FindingSection[] }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-[16px] border border-card-line bg-tile p-4">
      <div className="flex w-full items-center gap-2">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-lime">
          {icon === "phone" ? (
            <Glyph src="phone.svg" box={14} />
          ) : (
            <Glyph src="letter-lg.svg" box={14} inset="16.66% 8.33% 16.68% 8.34%" w={12.5417} h={10.2083} />
          )}
        </span>
        <span className="text-[16px] leading-6 font-medium text-pine">{title}</span>
      </div>
      {(sections ?? []).map((s, i) => (
        <Accordion key={s.title} section={s} defaultOpen={i === 0} last={i === sections.length - 1} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- consistency -- */

function Chip({ icon, label }: { icon: string; label: string }) {
  const g = CHIP_ICON[icon] ?? CHIP_ICON.doc!;
  return (
    <span className="flex w-full items-center gap-[3px] rounded-[6px] bg-tile px-[5px] py-[3px]">
      <Glyph src={g.src} box={12} inset={g.inset} w={g.w} h={g.h} />
      <span className="truncate text-[12px] leading-4 text-pine">{label}</span>
    </span>
  );
}

function Consistency({ items }: { items: Findings["consistency"] }) {
  return (
    <section className="flex w-full flex-col gap-3 rounded-[16px] border border-card-line bg-tile p-4">
      <h3 className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">Cross-channel consistency</h3>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
        {(items ?? []).map((c) => (
          <div
            key={`${c.left}-${c.right}`}
            className={cn(
              "flex h-[79px] flex-col items-center justify-center gap-1 rounded-[12px] border bg-white py-2 pr-3 pl-2.5",
              c.tone === "warn" ? "border-caution/40" : c.tone === "fail" ? "border-danger/40" : "border-card-line",
            )}
            title={c.tone === "pass" ? "Consistent" : c.tone === "na" ? "Not enough data to compare" : "Does not match"}
          >
            <Chip icon={c.leftIcon} label={c.left} />
            {c.tone === "pass" ? (
              <span className="relative block h-[13px] w-5 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={`${ICON}/link.svg`} width={20} height={13} className="absolute inset-0 block max-w-none" />
              </span>
            ) : (
              <FlagPill tone={c.tone}>{c.tone === "na" ? "n/a" : "Mismatch"}</FlagPill>
            )}
            <Chip icon={c.rightIcon} label={c.right} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- velocity -- */

function Velocity({ rows }: { rows: FindingRow[] }) {
  return (
    <section className="flex w-full flex-col gap-3 rounded-[16px] border border-card-line bg-tile p-4">
      <h3 className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">Velocity &amp; duplicates</h3>
      {(rows ?? []).map((r) => (
        <div key={r.label} className="flex w-full items-center justify-between gap-3">
          <span className="text-[12px] leading-4 text-inert">{r.label}</span>
          {r.tone === "na" ? (
            <span className="text-[12px] leading-6 text-inert">{r.value}</span>
          ) : (
            <span className="flex items-center gap-2">
              {r.tone === "warn" || r.tone === "fail" ? <FlagPill tone={r.tone} /> : null}
              <span className={cn("tnum text-[16px] leading-6 font-bold", r.tone === "warn" ? "text-caution" : r.tone === "fail" ? "text-danger" : "text-pine")}>
                {r.value}
              </span>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------- decision -- */

function Decision({ f }: { f: Findings }) {
  const levelTone: FindingTone = f.riskLevel === "LOW" ? "pass" : f.riskLevel === "MEDIUM" ? "warn" : "fail";
  return (
    <section className="flex w-full flex-col gap-2 rounded-[16px] border border-card-line bg-tile p-4">
      <h3 className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">Explainable decision</h3>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={f.decision === "PASS" ? "pass" : "warn"} size={12}>
          {f.decision}
        </StatusPill>
        <StatusPill tone={levelTone} size={12}>
          {f.riskLevel} risk
        </StatusPill>
      </div>
      <p className="m-0 text-[14px] leading-5 text-inert">{f.explain.summary}</p>
      <div className="flex flex-wrap gap-x-[5px] gap-y-1.5 pt-1">
        {(f.codes ?? []).map((c) => (
          <span
            key={c.code}
            title={c.code}
            className={cn(
              "rounded-pill border px-2 py-[2px] text-[10px] leading-[15px] whitespace-nowrap",
              c.tone === "pass" || c.tone === "na" ? "border-pine/8 bg-lime text-pine" : codeTone(c.tone),
            )}
          >
            {c.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- risk panel -- */

/** Risk screening results, shown in the explainer column under its text. */
function RiskPanel({ rows }: { rows: FindingRow[] }) {
  return (
    <section aria-labelledby="risk-panel" className="flex flex-col gap-3 rounded-[16px] border border-card-line bg-tile p-4">
      <h3 id="risk-panel" className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">
        Risk screening
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {(rows ?? []).map((r, i) => (
          <li
            key={r.label}
            className={cn("flex items-center justify-between gap-3 py-2", i < rows.length - 1 && "border-b border-divider/60")}
          >
            <span className="min-w-0 text-[12px] leading-4 text-inert">{r.label}</span>
            <StatusPill tone={r.tone ?? "na"}>{r.value}</StatusPill>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[11px] leading-4 text-inert">
        Screened against global sanctions, politically exposed person and crime lists, and the connection used for this
        session.
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- step -- */

/** True only for a report in the shape this page renders. */
function isCurrent(f: unknown): f is Findings {
  if (!f || typeof f !== "object") return false;
  const r = f as Partial<Findings>;
  return (
    !!r.scores &&
    typeof r.riskLevel === "string" &&
    typeof r.decision === "string" &&
    Array.isArray(r.codes) &&
    r.codes.every((c) => c && typeof c.label === "string") &&
    Array.isArray(r.screening) &&
    Array.isArray(r.consistency) &&
    Array.isArray(r.velocity) &&
    (r.phone === null || Array.isArray(r.phone)) &&
    (r.email === null || Array.isArray(r.email)) &&
    typeof r.explain?.summary === "string"
  );
}

export function FindingsStepClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [f, setF] = useState<Findings | null>(null);

  // The report is produced by the "checking" step. A missing report, or one
  // saved by an older version of this page (a different shape), is re-run
  // rather than rendered: rendering a stale shape is what crashed on refresh.
  useEffect(() => {
    const found = readFlow().screening?.findings;
    if (isCurrent(found)) setF(found);
    else router.replace("/verify/checking");
  }, [router]);

  return (
    <FlowShell
      ctx={ctx}
      nav={{ onNext: () => next && router.push(`/verify/${next}`), nextDisabled: !f }}
      asideSlot={f ? <RiskPanel rows={f.screening} /> : null}
    >
      {f ? (
        <div className="flex w-full flex-col gap-4">
          <Summary f={f} />
          {f.phone || f.email ? (
            <div className="flex w-full flex-col items-start gap-4 sm:flex-row">
              {f.phone ? <ChannelCard title="Phone" icon="phone" sections={f.phone} /> : null}
              {f.email ? <ChannelCard title="Email" icon="mail" sections={f.email} /> : null}
            </div>
          ) : null}
          <Consistency items={f.consistency} />
          <Velocity rows={f.velocity} />
          <Decision f={f} />
        </div>
      ) : null}
    </FlowShell>
  );
}
