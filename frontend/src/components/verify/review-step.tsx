"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, XCircle } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import type { ScreenContext } from "@/lib/verify/types";
import { hydrateFlow, readFlow, writeFlow, type FlowState } from "@/lib/verify/flow-store";
import { readDocumentOnce } from "@/lib/verify/idv-read-once";
import { resolveKyc, buildConfirmSections, countryName } from "@/lib/verify/idv";
import { extractSubject } from "@/lib/verify/subject";
import { recordDocument } from "@/lib/verify/record";
import { kycApi } from "@/lib/verify/kyc-api";
import { usePlan } from "@/lib/verify/plan";
import type {
  ConfirmSection,
  DisplayField,
  DisplayPhoto,
  DisplayResult,
  DisplaySignal,
  KycGate,
  KycResolution,
  RegulaError,
  Tone,
} from "@/lib/verify/idv";
import { cn } from "@/lib/utils";

type Phase = "loading" | "network-error" | "nodata" | "refused" | "ready";

/** The server's own verdict on the document it read: the kind it saw, and whether this verification accepts it. */
/** `photoTry`: which photo try this read is for the verification, counted by the server (so a new tab carries on). */
type ServerDoc = { documentType?: string | null; accepted?: boolean; accepts?: string[]; photoTry?: number };
const DOC_NAME: Record<string, string> = {
  passport: "a passport",
  "national-id": "a national ID card",
  licence: "a driver's licence",
  "residence-permit": "a residence permit",
};
const listOf = (ids: string[]) => {
  const names = ids.map((i) => DOC_NAME[i] ?? i);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
};
type Tab = "all" | "front" | "back";

const RECAPTURE = "/verify/document-front";

/**
 * Confirm Details.
 *
 * Read once, resolved against the chosen country and type. The left column
 * summarises the decision and every good and bad signal; the right column shows
 * the data by side and, above it, any errors Regula reported. Proceeding is
 * gated by the parser: a serious error (values differ, fraud) stops outright; a
 * capture/quality error asks for a clearer photo of both sides, and is allowed
 * through on the second attempt, flagged and recorded.
 */
