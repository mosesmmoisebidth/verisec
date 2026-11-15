"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Clock,
  Fingerprint,
  PenLine,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CopySnippet } from "@/components/api-keys/copy-snippet";
import { CardFace } from "@/components/finance/card-face";
import { ConfidenceBar, CountryFlag, Notice, Pill, ProductChip, StatusChip } from "@/components/finance/parts";
import { serviceBase } from "@/lib/finance/api";
import type { FinService } from "@/lib/finance/api";
import { cardField, cardFieldConf, countryName, maskedPan } from "@/lib/finance/card";
import { RESULT } from "@/lib/finance/content";
import { duration } from "@/lib/finance/format";
import { fieldLabel, micrNamedFields, standardLabel, WEAK_CHAR } from "@/lib/finance/micr";
import type {
  BankMatch,
  CountryInfo,
  CardRead,
  CardResponse,
  ChequeDeepRead,
  ChequeResponse,
  DeepCheque,
  MicrZone,
  ResolvedCurrency,
  ScanResponse,
  VisionResult,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/**
 * One scan's result, exactly as the API answered: used by the Playground
 * (right after a read) and by the scan detail page (from the stored copy).
 * A deep read (`cheque_read`) leads with what the cheque says, then the MICR line,
 * the bank it resolved to and what else is printed. A photo with several cheques
 * gets a picker; the panel then shows the picked cheque. Pass `cheque` and
 * `onChequeChange` to control the pick from outside (e.g. to mark it on the image).
 */
export function ScanResult({
  result,
  cheque,
  onChequeChange,
}: {
  result: ScanResponse | ChequeDeepRead;
  cheque?: number;
  onChequeChange?: (index: number) => void;
}) {
  const [own, setOwn] = useState(0);
  if (result.object === "cheque_read") {
    const cheques = result.cheques ?? [];
    const picked = Math.min(cheque ?? own, Math.max(cheques.length - 1, 0));
    const pick = (i: number) => (onChequeChange ? onChequeChange(i) : setOwn(i));
    return <DeepRead result={chequeView(result, cheques[picked])} cheques={cheques} picked={picked} onPick={pick} />;
  }
  return (
    <div className="@container min-w-0">
      {result.object === "cheque" ? <ChequeResult result={result} /> : <CardResult result={result} />}
    </div>
  );
}

/** The read as seen for one cheque of the photo: that cheque's MICR line and fields. */
export function chequeView(result: ChequeDeepRead, one?: DeepCheque): ChequeDeepRead {
  if (!one) return result;
  return {
    ...result,
    micr: { ...result.micr, ...one.micr },
    vision: one.vision,
    bank: one.bank,
    country: one.country,
    currency: one.currency,
    reader_error: one.reader_error,
  };
}

function DeepRead({
  result,
  cheques,
  picked,
  onPick,
}: {
  result: ChequeDeepRead;
  cheques: DeepCheque[];
  picked: number;
  onPick: (index: number) => void;
}) {
  const vision = result.vision ?? undefined;
  const unavailable = Boolean(result.reader_error) || !vision;
  return (
    <div className="@container flex min-w-0 flex-col gap-5">
      <DeepReadHeader result={result} />
      {cheques.length > 1 ? <ChequePicker cheques={cheques} picked={picked} onPick={onPick} /> : null}
      {/* MICR first, exactly as the engine read it; the AI read of the face below. */}
      <ChequeResult result={result.micr} embedded />
      <QualityNotice quality={result.image_quality} />
      {unavailable || !vision ? (
        <Notice tone="warning">{RESULT.vision.unavailable}</Notice>
      ) : (
        <ChequeSummary
          vision={vision}
          bank={result.bank}
          currency={result.currency ?? undefined}
          country={result.country ?? undefined}
        />
      )}
      {!unavailable && result.bank?.resolved ? <BankCard bank={result.bank} /> : null}
      {!unavailable && vision ? <PrintedDetails vision={vision} micrRead={Boolean(result.micr?.micr)} /> : null}
    </div>
  );
}

/** One card per cheque in the photo (number, bank, amount); the picked one is shown below. */
function ChequePicker({ cheques, picked, onPick }: { cheques: DeepCheque[]; picked: number; onPick: (index: number) => void }) {
  return (
    <Section title={RESULT.vision.chequesTitle(cheques.length)}>
      <div role="tablist" aria-label={RESULT.vision.chequesLabel} className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
        {cheques.map((c, i) => {
          const active = i === picked;
          const bankName = c.bank?.resolved?.name ?? c.vision?.bank?.name ?? null;
          const amount = c.vision?.amount?.figures ?? null;
          return (
            <button
              key={c.index}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onPick(i)}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-[14px] border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-pine focus-visible:outline-none",
                active ? "border-pine bg-lime/25" : "border-hairline bg-page hover:border-pine/40",
              )}
            >
              <span
                className={cn(
                  "tnum grid size-6 shrink-0 place-items-center rounded-pill text-[11px] font-medium",
                  active ? "bg-pine text-lime" : "bg-well text-slate",
                )}
              >
                {c.index}
              </span>
              <BankLogo src={bankLogoSrc(c.bank)} size="size-8" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-micro font-medium text-pine">{bankName ?? RESULT.vision.chequeTab(c.index)}</span>
                <span className="tnum truncate text-[11px] text-slate">{amount ?? RESULT.vision.amountMissing}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** Deep read header: what it is and how long the whole read took. */
function DeepReadHeader({ result }: { result: ChequeDeepRead }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProductChip product="cheque" />
      <Pill className="bg-lime/30">{RESULT.vision.deepPill}</Pill>
      <span className="tnum ml-auto inline-flex items-center gap-1 text-micro text-slate">
        <Clock aria-hidden className="size-3.5" strokeWidth={1.8} />
        {duration(result.timing?.total_ms ?? result.processing_ms)}
      </span>
    </div>
  );
}

/** A photo-quality warning from the check before the read (never blocks the read). */
function QualityNotice({ quality }: { quality?: ChequeDeepRead["image_quality"] }) {
  if (!quality || quality.status === "ok") return null;
  return <Notice tone="warning">{RESULT.vision.quality[quality.status]}</Notice>;
}

/* ----------------------------------------------------------------------------
   Deep read: what the cheque says, the bank it is drawn on, what else is printed
---------------------------------------------------------------------------- */

/** The resolved bank's logo, served by the API that returned the match. */
export function bankLogoSrc(bank?: BankMatch | null, service: FinService = "micr"): string | null {
  const resolved = bank?.resolved;
  if (!resolved) return null;
  const base = serviceBase(service);
  return resolved.logo_url && base ? `${base}${resolved.logo_url}` : null;
}

export function BankLogo({ src, size = "size-10" }: { src: string | null; size?: string }) {
  if (!src) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-[10px] bg-well text-slate", size)}>
        <Building2 aria-hidden className="size-5" strokeWidth={1.7} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served/remote bank logo, no optimisation needed
    <img
      src={src}
      alt=""
      aria-hidden
      className={cn("shrink-0 rounded-[10px] bg-white object-contain p-1 ring-1 ring-black/5", size)}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function ChequeSummary({
  vision,
  bank,
  currency,
  country,
}: {
  vision: VisionResult;
  bank?: BankMatch;
  currency?: ResolvedCurrency;
  country?: CountryInfo;
}) {
  const a = vision.amount;
  const curCode = currency?.code ?? vision.currency?.code ?? null;
  const curName = currency?.name && currency.name !== curCode ? currency.name : null;
  const curSymbol = currency?.local_symbol ?? currency?.symbol ?? null;
  const bankName = bank?.resolved?.name ?? vision.bank?.name ?? null;
  const branch = vision.bank?.branch ?? null;
  const agree = a?.agreement;
  const date = vision.date;
  const dateValue = date?.iso ?? date?.raw ?? null;
  const people: { label: string; value: string; sub?: string }[] = [];
  if (vision.payee) people.push({ label: RESULT.vision.payee, value: vision.payee });
  if (vision.drawer?.name) people.push({ label: RESULT.vision.drawer, value: vision.drawer.name });
  if (dateValue) {
    people.push({
      label: RESULT.vision.date,
      value: dateValue,
      sub: date?.iso && date.raw && date.raw !== date.iso ? RESULT.vision.written(date.raw) : undefined,
    });
  }
  const sig = vision.signature;
  const cross = vision.crossing;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-eyebrow font-medium tracking-[0.6px] text-slate uppercase">{RESULT.vision.summaryTitle}</h3>
        {agree != null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium",
              agree ? "bg-pass-tint text-ramp-2" : "bg-danger-tint text-danger",
            )}
          >
            {agree ? <CheckCircle2 aria-hidden className="size-3" /> : <XCircle aria-hidden className="size-3" />}
            {agree ? RESULT.vision.agree : RESULT.vision.disagree}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[16px] border border-hairline bg-page">
        {bankName ? (
          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <BankLogo src={bankLogoSrc(bank)} />
            <div className="min-w-0">
              <p className="m-0 truncate text-body font-medium text-pine">{bankName}</p>
              {branch ? <p className="m-0 truncate text-micro text-slate">{branch}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 px-4 py-4">
          <span className="text-micro text-slate">{RESULT.vision.amountTitle}</span>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="tnum text-[26px] leading-tight font-semibold break-all text-pine">
              {a?.figures ?? RESULT.vision.amountMissing}
            </span>
            {curCode ? <span className="text-body text-slate">{[curCode, curName].filter(Boolean).join(" · ")}</span> : null}
          </div>
          {a?.words ? <p className="m-0 text-body break-words text-pine/80">{a.words}</p> : null}
        </div>

        {country || curCode ? (
          <dl className="m-0 grid grid-cols-1 border-t border-rule @md:grid-cols-2">
            {country ? (
              <div className="flex gap-3 px-4 py-2.5">
                <dt className="w-[30%] shrink-0 pt-px text-micro text-slate @md:w-auto @md:min-w-[64px]">{RESULT.vision.country}</dt>
                <dd className="m-0 min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-body font-medium text-pine">
                    <CountryFlag code={country.code} />
                    <span className="break-words">{country.name}</span>
                  </span>
                  <span className="block text-micro text-slate">{RESULT.vision.countrySource[country.source]}</span>
                </dd>
              </div>
            ) : null}
            {curCode ? (
              <div className={cn("flex gap-3 px-4 py-2.5", country && "border-t border-rule @md:border-t-0 @md:border-l")}>
                <dt className="w-[30%] shrink-0 pt-px text-micro text-slate @md:w-auto @md:min-w-[64px]">{RESULT.vision.currency}</dt>
                <dd className="m-0 min-w-0 flex-1">
                  <span className="tnum block text-body font-medium text-pine">
                    {curCode}
                    {curSymbol && curSymbol !== curCode ? <span className="font-normal text-slate"> · {curSymbol}</span> : null}
                  </span>
                  {curName ? <span className="block text-micro text-slate">{curName}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {people.length ? (
          <dl className="m-0 border-t border-rule">
            {people.map((r, i) => (
              <div key={r.label} className={cn("flex gap-3 px-4 py-2.5", i > 0 && "border-t border-rule")}>
                <dt className="w-[30%] shrink-0 pt-px text-micro text-slate">{r.label}</dt>
                <dd className="m-0 min-w-0 flex-1">
                  <span className="block text-body font-medium break-words text-pine">{r.value}</span>
                  {r.sub ? <span className="block text-micro text-slate">{r.sub}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-rule px-4 py-3">
          <Pill className={sig?.present ? "bg-pass-tint text-ramp-2" : undefined}>
            {sig?.present ? <CheckCircle2 aria-hidden className="size-3.5" /> : <PenLine aria-hidden className="size-3.5" />}
            {sig?.present ? RESULT.vision.signedPill(sig.count ?? 1) : RESULT.vision.unsignedPill}
          </Pill>
          {cross?.present ? <Pill className="max-w-full whitespace-normal">{RESULT.vision.crossedPill(cross.text ?? cross.type ?? "")}</Pill> : null}
        </div>
      </div>
    </section>
  );
}

/** The bank matched in our directory: logo, name, city, address, BIC, country with flag. */
export function BankCard({ bank, service = "micr" }: { bank: BankMatch; service?: FinService }) {
  const r = bank.resolved;
  if (!r) return null;
  return (
    <ResultSection
      title={RESULT.vision.bankTitle}
      aside={<Pill className="bg-lime/30">{`${RESULT.vision.matchConf} ${Math.round(bank.match_confidence * 100)}%`}</Pill>}
    >
      <div className="flex items-start gap-3">
        <BankLogo src={bankLogoSrc(bank, service)} size="size-12" />
        <div className="min-w-0 flex-1">
          <Rows
            rows={[
              { label: RESULT.issuerLabels.issuer, value: r.name, copy: false, text: true },
              ...(r.city ? [{ label: RESULT.vision.city, value: r.city, copy: false, text: true }] : []),
              ...(r.address ? [{ label: RESULT.vision.address, value: r.address, copy: false, text: true }] : []),
              ...(r.bic ? [{ label: RESULT.vision.bic, value: r.bic, copy: true }] : []),
              ...(r.country
                ? [
                    {
                      label: RESULT.issuerLabels.country,
                      value: r.country,
                      copy: false,
                      text: true,
                      after: r.country_code ? <Flag code={r.country_code} /> : undefined,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
      {bank.alternatives?.length ? <p className="m-0 text-micro text-slate">{RESULT.vision.alternatives(bank.alternatives.length)}</p> : null}
    </ResultSection>
  );
}

/** What else is printed on the cheque. The code-line numbers only appear here when
 *  the MICR line could not be read (MICR owns them otherwise). */
function PrintedDetails({ vision, micrRead }: { vision: VisionResult; micrRead: boolean }) {
  const rows: { label: string; value: string; copy?: boolean; text?: boolean }[] = [];
  if (vision.bank?.name) rows.push({ label: RESULT.vision.bankAsPrinted, value: vision.bank.name, copy: false, text: true });
  if (vision.bank?.branch) rows.push({ label: RESULT.vision.branch, value: vision.bank.branch, copy: false, text: true });
  if (vision.bank?.address) rows.push({ label: RESULT.vision.address, value: vision.bank.address, copy: false, text: true });
  if (!micrRead && vision.cheque_number_printed) rows.push({ label: RESULT.vision.chequeNumberPrinted, value: vision.cheque_number_printed });
  if (!micrRead && vision.account_number_printed) rows.push({ label: RESULT.vision.accountNumberPrinted, value: vision.account_number_printed });
  if (!rows.length) return null;
  return (
    <ResultSection title={RESULT.vision.printedTitle}>
      <Rows rows={rows} />
    </ResultSection>
  );
}

/** Like Section, but takes an optional aside (kept separate to avoid touching Section callers). */
function ResultSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <Section title={title} aside={aside}>{children}</Section>;
}

/* ----------------------------------------------------------------------------
   Header + issue, shared
---------------------------------------------------------------------------- */

function ResultHeader({ result, extra }: { result: ScanResponse; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProductChip product={result.object} />
      <StatusChip status={result.status} />
      {extra}
      <span className="tnum ml-auto inline-flex items-center gap-1 text-micro text-slate">
        <Clock aria-hidden className="size-3.5" strokeWidth={1.8} />
        {duration(result.processing_ms)}
      </span>
    </div>
  );
}

function Issue({ result }: { result: ScanResponse }) {
  if (!result.issue) return null;
  return <Notice tone={result.status === "unreadable" ? "error" : "warning"}>{result.issue}</Notice>;
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-eyebrow font-medium tracking-[0.6px] text-slate uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label / value rows in one soft card; values copyable. An empty value is a field
 * the read did not yield: it shows as "Not captured", never as a blank. */
function Rows({
  rows,
}: {
  rows: { label: string; value: string; after?: ReactNode; copy?: boolean; text?: boolean }[];
}) {
  return (
    <dl className="m-0 overflow-hidden rounded-[14px] border border-hairline bg-page">
      {rows.map((r, i) => (
        <div key={r.label} className={cn("flex items-center gap-3 px-3.5 py-2.5", i > 0 && "border-t border-rule")}>
          <dt className="w-[42%] shrink-0 text-micro text-slate">{r.label}</dt>
          {/* Wraps instead of truncating: a value is never hidden by a badge or a narrow screen. */}
          <dd className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            {r.value ? (
              <span className={cn("tnum min-w-0 text-pine", r.text ? "text-body break-words" : "break-all font-mono text-[13.5px]")}>{r.value}</span>
            ) : (
              <span className="inline-flex items-center rounded-pill bg-caution-tint px-2 py-0.5 text-[11px] font-medium text-caution">
                {RESULT.notCaptured}
              </span>
            )}
            {r.after}
            {r.copy !== false && r.value ? (
              <span className="ml-auto">
                <CopySnippet value={r.value} label={`${RESULT.copy} ${r.label}`} />
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-hairline bg-page px-3 py-2.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="tnum text-body font-medium text-pine">{value}</span>
      {bar !== undefined ? <ConfidenceBar value={bar} warnBelow={WEAK_CHAR} /> : null}
    </div>
  );
}

function Unreadable({ result, icon: Icon }: { result: ScanResponse; icon: LucideIcon }) {
  return (
    <div className="flex flex-col gap-4">
      <ResultHeader result={result} />
      <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-danger/25 bg-danger-tint/40 px-6 py-10 text-center">
        <span className="grid size-11 place-items-center rounded-pill bg-danger-tint text-danger">
          <Icon aria-hidden className="size-5" strokeWidth={1.8} />
        </span>
        <p className="m-0 max-w-[46ch] text-body text-pine">{result.issue}</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Cheque
---------------------------------------------------------------------------- */

function ChequeResult({ result, embedded = false }: { result: ChequeResponse; embedded?: boolean }) {
  const micr = result.micr;
  if (!micr && embedded) {
    return (
      <Section title={RESULT.micrLineTitle} aside={<StatusChip status={result.status} />}>
        <Notice tone="warning">{result.issue}</Notice>
      </Section>
    );
  }
  if (!micr) return <Unreadable result={result} icon={CircleSlash} />;

  const chars = (micr.char_confidences ?? []).map(toNum).filter((n): n is number => n != null);
  const weakest = chars.length ? Math.min(...chars) : (toNum(micr.confidence) ?? 0);
  // The ABA proof accompanies a field named "Routing"; its status is read straight
  // from the API, nothing is re-derived in the browser.
  const proof = micr.routing;
  const routingOk = proof ? proof.valid : false;
  const routingText = proof
    ? RESULT.routing[
        proof.valid ? "valid" : proof.reason === "not_nine_digits" ? "notNine" : proof.checksum_pass ? "prefix" : "checksum"
      ]
    : "";
  // District and type only describe a routing number that is fully valid; a failed
  // check digit means the digits are not a known US routing number.
  const proofRows = proof?.valid
    ? [
        ...(proof.federal_reserve_district
          ? [{ label: RESULT.routingDistrict, value: proof.federal_reserve_district }]
          : []),
        ...(proof.institution_type
          ? [{ label: RESULT.routingType, value: RESULT.routingTypes[proof.institution_type] }]
          : []),
      ]
    : [];
  // Every field the line's font can yield (the API's field_list), with the ones this
  // line did not yield shown as "Not captured"; older records without a list show
  // just the fields they have.
  const demoFields: [string, string][] = micr.field_list
    ? micr.field_list.map((f) => [f.name, f.value])
    : (micr.fields ?? []).flatMap((d) => Object.entries(d));
  const captured = demoFields.filter(([, v]) => v).length;
  const rows = demoFields.flatMap(([key, value]) => {
    const row = {
      label: key,
      value,
      after:
        key === "Routing" && value && proof ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium",
              routingOk ? "bg-pass-tint text-ramp-2" : "bg-danger-tint text-danger",
            )}
          >
            {routingOk ? <CheckCircle2 aria-hidden className="size-3" /> : <XCircle aria-hidden className="size-3" />}
            {routingText}
          </span>
        ) : undefined,
    };
    return key === "Routing" && value ? [row, ...proofRows] : [row];
  });
  const standardRows = (micr.standard?.field_list ?? micr.standard?.fields ?? []).flatMap((f) => [
    { label: f.name, value: f.value },
    ...(f.value ? (f.parts ?? []) : []).map((p) => ({ label: `${f.name} · ${p.name}`, value: p.value })),
  ]);
  const layoutPills = (
    <>
      {micr.template ? <Pill>{standardLabel(micr.template)}</Pill> : null}
      {micr.standard ? <Pill>{standardLabel(micr.standard.id)}</Pill> : null}
      {result.read_on ? <Pill>{RESULT.readOnResized}</Pill> : null}
      {!embedded && result.country ? (
        <Pill>
          <CountryFlag code={result.country.code} className="h-3 w-4" />
          {result.country.name}
        </Pill>
      ) : null}
    </>
  );

  // Second and later MICR lines, if the cheque carried more than one.
  const otherZones = (result.zones ?? []).slice(1);
  const q = result.quality;

  return (
    <div className="flex flex-col gap-4">
      {embedded ? null : (
        <ResultHeader
          result={result}
          extra={
            <>
              {result.zones_detected > 1 ? <Pill className="bg-lime/30">{RESULT.multiZone(result.zones_detected)}</Pill> : null}
              <Pill>{micr.font}</Pill>
              {layoutPills}
            </>
          }
        />
      )}
      <Issue result={result} />

      <Section
        title={RESULT.micrLineTitle}
        aside={
          embedded ? (
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <StatusChip status={result.status} />
              <Pill>{micr.font}</Pill>
              {layoutPills}
            </span>
          ) : undefined
        }
      >
        {/* The line exactly as the engine read it, as plain text. */}
        <div className="flex items-center gap-3 rounded-[14px] border border-hairline bg-page px-4 py-3">
          <span className="min-w-0 flex-1 font-mono text-[17px] tracking-[0.04em] break-all text-pine">{micr.printed}</span>
          <CopySnippet value={micr.text} label={`${RESULT.copy} ${RESULT.micrLineTitle}`} />
        </div>
      </Section>

      {rows.length ? (
        <Section
          title={RESULT.fieldsTitle}
          aside={<span className="tnum text-micro text-slate">{RESULT.capturedCount(captured, demoFields.length)}</span>}
        >
          <Rows rows={rows} />
        </Section>
      ) : null}
      {standardRows.length && micr.standard ? (
        <Section title={RESULT.standardTitle} aside={<Pill>{micr.standard.name}</Pill>}>
          <Rows rows={standardRows} />
        </Section>
      ) : null}
      {otherZones.length ? (
        <Section title={RESULT.multiZone(result.zones_detected)}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {otherZones.map((z) => (
              <OtherZoneRow key={z.index} zone={z} />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={RESULT.confidenceTitle}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={RESULT.lineConfidence} value={pct(micr.confidence)} bar={toNum(micr.confidence) ?? 0} />
          <Stat label={RESULT.weakest} value={pct(weakest)} bar={weakest} />
        </div>
        {weakest < WEAK_CHAR ? <p className="m-0 text-micro text-caution">{RESULT.weakHint}</p> : null}
      </Section>

      <Section title={RESULT.qualityTitle}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={RESULT.qualityLabels.rotation} value={RESULT.degrees(q.rotation)} />
          <Stat label={RESULT.qualityLabels.skew} value={q.skew == null ? "-" : RESULT.degrees(q.skew)} />
          <Stat
            label={RESULT.qualityLabels.weakest}
            value={pct(q.min_char_confidence)}
          />
        </div>
      </Section>
    </div>
  );
}

/** A second/third MICR line: the line as printed, its layout and its named fields. */
function OtherZoneRow({ zone }: { zone: MicrZone }) {
  const named = micrNamedFields(zone);
  return (
    <li className="flex flex-col gap-2 rounded-[12px] border border-hairline bg-page px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Pill>{zone.font}</Pill>
        {zone.template ? <Pill>{standardLabel(zone.template)}</Pill> : null}
        {zone.standard ? <Pill>{standardLabel(zone.standard.id)}</Pill> : null}
        <span className="tnum min-w-0 flex-1 font-mono text-[13px] break-all text-pine">{zone.printed}</span>
        {zone.skew ? (
          <span className="tnum inline-flex items-center gap-1 text-micro text-slate">
            <RotateCcw aria-hidden className="size-3" strokeWidth={1.8} />
            {RESULT.degrees(zone.skew)}
          </span>
        ) : null}
      </div>
      {named.length ? (
        <dl className="m-0 grid grid-cols-[minmax(0,42%)_1fr] gap-x-3 gap-y-1">
          {named.map((f, i) => (
            <div key={`${f.name}-${i}`} className="contents">
              <dt className="text-micro text-slate">{f.name}</dt>
              <dd className="m-0 font-mono text-[12.5px] break-all text-pine">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

/* ----------------------------------------------------------------------------
   Card
---------------------------------------------------------------------------- */

function CheckRow({ ok, icon: Icon, title, detail }: { ok: boolean | null; icon: LucideIcon; title: string; detail?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-[12px] border border-hairline bg-page px-3 py-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-pill",
          ok === null ? "bg-well text-slate" : ok ? "bg-pass-tint text-ramp-2" : "bg-danger-tint text-danger",
        )}
      >
        <Icon aria-hidden className="size-4" strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-medium text-pine">{title}</span>
        {detail ? <span className="truncate text-micro text-slate">{detail}</span> : null}
      </span>
    </li>
  );
}

function CardResult({ result }: { result: CardResponse }) {
  // Prefer the full cards[] entries (each carries its own BIN); fall back to
  // the promoted primary for any older stored record.
  const primary: CardRead | null =
    result.cards?.[0] ?? (result.card ? { ...result.card, bin: result.bin, bank: result.bank } : null);
  if (!primary) return <Unreadable result={result} icon={CircleSlash} />;
  const others = (result.cards ?? []).slice(1);

  return (
    <div className="flex flex-col gap-4">
      <ResultHeader
        result={result}
        extra={
          <>
            {result.cards_detected > 1 ? (
              <Pill className="bg-lime/30">{RESULT.multiCard(result.cards_detected)}</Pill>
            ) : null}
            {primary.bin?.network ? <Pill>{primary.bin.network}</Pill> : null}
          </>
        }
      />
      <Issue result={result} />

      <CardDetail card={primary} />

      {others.length ? (
        <Section title={RESULT.otherCards}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {others.map((c) => (
              <OtherCardRow key={c.index} card={c} />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/** One card in full: face, checks, scheme validation, issuer, fingerprint, confidences. */
function CardDetail({ card }: { card: CardRead }) {
  const bin = card.bin;
  const expiry = cardField(card, "valid_thru");
  const validFrom = cardField(card, "valid_from");
  const holder = cardField(card, "holder_name");
  const company = cardField(card, "company_name");
  const holderConf = cardFieldConf(card, "holder_name");
  const holderLow = holderConf != null && holderConf < 70;
  const country = countryName(bin?.country ?? null);
  const mismatch =
    card.network_from_prefix && bin?.network && card.network_from_prefix !== bin.network
      ? RESULT.networkMismatch(bin.network, card.network_from_prefix)
      : undefined;
  // Every field the engine read, shown exactly as it returned them (the dynamic
  // part). The number is shown masked unless the full PAN is in this response.
  const engineRows = (card.fields ?? [])
    .filter((f) => f.value)
    .map((f) => ({
      label: fieldLabel(f.name),
      value: f.name === "number" ? (card.number ?? maskedPan(card)) : (f.value as string),
      copy: f.name === "number" && !card.number ? false : undefined,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <CardFace card={card} bin={bin} />
          {!card.number ? <p className="m-0 text-micro text-slate">{RESULT.numberHidden}</p> : null}
          {card.fingerprint ? (
            <div className="flex items-center gap-2 rounded-[12px] border border-hairline bg-page px-3 py-2">
              <Fingerprint aria-hidden className="size-4 shrink-0 text-slate" strokeWidth={1.7} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] tracking-[0.4px] text-muted uppercase">{RESULT.fingerprintTitle}</span>
                <span className="tnum truncate font-mono text-[12px] text-pine">{card.fingerprint}</span>
              </span>
              <span className="ml-auto">
                <CopySnippet value={card.fingerprint} label={RESULT.fingerprintTitle} />
              </span>
            </div>
          ) : null}
        </div>

        <Section title={RESULT.checksTitle}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <CheckRow
              ok={card.scheme_valid}
              icon={ScanLine}
              title={card.scheme_valid ? RESULT.scheme.valid : RESULT.scheme.invalid}
              detail={schemeDetail(card)}
            />
            <CheckRow ok={card.luhn_valid} icon={ShieldCheck} title={card.luhn_valid ? RESULT.luhn.pass : RESULT.luhn.fail} />
            <CheckRow
              ok={expiryOk(card)}
              icon={CalendarClock}
              title={expiryTitle(card, expiry)}
              detail={card.expires_in_days != null ? RESULT.expiresInDays(card.expires_in_days) : undefined}
            />
            {validFrom ? <CheckRow ok={null} icon={CalendarClock} title={`${RESULT.validFrom} ${validFrom}`} /> : null}
            <CheckRow
              ok={holder ? !holderLow : null}
              icon={UserRound}
              title={holder ?? RESULT.holderNone}
              detail={holder ? `${RESULT.holder}${holderLow ? ` · ${RESULT.holderLow}` : ""}` : RESULT.holder}
            />
            {company ? <CheckRow ok={null} icon={Building2} title={company} detail={RESULT.company} /> : null}
          </ul>
        </Section>
      </div>

      {mismatch ? <Notice tone="warning">{mismatch}</Notice> : null}

      {engineRows.length ? (
        <Section title={RESULT.engineFieldsTitle}>
          <Rows rows={engineRows} />
        </Section>
      ) : null}

      <Section title={RESULT.issuerTitle}>
        {bin ? (
          <>
            <Rows
              rows={[
                { label: RESULT.issuerLabels.issuer, value: bin.issuer ?? "-", copy: false, text: true },
                { label: RESULT.issuerLabels.network, value: bin.network ?? "-", copy: false, text: true },
                { label: RESULT.issuerLabels.funding, value: bin.funding ? RESULT.fundingLabel[bin.funding] : "-", copy: false, text: true },
                { label: RESULT.issuerLabels.type, value: [bin.type, bin.level].filter(Boolean).join(" · ") || "-", copy: false, text: true },
                ...(bin.currency
                  ? [{ label: RESULT.issuerLabels.currency, value: [bin.currency, bin.currency_name].filter(Boolean).join(" · "), copy: false, text: true }]
                  : []),
                {
                  label: RESULT.issuerLabels.country,
                  value: (bin.country_name ?? country) ?? "-",
                  copy: false,
                  text: true,
                  after: bin.country ? <Flag code={bin.country} /> : undefined,
                },
                ...(bin.phone ? [{ label: RESULT.issuerLabels.phone, value: bin.phone, copy: false, text: true }] : []),
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              <Pill className={bin.is_commercial ? "bg-info-tint text-info" : "bg-well"}>
                {bin.is_commercial ? RESULT.flagCommercial : RESULT.flagConsumer}
              </Pill>
              {bin.is_prepaid ? <Pill className="bg-caution-tint text-caution">{RESULT.flagPrepaid}</Pill> : null}
              {bin.is_reloadable ? <Pill className="bg-pass-tint text-ramp-2">{RESULT.flagReloadable}</Pill> : null}
              {bin.url ? (
                <a href={bin.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-pill bg-well px-2.5 py-0.5 text-micro text-positive underline underline-offset-2">
                  {RESULT.websiteLabel}
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <p className="m-0 rounded-[12px] bg-well px-3.5 py-3 text-micro text-slate">{RESULT.issuerUnknown}</p>
        )}
      </Section>

      {card.bank?.resolved ? <BankCard bank={card.bank} service="card" /> : null}

      <Section title={RESULT.confidenceTitle}>
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <Stat label={RESULT.confidenceLabels.card} value={pct(card.confidence)} bar={toNum(card.confidence) ?? 0} />
          <Stat label={RESULT.confidenceLabels.number} value={pct(cardFieldConf(card, "number"))} bar={toNum(cardFieldConf(card, "number")) ?? 0} />
          <Stat label={RESULT.confidenceLabels.expiry} value={pct(cardFieldConf(card, "valid_thru"))} bar={toNum(cardFieldConf(card, "valid_thru")) ?? 0} />
          <Stat
            label={RESULT.confidenceLabels.holder}
            value={pct(cardFieldConf(card, "holder_name"))}
            bar={toNum(cardFieldConf(card, "holder_name")) ?? 0}
          />
        </div>
      </Section>
    </div>
  );
}

/** A second/third card in a multi-card image, in one compact row. */
function OtherCardRow({ card }: { card: CardRead }) {
  const expiry = cardField(card, "valid_thru");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-hairline bg-page px-3.5 py-2.5">
      {card.bin?.network ? <Pill>{card.bin.network}</Pill> : null}
      <span className="tnum font-mono text-[13px] text-pine">{card.last4 ? `•••• ${card.last4}` : "Not read"}</span>
      {expiry ? <span className="tnum text-micro text-slate">{expiry}</span> : null}
      <span className="min-w-0 flex-1 truncate text-micro text-slate">{card.bin?.issuer ?? "BIN not in table"}</span>
      <StatusPill ok={card.scheme_valid} label={card.scheme_valid ? RESULT.scheme.valid : RESULT.scheme.invalid} />
    </li>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium",
        ok ? "bg-pass-tint text-ramp-2" : "bg-caution-tint text-caution",
      )}
    >
      {ok ? <CheckCircle2 aria-hidden className="size-3" /> : <XCircle aria-hidden className="size-3" />}
      {label}
    </span>
  );
}

function schemeDetail(card: CardRead): string {
  const c = card.scheme_checks;
  const parts = [
    `${RESULT.schemeParts.luhn} ${c.luhn ? "✓" : "✕"}`,
    `${RESULT.schemeParts.length} ${c.length ? "✓" : "✕"}`,
    `${RESULT.schemeParts.iin} ${c.iin_known ? "✓" : "✕"}`,
  ];
  return parts.join("  ");
}

function expiryOk(card: CardRead): boolean | null {
  if (card.expiry_status === "unknown") return null;
  return card.expiry_status === "valid";
}

function expiryTitle(card: CardRead, expiry: string | undefined): string {
  if (card.expiry_status === "unknown") return RESULT.expiry.unknown;
  if (card.expiry_status === "expired") return `${RESULT.expiry.expired} ${expiry ?? ""}`;
  if (card.expiry_status === "expiring_soon") return `${RESULT.expirySoon} · ${expiry ?? ""}`;
  return `${RESULT.expiry.valid} ${expiry ?? ""}`;
}

/** A confidence value as the API sends it: usually a number, but it can arrive
 *  as a string. Coerce so a non-number can never crash `.toFixed`. */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function pct(v: unknown): string {
  const n = toNum(v);
  return n == null ? "-" : `${n.toFixed(1)}%`;
}

export function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG flag, no optimisation needed
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
