"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Check, Copy, CreditCard, Landmark, Search, SearchX, ShieldCheck } from "lucide-react";

import { CodeView } from "@/components/finance/code-view";
import { NetworkMark } from "@/components/finance/network-mark";
import { CreditsAction, Notice, PageHeader, Spinner, StatePanel } from "@/components/finance/parts";
import { BankLogo, Flag, bankLogoSrc } from "@/components/finance/scan-result";
import { FinApiError, finApi } from "@/lib/finance/api";
import { countryName, luhnValid, networkFromPrefix } from "@/lib/finance/card";
import { ACCESS, API_HOST, BIN_PAGE, CREDITS } from "@/lib/finance/content";
import { OFFLINE_BINS } from "@/lib/finance/fixtures";
import type { BinRecord } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/** The last finished lookup. A new one keeps it on screen, dimmed, until it answers. */
type Outcome =
  | { kind: "idle" }
  | { kind: "found"; digits: string; record: BinRecord; offline: boolean }
  | { kind: "missing"; digits: string; offline: boolean }
  | { kind: "error"; digits: string; message: string; code?: string };

const PANEL = "rounded-shell border border-hairline bg-panel p-5";
/** A whole card number is at most 19 digits. */
const MAX_DIGITS = 19;

export function BinLookup() {
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [recent, setRecent] = useState<BinRecord[]>([]);
  const seq = useRef(0);

  // Recent lookups persist across visits so the rail is not empty on return.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fin.bin.recent");
      if (raw) setRecent(JSON.parse(raw) as BinRecord[]);
    } catch {
      /* storage blocked or corrupt */
    }
  }, []);

  async function lookup(raw: string) {
    const typed = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
    setValue(groupDigits(typed));
    // Only the BIN leaves the page: a whole card number is cut to its first 8 digits here.
    const digits = typed.slice(0, 8);
    if (digits.length < 6) {
      setHint(BIN_PAGE.tooShort);
      return;
    }
    setHint(null);
    const id = ++seq.current;
    setPending(true);
    let next: Outcome;
    try {
      const record = await finApi.bin(digits);
      next = { kind: "found", digits, record, offline: false };
    } catch (err) {
      const e = err instanceof FinApiError ? err : null;
      if (e?.kind === "http" && e.status === 404) {
        next = { kind: "missing", digits, offline: false };
      } else if (e?.kind === "http") {
        next = { kind: "error", digits, message: e.message, code: e.code };
      } else {
        const saved = OFFLINE_BINS.find((b) => b.bin === digits.slice(0, 6));
        next = saved ? { kind: "found", digits, record: saved, offline: true } : { kind: "missing", digits, offline: true };
      }
    }
    if (id !== seq.current) return; // a newer lookup started meanwhile; its answer wins
    setPending(false);
    setOutcome(next);
    if (next.kind === "found") remember(next.record);
  }

  function remember(record: BinRecord) {
    setRecent((prev) => {
      const next = [record, ...prev.filter((r) => r.bin !== record.bin)].slice(0, 8);
      try {
        localStorage.setItem("fin.bin.recent", JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void lookup(value);
  };

  /** Keep the digits grouped like a card as they are typed or pasted, caret in place. */
  const onType = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
    const next = groupDigits(el.value.replace(/\D/g, "").slice(0, MAX_DIGITS));
    setValue(next);
    setHint(null);
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      let pos = 0;
      for (let seen = 0; pos < next.length && seen < before; pos++) if (/\d/.test(next.charAt(pos))) seen++;
      el.setSelectionRange(pos, pos);
    });
  };

  const typed = value.replace(/\D/g, "");
  const wholeNumber = typed.length > 8;
  const luhn = typed.length >= 12 ? luhnValid(typed) : null;

  return (
    <>
      <PageHeader title={BIN_PAGE.title} subtitle={BIN_PAGE.subtitle} />

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className={cn(PANEL, "flex flex-col gap-3")}>
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
              <label className="relative flex h-12 w-full items-center sm:flex-1">
                <span className="sr-only">{BIN_PAGE.inputLabel}</span>
                <Landmark aria-hidden className="pointer-events-none absolute left-4 size-5 text-pine/45" strokeWidth={1.7} />
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={hint ? true : undefined}
                  value={value}
                  onChange={onType}
                  placeholder={BIN_PAGE.placeholder}
                  className="tnum h-full w-full rounded-[14px] border border-hairline bg-white pr-4 pl-12 font-mono text-[16px] tracking-[0.04em] text-pine sm:text-[18px] sm:tracking-[0.1em] caret-pine placeholder:font-sans placeholder:text-[15px] placeholder:tracking-normal placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] bg-lime px-6 text-body font-medium text-pine transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-pine/40 focus-visible:outline-none disabled:opacity-60"
              >
                {pending ? <Spinner /> : <Search aria-hidden className="size-4" strokeWidth={2} />}
                {BIN_PAGE.submit}
              </button>
            </form>
            {hint ? (
              <p role="alert" className="m-0 text-micro text-danger">
                {hint}
              </p>
            ) : wholeNumber ? (
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-slate">
                <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-positive" strokeWidth={2} />
                {BIN_PAGE.wholeNumberNote}
                {luhn != null ? (
                  <span className={cn("rounded-pill px-2 py-0.5 font-medium", luhn ? "bg-pass-tint text-ramp-2" : "bg-danger-tint text-danger")}>
                    {luhn ? BIN_PAGE.luhnPass : BIN_PAGE.luhnFail}
                  </span>
                ) : null}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-micro text-slate">{BIN_PAGE.tryLabel}</span>
              <div className="grid grid-cols-4 gap-2 sm:flex">
                {BIN_PAGE.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void lookup(ex)}
                    className="tnum h-7 rounded-pill border border-hairline bg-page px-1 font-mono text-[12.5px] sm:px-3 text-pine transition-colors hover:border-pine/25 hover:bg-hover-light focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div aria-busy={pending} className={cn("flex min-w-0 flex-col gap-4 transition-opacity duration-300", pending && outcome.kind !== "idle" && "opacity-55")}>
            {outcome.kind === "idle" ? (
              <StatePanel icon={CreditCard} title={BIN_PAGE.emptyTitle} body={BIN_PAGE.emptyBody} />
            ) : (
              <Result outcome={outcome} />
            )}
          </div>
          <p role="status" className="sr-only">
            {announce(outcome)}
          </p>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Recent items={recent} current={outcome.kind === "found" ? outcome.record.bin : null} onPick={(bin) => void lookup(bin)} />
        </aside>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------
   The answer
---------------------------------------------------------------------------- */

function Result({ outcome }: { outcome: Exclude<Outcome, { kind: "idle" }> }) {
  if (outcome.kind === "error") {
    if (outcome.code === ACCESS.code) {
      return (
        <Notice tone="warning" title={ACCESS.title}>
          {outcome.message || ACCESS.body}
        </Notice>
      );
    }
    return outcome.code === CREDITS.code ? (
      <Notice tone="warning" title={CREDITS.title} action={<CreditsAction />}>
        {CREDITS.body}
      </Notice>
    ) : (
      <Notice tone="error">{outcome.message}</Notice>
    );
  }

  if (outcome.kind === "missing") {
    const net = networkFromPrefix(outcome.digits);
    return (
      <StatePanel
        icon={SearchX}
        title={outcome.offline ? BIN_PAGE.offlineMissTitle : BIN_PAGE.notFoundTitle}
        body={outcome.offline ? BIN_PAGE.offlineMiss : `${BIN_PAGE.notFoundBody}${net ? ` ${BIN_PAGE.prefixNote} ${net}.` : ""}`}
      />
    );
  }

  return (
    <>
      {outcome.offline ? <Notice tone="warning">{BIN_PAGE.offlineNote}</Notice> : null}
      <ResultCard r={outcome.record} />
      <FromCode r={outcome.record} digits={outcome.digits} />
    </>
  );
}

/**
 * One card: the bank on top, then every fact on the same four-column grid
 * (two columns on a phone), so labels and values line up row to row.
 */
function ResultCard({ r }: { r: BinRecord }) {
  const t = BIN_PAGE.result;
  const bank = r.bank?.resolved ? r.bank : null;
  const res = bank?.resolved ?? null;
  const name = res?.name ?? r.issuer ?? t.unknownBank;
  const listedAs = res && r.issuer && squash(r.issuer) !== squash(res.name) ? r.issuer : null;
  const sub = res ? (listedAs ? `${t.listedAs} ${listedAs}` : null) : t.notInDirectory;
  const country = r.country_name ?? countryName(r.country);
  const category = r.category ? cap(r.category) : r.is_commercial != null ? (r.is_commercial ? t.commercial : t.consumer) : null;
  const website = r.url && /^https?:\/\//i.test(r.url) ? r.url : null;

  return (
    <section className={cn(PANEL, "@container flex flex-col gap-4")}>
      <div className="flex items-center gap-3">
        <BankLogo src={bankLogoSrc(bank, "card")} size="size-11" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 text-[17px] leading-snug font-medium break-words text-pine">{name}</h2>
          {sub ? <p className="m-0 text-micro break-words text-slate">{sub}</p> : null}
          <BinBadge bin={r.bin} className="mt-1 self-start @md:hidden" />
        </div>
        <BinBadge bin={r.bin} className="hidden @md:inline-flex" />
      </div>

      <Grid>
        <Cell label={t.network}>
          {r.network ? (
            <>
              <NetworkMark network={r.network} />
              {r.network}
            </>
          ) : null}
        </Cell>
        <Cell label={t.type}>{r.type}</Cell>
        <Cell label={t.level}>{r.level}</Cell>
        <Cell label={t.category}>{category}</Cell>
        <Cell label={t.country} sub={country ? [r.country, r.country_code3].filter(Boolean).join(" · ") : null}>
          {country ? (
            <>
              {r.country ? <Flag code={r.country} /> : null}
              {country}
            </>
          ) : null}
        </Cell>
        <Cell label={t.currency} sub={r.currency_name}>
          {r.currency}
        </Cell>
        <Cell label={t.prepaid}>{yesNo(r.is_prepaid)}</Cell>
        <Cell label={t.reloadable}>{yesNo(r.is_reloadable)}</Cell>
      </Grid>

      {res ? (
        <Grid>
          <Cell label={t.bic}>
            {res.bic ? (
              <>
                <span className="tnum font-mono text-[13px]">{res.bic}</span>
                <CopyIcon value={res.bic} />
              </>
            ) : null}
          </Cell>
          <Cell label={t.city}>{res.city}</Cell>
          {r.phone && !website ? (
            <Cell label={t.phone}>{r.phone}</Cell>
          ) : (
            <Cell label={t.website}>
              {website ? (
                <a href={website} target="_blank" rel="noreferrer" className="break-all text-positive underline decoration-positive/30 underline-offset-[3px] hover:decoration-positive">
                  {host(website)}
                </a>
              ) : null}
            </Cell>
          )}
          <Cell label={t.match}>
            <span className="tnum">{Math.round((bank?.match_confidence ?? 0) * 100)}%</span>
          </Cell>
        </Grid>
      ) : null}
    </section>
  );
}

function BinBadge({ bin, className }: { bin: string; className?: string }) {
  return (
    <span className={cn("tnum inline-flex shrink-0 rounded-pill bg-well px-2.5 py-1 font-mono text-[12px] text-pine", className)}>
      {BIN_PAGE.result.bin} {bin}
    </span>
  );
}

/** A small copy button that fits on one line with the value. */
function CopyIcon({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? BIN_PAGE.result.copied : `${BIN_PAGE.result.copy} ${value}`}
      title={copied ? BIN_PAGE.result.copied : BIN_PAGE.result.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked by the browser */
        }
      }}
      className="grid size-[22px] place-items-center rounded-[6px] text-slate transition-colors hover:bg-hover-panel hover:text-pine focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-positive" strokeWidth={2.2} /> : <Copy aria-hidden className="size-3.5" strokeWidth={1.8} />}
    </button>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-4 @lg:grid-cols-4">{children}</dl>;
}

/** Label on top, value below; an empty value shows as a dash so the grid stays even. */
function Cell({ label, sub, children }: { label: string; sub?: string | null; children: ReactNode }) {
  const empty = children == null || children === "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-micro text-slate">{label}</dt>
      <dd className={cn("m-0 flex min-h-[22px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body break-words", empty ? "text-slate" : "font-medium text-pine")}>
        {empty ? "-" : children}
      </dd>
      {sub ? <dd className="m-0 text-micro text-slate">{sub}</dd> : null}
    </div>
  );
}