export function ReviewStepClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [res, setRes] = useState<KycResolution | null>(null);
  const [refused, setRefused] = useState<ServerDoc | null>(null);
  const next = ctx.screen.next?.to;

  const run = useCallback(async () => {
    // the photos may be in IndexedDB (a phone's full-size photos do not fit session storage)
    const flow = await hydrateFlow();
    const selection = { country: flow.country ?? "", docType: flow.docType ?? "" };
    const frontImg = flow.documents?.front;
    const backImg = flow.documents?.back;
    // A read this screen has not handled yet: made here, or made early by the upload step (two-sided
    // documents). Only then is it recorded on the verification and counted as an attempt.
    const fresh = !flow.idvResult || flow.idvProcessed === false;

    let response = flow.idvResult;
    if (!response) {
      if (!frontImg) {
        setPhase("nodata");
        return;
      }
      setPhase("loading");
      try {
        // the upload step usually started this read already; this picks it up rather than reading again
        response = await readDocumentOnce(frontImg, backImg);
        writeFlow({ idvResult: response });
      } catch {
        setPhase("network-error");
        return;
      }
    }

    // the server read the document and decides whether this verification accepts that kind (a passport-only
    // workflow refuses a driver's licence, whatever was chosen on the previous screen)
    const server = (response as { verisec?: ServerDoc } | null | undefined)?.verisec;
    if (server && server.accepted === false) {
      setRefused(server);
      setPhase("refused");
      return;
    }

    const priorN = flow.qualityAttempts ?? 0;
    // this tab's own count, or the server's when it is higher: tries made in another tab or on another device count too
    const attempt = Math.max(1, fresh ? priorN + 1 : priorN, server?.photoTry ?? 0);

    try {
      const r = await resolveKyc(response, selection, { attempt });
      const patch: Partial<FlowState> = {
        idvProcessed: true,
        // The confirmed identity, kept only for watchlist screening later.
        subject: extractSubject(r.display?.fields ?? [], r.effective?.country ?? r.selected.country),
        resolved: {
          outcome: r.outcome,
          country: r.effective?.country ?? r.selected.country,
          docType: r.effective?.docType ?? r.selected.docType,
        },
      };
      if (fresh && r.errorClass === "quality") patch.qualityAttempts = attempt;
      if (r.gate.reason === "quality-allowed")
        patch.qualityRecord = {
          attempts: attempt,
          errors: r.errors.map((e) => `${e.label}${e.detail ? ": " + e.detail : ""}`),
          at: Date.now(),
        };
      // Checked and marked in one synchronous step, so a second run of this screen sharing the same
      // read does not record it twice.
      const record = fresh && readFlow().idvProcessed !== true;
      writeFlow(patch);
      // the verification record: what was read and what the applicant is confirming
      if (record) recordDocument(r, flow.docType, patch.subject ?? {});
      setRes(r);
      setPhase("ready");
    } catch {
      setPhase("network-error");
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const canProceed = !!res?.gate.canProceed;
  // A workflow with a minimum age: the server checks the confirmed date of birth before the applicant goes on, and
  // stops someone under it here (they are not walked through the face steps for a verification that cannot pass).
  const plan = usePlan();
  const [checkingAge, setCheckingAge] = useState(false);
  const [ageStop, setAgeStop] = useState<string | null>(null);
  const nav = {
    onNext: async () => {
      if (!canProceed || !next || checkingAge || ageStop) return;
      if (!plan?.checks || plan.checks.includes("age")) {
        setCheckingAge(true);
        let g = await kycApi.gate();
        // the confirmed details are recorded alongside this screen: wait briefly for them
        for (let i = 0; i < 6 && g.ok && g.data.pending; i++) {
          await new Promise((ok) => setTimeout(ok, 700));
          g = await kycApi.gate();
        }
        setCheckingAge(false);
        if (g.ok && g.data.stop) {
          setAgeStop(g.data.stop.reason);
          return;
        }
      }
      router.push(`/verify/${next}`);
    },
    nextDisabled: !canProceed || !!ageStop,
    loading: checkingAge,
  };

  const supported = res?.outcome === "accept" || res?.outcome === "autocorrected";
  const asideSlot = phase === "ready" && supported && res?.display ? <Summary d={res.display} /> : null;

  return (
    <FlowShell ctx={ctx} nav={nav} asideSlot={asideSlot}>
      <div className="flex w-full flex-col gap-5">
        {phase === "loading" ? (
          <p className="m-0 flex items-center gap-2.5 rounded-well bg-pine/5 px-4 py-4 text-read text-quiet">
            <Loader2 className="size-4 animate-spin" /> Please wait, checking your document.
          </p>
        ) : null}

        {phase === "network-error" ? (
          <Callout tone="fail" title="We could not check your document.">
            Something went wrong on our side.{" "}
            <button type="button" onClick={run} className="font-medium underline underline-offset-2">
              Try again
            </button>
          </Callout>
        ) : null}

        {ageStop ? (
          <Callout tone="fail" title="You can't continue this verification.">
            <span className="block">{ageStop}</span>
            <Link href="/verify/result" className="mt-2 inline-block font-medium underline underline-offset-2">
              See your result
            </Link>
          </Callout>
        ) : null}

        {phase === "refused" && refused ? (
          <Callout tone="fail" title="This verification needs a different document.">
            {refused.documentType ? (
              <>
                You uploaded {DOC_NAME[refused.documentType] ?? "a document"}, but this verification accepts only{" "}
                {listOf(refused.accepts ?? [])}. Please upload {refused.accepts?.length === 1 ? "it" : "one of those"}.{" "}
              </>
            ) : (
              <>
                Your document could not be recognised as {listOf(refused.accepts ?? [])}. This verification accepts only{" "}
                {listOf(refused.accepts ?? [])}, so please upload {refused.accepts?.length === 1 ? "that" : "one of those"}.{" "}
              </>
            )}
            <Link
              href={RECAPTURE}
              onClick={() => writeFlow({ documents: {}, idvResult: undefined, idvProcessed: undefined })}
              className="font-medium underline underline-offset-2"
            >
              Upload a different document
            </Link>
          </Callout>
        ) : null}

        {phase === "nodata" ? (
          <Callout tone="warn" title="No document yet.">
            <Link href={RECAPTURE} className="font-medium underline underline-offset-2">
              Go back to add it
            </Link>
          </Callout>
        ) : null}

        {phase === "ready" && res ? <Result res={res} /> : null}
      </div>
    </FlowShell>
  );
}

/* ------------------------------- outcomes -------------------------------- */

function Result({ res }: { res: KycResolution }) {
  const [tab, setTab] = useState<Tab>("all");

  if (res.outcome === "wrong-document" || res.outcome === "unreadable") {
    return (
      <Callout tone="fail" title={res.outcome === "wrong-document" ? "This is not a document we can verify." : "We could not read this clearly."}>
        <span className="block">{res.guidance}</span>
        <RetakeButton />
      </Callout>
    );
  }

  const d = res.display!;
  const docType = res.effective!.docType;
  const twoSided = d.pages.length > 1;
  const tabPage = d.pages.find((p) => p.side === tab);
  const sections: ConfirmSection[] =
    tab === "all" ? res.sections ?? [] : buildConfirmSections(tabPage?.fields ?? [], docType);
  // The enum keys of every field an error points at, so they can be badged.
  const flaggedKeys = new Set(res.errors.flatMap((e) => e.affects ?? []));
  const matchedCount = d.fields.filter((f) => f.crossChecked).length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {res.gate.reason !== "ok" ? <IssuePanel gate={res.gate} errors={res.errors} /> : <NotesList notes={d.notes} />}

      {res.outcome === "autocorrected" ? (
        <Callout tone="warn" title="We adjusted the details.">
          <span className="block">{res.guidance}</span>
          <Link href={RECAPTURE} className="mt-2 inline-block font-medium underline underline-offset-2">
            Re-take instead
          </Link>
        </Callout>
      ) : null}

      {twoSided ? <Tabs tab={tab} setTab={setTab} /> : null}

      {matchedCount > 0 && tab === "all" ? (
        <p className="m-0 text-eyebrow text-quiet">
          {matchedCount} field{matchedCount === 1 ? "" : "s"} confirmed on both sides. Every field read is shown.
        </p>
      ) : null}

      {sections.length > 0 ? (
        sections.map((s) => <FieldSection key={s.title} section={s} flagged={flaggedKeys} />)
      ) : (
        <p className="m-0 rounded-well bg-pine/5 px-4 py-3 text-read text-quiet">Nothing to show on this side.</p>
      )}

      <ImagesBySide photos={tab === "all" ? d.photos : (tabPage?.photos ?? [])} />
    </div>
  );
}

/**
 * One tidy panel for whatever is wrong: a short headline, the specific issues as
 * compact rows, and a single action. Replaces the old stack of wordy callouts.
 */
function IssuePanel({ gate, errors }: { gate: KycGate; errors: RegulaError[] }) {
  const serious = gate.reason === "serious";
  const allowed = gate.reason === "quality-allowed";
  const shown = (serious ? errors.filter((e) => e.severity === "serious") : errors).slice(0, 6);
  // which side the problems are on: tagged in the header and on each problem, and named in what to retake
  const sides = (["front", "back"] as const).filter((s) => shown.some((e) => e.side === s));
  const retake = sides.length === 1 ? `the ${sides[0]}` : "the front and the back";
  const title = serious ? "Document not accepted" : allowed ? "Photo quality was low" : "We could not read it clearly";
  const sub = serious
    ? "We could not trust some details on it."
    : allowed
      ? gate.crossMatched
        ? "The details on the front and the back match, so you can continue. The low photo quality is recorded."
        : "This is recorded. You can continue."
      : `Take a sharp, glare free photo of ${retake}.`;
  const Icon = serious ? XCircle : AlertTriangle;

  return (
    <div className={cn("flex flex-col gap-3 rounded-well px-4 py-3.5", serious ? "bg-caution-tint/60" : "bg-caution-tint/35")}>
      <div className="flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-caution" strokeWidth={1.9} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-read font-semibold text-caution">
            {title}
            {sides.map((s) => (
              <SideTag key={s} side={s} />
            ))}
          </p>
          <p className="m-0 text-body text-caution/85">{sub}</p>
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pl-[30px]">
          {shown.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-body text-caution/90">
              <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", e.severity === "serious" ? "bg-caution" : "bg-caution/45")} />
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="font-medium">{e.label}</span>
                {e.side ? <SideTag side={e.side} /> : null}
                {e.detail ? <span className="text-caution/70">({e.detail})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!allowed ? (
        <div className="pl-[30px]">
          <RetakeButton label="Retake photo" />
        </div>
      ) : null}
    </div>
  );
}

/** "Front" or "Back": which side of the document a problem is on. */
function SideTag({ side }: { side: "front" | "back" }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-caution/30 bg-white/70 px-2 py-px text-[11.5px] leading-4 font-medium text-caution">
      {side === "front" ? "Front" : "Back"}
    </span>
  );
}

/** Compact info notes (expiry and the like) shown when nothing is blocking. */
function NotesList({ notes }: { notes: DisplayResult["notes"] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {notes.map((n, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-tile px-3.5 py-2 text-body",
            n.severity === "critical" ? "bg-caution-tint/60 text-caution" : "bg-pine/5 text-pine/80",
          )}
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

function RetakeButton({ label = "Re-take the photo" }: { label?: string }) {
  return (
    <Link
      href={RECAPTURE}
      className="inline-flex h-9 items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
    >
      {label}
    </Link>
  );
}

/* ------------------------ left column summary ---------------------------- */

function Summary({ d }: { d: DisplayResult }) {
  const portrait = d.photos.find((p) => /portrait/i.test(p.name) && !/ghost/i.test(p.name)) || d.photos[0];
  const passed = d.signals.filter((s) => s.tone === "pass").length;
  const flagged = d.signals.filter((s) => s.tone === "fail").length;

  return (
    <div className="flex flex-col gap-4 rounded-well border border-card-line bg-tile/50 p-4">
      <DecisionBadge tone={d.decision.tone} label={d.decision.label} />

      <div className="flex items-center gap-3">
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait.src}
            alt="Document portrait"
            className="size-14 shrink-0 rounded-tile border border-card-line bg-white object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span className="text-read font-semibold text-pine">{d.docType}</span>
          <span className="truncate text-eyebrow text-quiet">{countryName(d.country)}</span>
        </div>
      </div>

      <dl className="m-0 flex flex-col gap-1.5">
        <MetaRow label="Document" value={d.docType} />
        <MetaRow label="Country" value={countryName(d.country)} />
        <MetaRow label="Recognised as" value={d.documentName} />
      </dl>

      <div className="flex flex-col gap-2 border-t border-divider pt-3">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">Signals</h3>
          <span className="text-eyebrow text-quiet">
            {passed} good{flagged ? `, ${flagged} to check` : ""}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {d.signals.map((s, i) => (
            <SignalRow key={`${s.name}-${i}`} signal={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-eyebrow text-quiet">{label}</dt>
      <dd className="m-0 min-w-0">
        <ExpandableValue value={value} valueClass="text-body font-medium text-pine" />
      </dd>
    </div>
  );
}

/**
 * A value that stays on one line until it is too long, then reveals the rest
 * with See more / See less. Used for anything that can run long (the full
 * document name, addresses, long field values), so nothing is silently cut off.
 */
function ExpandableValue({ value, valueClass }: { value: string; valueClass?: string }) {
  const [open, setOpen] = useState(false);
  const long = value.length > 44;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={cn(valueClass, "break-words", !open && long && "line-clamp-1")}>{value}</span>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] font-medium text-pine/70 underline underline-offset-2 transition-colors hover:text-pine"
        >
          {open ? "See less" : "See more"}
        </button>
      ) : null}
    </span>
  );
}

function DecisionBadge({ tone, label }: { tone: Tone; label: string }) {
  const Icon = tone === "pass" ? ShieldCheck : tone === "fail" ? ShieldAlert : ShieldQuestion;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-tile px-3.5 py-3",
        tone === "pass" ? "bg-pass-tint/70" : tone === "fail" ? "bg-caution-tint/70" : "bg-pine/8",
      )}
    >
      <span className="text-eyebrow tracking-[0.4px] text-pine/60 uppercase">Overall decision</span>
      <span
        className={cn(
          "flex items-center gap-2 text-read font-semibold",
          tone === "pass" ? "text-ramp-2" : tone === "fail" ? "text-caution" : "text-pine",
        )}
      >
        <Icon aria-hidden className="size-5" strokeWidth={1.8} />
        {label}
      </span>
    </div>
  );
}

function SignalRow({ signal }: { signal: DisplaySignal }) {
  return (
    <li className="flex items-center justify-between gap-2 text-body">
      <span className="text-pine/80">{signal.name}</span>
      <span className="flex items-center gap-1.5">
        {signal.note ? <span className="text-[11px] text-quiet">{signal.note}</span> : null}
        <ToneDot tone={signal.tone} />
      </span>
    </li>
  );
}

/* ------------------------------- images ---------------------------------- */

function ImagesBySide({ photos }: { photos: DisplayPhoto[] }) {
  const front = photos.filter((p) => p.side === "front");
  const back = photos.filter((p) => p.side === "back");
  if (front.length === 0 && back.length === 0) return null;
  const bothSides = front.length > 0 && back.length > 0;
  return (
    <Section title="Photo and figures">
      <div className="flex flex-col gap-4">
        {front.length > 0 ? <PhotoGroup label={bothSides ? "Front side" : ""} photos={front} /> : null}
        {back.length > 0 ? <PhotoGroup label={bothSides ? "Back side" : ""} photos={back} /> : null}
      </div>
    </Section>
  );
}

function PhotoGroup({ label, photos }: { label: string; photos: DisplayPhoto[] }) {
  return (
    <div className="flex flex-col gap-2">
      {label ? <span className="text-eyebrow text-quiet">{label}</span> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((img, i) => (
          <figure key={`${img.name}-${i}`} className="m-0 flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.name}
              className="h-28 w-full rounded-tile border border-card-line bg-white object-contain"
            />
            <figcaption className="text-eyebrow text-quiet">{img.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- pieces --------------------------------- */

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const opts: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
  ];
  return (
    <div className="inline-flex w-fit rounded-pill bg-pine/8 p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTab(o.id)}
          className={cn(
            "rounded-pill px-4 py-1.5 text-body font-medium transition-colors",
            tab === o.id ? "bg-white text-pine shadow-sm" : "text-pine/60 hover:text-pine",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FieldSection({ section, flagged }: { section: ConfirmSection; flagged: Set<string> }) {
  return (
    <Section title={section.title}>
      <ul className="m-0 grid grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
        {section.fields.map((f, i) => (
          <FieldRow key={`${f.key || f.name}-${i}`} field={f} flagged={!!f.key && flagged.has(f.key)} />
        ))}
      </ul>
    </Section>
  );
}

function FieldRow({ field, flagged }: { field: DisplayField; flagged: boolean }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-0.5 rounded-tile border bg-white px-3.5 py-2.5",
        flagged ? "border-caution/55 bg-caution-tint/15" : "border-card-line",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-eyebrow text-quiet">{field.name}</span>
        {flagged ? (
          <span
            title="This could not be confirmed. Please re-take a clearer photo."
            className="inline-flex items-center gap-1 rounded-pill bg-caution-tint px-1.5 py-0.5 text-[10px] font-medium text-caution"
          >
            <AlertTriangle aria-hidden className="size-2.5" strokeWidth={2.4} /> recheck
          </span>
        ) : field.crossChecked ? (
          <span
            title="Confirmed on both the front and the back"
            className="inline-flex items-center gap-1 rounded-pill bg-pass-tint px-1.5 py-0.5 text-[10px] font-medium text-ramp-2"
          >
            <Check aria-hidden className="size-2.5" strokeWidth={3} /> matched
          </span>
        ) : null}
      </span>
      <ExpandableValue value={field.value || "-"} valueClass="text-read font-medium text-pine" />
    </li>
  );
}

function ToneDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-label={`check ${tone}`}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        tone === "pass" ? "bg-ramp-3" : tone === "fail" ? "bg-caution" : "bg-pine/25",
      )}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "fail" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "m-0 flex flex-col gap-1 rounded-well px-4 py-4",
        tone === "fail" ? "bg-caution-tint/70 text-caution" : "bg-pine/5 text-pine/80",
      )}
    >
      <p className="m-0 flex items-center gap-2 text-read font-medium">
        <AlertTriangle aria-hidden className="size-4 shrink-0" strokeWidth={1.9} />
        {title}
      </p>
      <div className="text-read">{children}</div>
    </div>
  );
}