/** The same lookup over the API: one code panel, request or response. */
function FromCode({ r, digits }: { r: BinRecord; digits: string }) {
  const [tab, setTab] = useState<"request" | "response">("response");
  const request = [`curl ${API_HOST}/v2/bin/${digits} \\`, `  -H "Authorization: Bearer $VERISEC_API_KEY"`].join("\n");

  return (
    <section className={cn(PANEL, "flex flex-col gap-3")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-section font-medium text-pine">{BIN_PAGE.codeTitle}</h2>
          <p className="m-0 max-w-[60ch] text-micro text-slate">{BIN_PAGE.codeBody}</p>
        </div>
        <div role="group" aria-label={BIN_PAGE.codeTitle} className="inline-flex shrink-0 rounded-pill bg-well p-1">
          {(["request", "response"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-7 rounded-pill px-3.5 text-micro font-medium transition-colors focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none",
                tab === id ? "bg-page text-pine shadow-[0_1px_3px_rgba(14,50,40,0.14)]" : "text-slate hover:text-pine",
              )}
            >
              {id === "request" ? BIN_PAGE.requestLabel : BIN_PAGE.responseLabel}
            </button>
          ))}
        </div>
      </div>
      <CodeView
        label={tab === "request" ? `GET /v2/bin/${digits}` : `${BIN_PAGE.responseLabel} · 200`}
        copyLabel="Copy"
        body={tab === "request" ? request : JSON.stringify(r, null, 2)}
        className="max-h-[340px] [scrollbar-color:rgb(207_224_216/0.28)_transparent]"
      />
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Right rail
---------------------------------------------------------------------------- */

function Recent({ items, current, onPick }: { items: BinRecord[]; current: string | null; onPick: (bin: string) => void }) {
  return (
    <section className={cn(PANEL, "flex flex-col gap-3")}>
      <h2 className="m-0 text-section font-medium text-pine">{BIN_PAGE.recentTitle}</h2>
      {items.length === 0 ? (
        <p className="m-0 text-micro text-slate">{BIN_PAGE.recentEmpty}</p>
      ) : (
        <ul className="m-0 -mx-2 flex list-none flex-col gap-0.5 p-0">
          {items.map((r) => (
            <li key={r.bin}>
              <button
                type="button"
                onClick={() => onPick(r.bin)}
                aria-current={current === r.bin ? "true" : undefined}
                className={cn(
                  "grid w-full grid-cols-[72px_minmax(0,1fr)_20px] items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-hover-panel focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none",
                  current === r.bin && "bg-hover-panel",
                )}
              >
                <span className="tnum font-mono text-[12.5px] text-pine">{r.bin}</span>
                <span className="truncate text-micro text-slate">{r.issuer ?? r.network ?? "-"}</span>
                {r.country ? <Flag code={r.country} /> : <span />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Helpers
---------------------------------------------------------------------------- */

/** What a screen reader hears when a lookup answers. */
function announce(o: Outcome): string {
  if (o.kind === "found") {
    const r = o.record;
    return `${BIN_PAGE.found}: ${[r.network, r.type, r.issuer, r.country_name ?? countryName(r.country)].filter(Boolean).join(", ")}`;
  }
  if (o.kind === "missing") return o.offline ? BIN_PAGE.offlineMissTitle : BIN_PAGE.notFoundTitle;
  return "";
}

/** Digits grouped like the card: 4-6-5 for American Express, fours otherwise. */
function groupDigits(d: string): string {
  const sizes = networkFromPrefix(d) === "American Express" ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const out: string[] = [];
  let at = 0;
  for (const n of sizes) {
    if (at >= d.length) break;
    out.push(d.slice(at, at + n));
    at += n;
  }
  if (at < d.length) out.push(d.slice(at));
  return out.join(" ");
}

function yesNo(v: boolean | undefined): string | null {
  return v == null ? null : v ? BIN_PAGE.result.yes : BIN_PAGE.result.no;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Letters and digits only, for telling whether two spellings of a name differ. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
