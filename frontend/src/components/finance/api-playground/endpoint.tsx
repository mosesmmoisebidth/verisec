"use client";

import { isBoundingBox } from "@/lib/finance/json-brief";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Braces, ChevronDown, Clock, Code2, Download, FileText, KeyRound, ListTree, Loader2, Play, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";

import { FinHowTo } from "@/components/finance/api-playground/howto";
import { FinGroupTile, FinHeaderEditor } from "@/components/finance/api-playground/parts";
import { FinCaptureTips, FinUploadZone } from "@/components/finance/api-playground/upload";
import { FieldCell } from "@/components/api-keys/playground-fields";
import { CodeLines, CodeLineText, CopyButton, InlineCode, JsonEditor, JsonTree } from "@/components/api-keys/playground-parts";
import { API_HOST } from "@/lib/finance/content";
import type { FinEndpoint } from "@/lib/finance/playground-catalog";
import { FIN_SNIPPET_LANGS, initialState, jsonBody, requestFor, requestSchema, runFin, snippetFor } from "@/lib/finance/playground-run";
import type { FinFormState, FinOutcome, FinRequest, FinSnippetLang, HeaderRow } from "@/lib/finance/playground-run";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Which key a run can be made with. `local`: no gateway on this setup, runs use the
 * signed-in session. Otherwise the run needs a chosen key: still `loading` the list,
 * `none` (the organisation has no active key), `unpicked`, or `ready`.
 */
export type KeyState = "local" | "loading" | "none" | "unpicked" | "ready";

/** Why Send can't run yet, in the same words as the KYC Playground. */
const NO_KEY: Record<Exclude<KeyState, "local" | "ready">, { tone: "info" | "warning"; title: string; body: string }> = {
  none: { tone: "warning", title: "No active API keys", body: "Create a key in API Keys, then come back to run requests here." },
  loading: { tone: "info", title: "Loading your API keys", body: "Try again in a moment." },
  unpicked: { tone: "warning", title: "Choose an API key", body: "Pick the key to run with at the top of the Playground." },
};

export type RunRecord = { key: number; id: string; name: string; group: FinEndpoint["group"]; path: string; ok: boolean; tone: Tone; status: string; latency: string; at: string };

type Tone = "ok" | "warn" | "err";
type Tab = "params" | "body" | "headers" | "auth";
type RespView = "pretty" | "raw" | "example";

export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function toneOf(o: FinOutcome): Tone {
  if (o.ok) return "ok";
  return !o.http || o.http >= 400 ? "err" : "warn";
}

function statusOf(o: FinOutcome): string {
  if (!o.http) return "No connection";
  if (o.ok) return `${o.http} OK`;
  if (o.http === 400) return "400 Bad request";
  if (o.http === 404) return "404 Not found";
  if (o.http === 413) return "413 Too large";
  if (o.http === 415) return "415 Unsupported image";
  if (o.http === 422) return "422 Invalid body";
  if (o.http === 401 || o.http === 403) return `${o.http} Not allowed`;
  if (o.http >= 500) return `${o.http} Unavailable`;
  return `${o.http} Error`;
}

function without(errs: Record<string, string>, key: string): Record<string, string> {
  const next = { ...errs };
  delete next[key];
  return next;
}

const now = () => new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* ----------------------------------------------------------------------------
   The row in the endpoint list, and the console it opens
---------------------------------------------------------------------------- */

export function EndpointRow({
  ep,
  open,
  mounted,
  hidden,
  onToggle,
  onRun,
  recent,
  apiKeyLabel,
  manageKeysHref,
  runKey,
  keyState,
}: {
  ep: FinEndpoint;
  open: boolean;
  mounted: boolean;
  hidden: boolean;
  onToggle: () => void;
  onRun: (r: Omit<RunRecord, "key">) => void;
  recent: RunRecord[];
  apiKeyLabel: string;
  manageKeysHref: string;
  /** The key runs are made as (live site), or null for the signed-in session. */
  runKey: { id: string; env: string } | null;
  /** Whether a run can go now, and if not, why (see KeyState). */
  keyState: KeyState;
}) {
  return (
    <div id={`fep-${ep.id}`} className={cn("border-b border-rule last:border-0", hidden && "hidden")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn("relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors sm:px-5", open ? "bg-[image:var(--gradient-tab)]" : "hover:bg-hover-light")}
      >
        <FinGroupTile group={ep.group} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-medium text-pine">{ep.name}</span>
            {ep.tier === "major" ? <span className="rounded-pill bg-lime px-1.5 py-px text-[10px] font-semibold text-pine">Major</span> : null}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <span className="rounded-[6px] bg-info-tint px-1.5 py-px text-[10.5px] font-semibold tracking-[0.3px] text-info">{ep.method}</span>
            <code className="truncate font-mono text-[12px] text-slate">{ep.path}</code>
          </span>
        </span>
        {!open ? <span className="hidden max-w-[38ch] truncate text-[12.5px] text-slate xl:block">{ep.summary}</span> : null}
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-pass-tint px-2 py-0.5 text-[11px] font-medium text-ramp-2">
          <span aria-hidden className="size-1.5 rounded-pill bg-ramp-3" />
          Live
        </span>
        <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-pill border transition-colors", open ? "border-pine bg-pine text-lime" : "border-edge bg-page text-pine")}>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} strokeWidth={2} />
        </span>
        {open ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-lime" /> : null}
      </button>
      {mounted ? (
        <div className={open ? "" : "hidden"}>
          <EndpointConsole ep={ep} onRun={onRun} recent={recent} apiKeyLabel={apiKeyLabel} manageKeysHref={manageKeysHref} runKey={runKey} keyState={keyState} />
        </div>
      ) : null}
    </div>
  );
}

function EndpointConsole({
  ep,
  onRun,
  recent,
  apiKeyLabel,
  manageKeysHref,
  runKey,
  keyState,
}: {
  ep: FinEndpoint;
  onRun: (r: Omit<RunRecord, "key">) => void;
  recent: RunRecord[];
  apiKeyLabel: string;
  manageKeysHref: string;
  runKey: { id: string; env: string } | null;
  keyState: KeyState;
}) {
  const [state, setState] = useState<FinFormState>(() => initialState(ep));
  const [customJson, setCustomJson] = useState<string | null>(null);
  const [headers, setHeaders] = useState<HeaderRow[]>([{ name: "X-Request-Id", value: "", on: false }]);
  const [tab, setTab] = useState<Tab>("params");
  const [lang, setLang] = useState<FinSnippetLang>("curl");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<FinOutcome | null>(null);
  const [view, setView] = useState<RespView>("pretty");
  const [sent, setSent] = useState<FinRequest | null>(null);
  const [side, setSide] = useState<"request" | "response">("response");
  const [tree, setTree] = useState({ depth: 3, v: 0 });
  const [howto, setHowto] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  const upload = ep.params.find((p) => p.kind === "image") ?? null;
  const fields = ep.params.filter((p) => p.kind !== "image");
  const kind = ep.group === "Credit Card" ? "card" : "cheque";
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, [running]);

  // A JSON body typed by hand (JSON endpoints only) replaces the fields until reset.
  const customError = useMemo(() => {
    if (customJson === null || !customJson.trim()) return null;
    try {
      const v = JSON.parse(customJson);
      return v && typeof v === "object" && !Array.isArray(v) ? null : "The body must be a JSON object.";
    } catch {
      return "This is not valid JSON. Check for a missing comma or quote.";
    }
  }, [customJson]);
  const effective = useMemo<FinFormState>(() => {
    if (customJson === null || customError) return state;
    const parsed = JSON.parse(customJson || "{}") as Record<string, unknown>;
    return { ...state, values: Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])) };
  }, [state, customJson, customError]);

  const preview = useMemo(() => requestFor(ep, effective, headers, null), [ep, effective, headers]);
  const snippet = useMemo(() => snippetFor(lang, ep, effective, headers), [lang, ep, effective, headers]);
  const reqSchema = useMemo(() => requestSchema(ep), [ep]);
  const raw = useMemo(() => (outcome ? JSON.stringify(outcome.payload, null, 2) : ""), [outcome]);

  const setValue = (name: string, v: string | boolean) => {
    setState((s) => ({ ...s, values: { ...s.values, [name]: String(v) } }));
    if (errors[name]) setErrors((e) => without(e, name));
  };
  const setFile = (f: File | null) => {
    setState((s) => ({ ...s, file: f }));
    if (errors.image) setErrors((e) => without(e, "image"));
  };

  const reset = () => {
    setState(initialState(ep));
    setCustomJson(null);
    setErrors({});
    setOutcome(null);
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (upload && !state.file) errs.image = `Add the ${upload.label.toLowerCase()} to send this request.`;
    if (customJson === null) for (const p of fields) if (p.required && !(state.values[p.name] ?? "").trim()) errs[p.name] = `${p.label} is required.`;
    return errs;
  };

  const send = async () => {
    if (running) return;
    if (keyState !== "local" && keyState !== "ready") {
      const why = NO_KEY[keyState];
      toast[why.tone](why.title, why.body);
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTab("params");
      return;
    }
    if (customError) {
      setTab("body");
      return;
    }
    const started = performance.now();
    setSent(requestFor(ep, effective, headers, now()));
    setSide("response");
    setRunning(true);
    setElapsed(0);
    setOutcome(null);
    try {
      const o = await runFin(ep, effective, headers, keyState === "ready" ? runKey : null);
      setOutcome(o);
      setView("pretty");
      setTree((t) => ({ depth: 3, v: t.v + 1 }));
      onRun({ id: ep.id, name: ep.name, group: ep.group, path: ep.path, ok: o.ok, tone: toneOf(o), status: statusOf(o), latency: fmtMs(o.latencyMs), at: now() });
    } catch (e) {
      const o: FinOutcome = { ok: false, http: 0, latencyMs: performance.now() - started, size: "0 B", payload: { message: (e as Error).message } };
      setOutcome(o);
      onRun({ id: ep.id, name: ep.name, group: ep.group, path: ep.path, ok: false, tone: "err", status: statusOf(o), latency: fmtMs(o.latencyMs), at: now() });
    } finally {
      setRunning(false);
      requestAnimationFrame(() => {
        const el = responseRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top > window.innerHeight - 120 || r.bottom < 80) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  // Ctrl/Cmd + Enter sends from anywhere inside this endpoint
  const rootRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<() => void>(() => {});
  useEffect(() => {
    sendRef.current = () => void send();
  });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendRef.current();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  const download = () => {
    if (!outcome) return;
    const blob = new Blob([JSON.stringify(outcome.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ep.id}-response.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const contentType = ep.body === "multipart" ? "multipart/form-data" : ep.body === "json" ? "application/json" : null;
  const enabledHeaders = headers.filter((h) => h.on && h.name.trim()).length + (contentType ? 3 : 2);
  const tabs: { id: Tab; label: string; icon: typeof Braces; badge?: string }[] = [
    { id: "params", label: "Parameters", icon: SlidersHorizontal, badge: String(ep.params.length) },
    { id: "body", label: "Body", icon: Braces, badge: customJson !== null ? "Custom" : undefined },
    { id: "headers", label: "Headers", icon: ListTree, badge: String(enabledHeaders) },
    { id: "auth", label: "Authorization", icon: KeyRound },
  ];

  const cells = (
    <div className={cn("grid content-start gap-x-5 gap-y-5", upload ? "sm:grid-cols-2" : fields.length > 1 && "sm:grid-cols-2 xl:grid-cols-3")}>
      {fields.map((p) => (
        <FieldCell key={p.name} param={p} value={state.values[p.name]} error={errors[p.name]} onChange={(v) => setValue(p.name, v)} />
      ))}
    </div>
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-4 border-t border-rule bg-page px-4 pt-4 pb-5 duration-200 motion-safe:animate-in motion-safe:fade-in sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-[75ch] text-[13.5px] leading-[21px] text-ink-muted">{ep.summary}</p>
        <button
          type="button"
          onClick={() => setHowto(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border border-pine/25 bg-lime-tint px-3.5 text-[12.5px] font-semibold text-pine shadow-[0_1px_2px_rgb(14_50_40/0.06)] transition-colors hover:bg-lime-wash"
        >
          <BookOpen aria-hidden className="size-4" strokeWidth={2} />
          How to use
        </button>
      </div>

      {/* where it goes, and the one primary action */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-edge bg-page p-1.5 pl-2.5 shadow-[0_1px_2px_rgb(14_50_40/0.05)]">
        <span className="rounded-[8px] bg-info-tint px-2 py-1 text-[11.5px] font-semibold tracking-[0.3px] text-info">{ep.method}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-[12.5px] whitespace-nowrap">
          <span className="hidden text-slate sm:inline">{API_HOST.replace("https://", "")}</span>
          {preview.path
            .split("?")[0]!
            .split("/")
            .filter(Boolean)
            .map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-slate/50">/</span>
                <span className="text-pine">{seg}</span>
              </span>
            ))}
          {preview.path.includes("?") ? <span className="truncate text-slate">{`?${preview.path.split("?")[1]}`}</span> : null}
        </span>
        {customJson !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-caution-tint px-2.5 py-1 text-[11.5px] font-medium text-caution">
            <Braces aria-hidden className="size-3.5" strokeWidth={2} />
            Sending custom JSON
          </span>
        ) : null}
        <CopyButton tone="light" value={preview.url} label="Copy URL" />
        <button
          type="button"
          onClick={() => void send()}
          disabled={running}
          title={keyState !== "local" && keyState !== "ready" ? `${NO_KEY[keyState].title}. ${NO_KEY[keyState].body}` : undefined}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-lime pr-2.5 pl-4 text-[14px] font-semibold text-pine shadow-cta transition-[filter,transform] hover:brightness-95 active:translate-y-px disabled:cursor-wait disabled:opacity-75"
        >
          {running ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.4} /> : <Play aria-hidden className="size-4" strokeWidth={2} fill="currentColor" />}
          {running ? "Running" : "Send"}
          <span className="tnum ml-1 rounded-[6px] bg-pine/10 px-1.5 py-0.5 text-[10.5px] font-medium">{running ? fmtMs(elapsed) : `${mod} ↵`}</span>
        </button>
      </div>

      <div>
        <div role="tablist" aria-label="Request" className="flex items-end gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ id, label, icon: Icon, badge }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-2 rounded-t-[10px] px-3.5 py-2.5 text-[13px] whitespace-nowrap transition-colors",
                  active ? "bg-[image:var(--gradient-tab)] font-semibold text-pine" : "text-[#8a8a8a] hover:text-pine",
                )}
              >
                <Icon aria-hidden className={cn("size-4", active ? "text-pine" : "text-[#a6a6a6]")} strokeWidth={1.9} />
                {label}
                {badge ? <span className={cn("tnum rounded-pill px-1.5 py-px text-[10.5px] font-medium", active ? "bg-pine text-lime" : "bg-well text-slate")}>{badge}</span> : null}
                {active ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-lime" /> : null}
              </button>
            );
          })}
          <button type="button" onClick={reset} className="mb-1.5 ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium text-pine transition-colors hover:bg-hover-light">
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.9} />
            Reset to example
          </button>
        </div>

        <div className="pt-5">
          {tab === "params" ? (
            <div className="flex flex-col gap-5">
              {customJson !== null ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-caution-tint px-4 py-3">
                  <Braces aria-hidden className="size-4 text-caution" strokeWidth={2} />
                  <p className="m-0 min-w-0 flex-1 text-[12.5px] text-caution">You are sending the JSON from the Body tab, so the fields below are not used.</p>
                  <button type="button" onClick={() => setCustomJson(null)} className="h-8 rounded-pill border border-caution/30 bg-page px-3 text-[12px] font-medium text-caution hover:bg-hover-light">
                    Use the fields again
                  </button>
                </div>
              ) : null}
              {upload ? (
                <div className="grid gap-6 xl:grid-cols-12">
                  <div className="xl:col-span-6">
                    <FinUploadZone param={upload} kind={kind} file={state.file} error={errors.image} onPick={setFile} />
                  </div>
                  <div className="xl:col-span-6">{fields.length ? cells : <FinCaptureTips kind={kind} />}</div>
                </div>
              ) : fields.length === 1 ? (
                <div className="max-w-[560px]">{cells}</div>
              ) : (
                cells
              )}
            </div>
          ) : null}

          {tab === "body" ? (
            <div className="flex flex-col gap-2.5">
              {ep.body === "json" ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-well px-2.5 py-1 text-[11.5px] text-slate">
                      Content type <span className="font-mono text-pine">application/json</span>
                    </span>
                    <span className={cn("rounded-pill px-2.5 py-1 text-[11.5px] font-medium", customJson !== null ? "bg-caution-tint text-caution" : "bg-lime-tint text-ramp-2")}>
                      {customJson !== null ? "Sending this JSON" : "Follows the parameters until you edit it"}
                    </span>
                    {customJson !== null ? (
                      <button type="button" onClick={() => setCustomJson(null)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine hover:bg-hover-light">
                        <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.9} />
                        Use the parameters
                      </button>
                    ) : null}
                  </div>
                  <JsonEditor value={customJson ?? JSON.stringify(jsonBody(ep, state), null, 2)} onChange={(v) => setCustomJson(v)} error={customError} />
                  {customError ? <p role="alert" className="m-0 text-[12px] font-medium text-danger">{customError}</p> : null}
                </>
              ) : ep.body === "multipart" ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-well px-2.5 py-1 text-[11.5px] text-slate">
                      Content type <span className="font-mono text-pine">multipart/form-data</span>
                    </span>
                    <span className="rounded-pill bg-lime-tint px-2.5 py-1 text-[11.5px] font-medium text-ramp-2">Built from the Parameters tab</span>
                  </div>
                  <div className="overflow-hidden rounded-[12px] border border-edge">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-panel text-[11px] font-medium text-slate">
                          <th className="px-3 py-2 font-medium">Part</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ep.params.map((p) => (
                          <tr key={p.name} className="border-t border-rule">
                            <td className="px-3 py-2 font-mono text-[12px] text-pine">{p.name}</td>
                            <td className="px-3 py-2 font-mono text-[12px] text-slate">
                              {p.kind === "image" ? (state.file ? `${state.file.name} (${Math.max(1, Math.round(state.file.size / 1024))} KB)` : "the photo you upload") : state.values[p.name] || "(not sent)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="m-0 text-[12px] text-slate">The photo goes as a file part, exactly as you upload it; the other fields go as form fields.</p>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="w-fit rounded-pill bg-well px-2.5 py-1 text-[11.5px] text-slate">No body</span>
                  <p className="m-0 text-[12.5px] text-slate">
                    {`This request carries its parameters in the URL: `}
                    <InlineCode tone="light" text={`\`${ep.method} ${preview.path}\``} />
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {tab === "headers" ? (
            <div className="flex max-w-[860px] flex-col gap-3">
              <FinHeaderEditor rows={headers} setRows={setHeaders} contentType={contentType} />
              <p className="m-0 text-[12px] text-slate">Checked headers are sent with the request. Authorization and Content-Type are set for you.</p>
            </div>
          ) : null}

          {tab === "auth" ? (
            <div className="flex max-w-[860px] flex-col gap-3.5">
              <div className="grid items-center gap-x-4 gap-y-2.5 md:grid-cols-[130px_minmax(0,1fr)]">
                <span className="text-[12.5px] font-medium text-pine">Type</span>
                <span className="inline-flex h-10 items-center rounded-[10px] border border-edge bg-well px-3 text-[13px] text-pine">Bearer token</span>
                <span className="text-[12.5px] font-medium text-pine">API key</span>
                <span className="flex h-10 min-w-0 items-center gap-2 rounded-[10px] border border-edge bg-well pr-1.5 pl-3">
                  <KeyRound aria-hidden className="size-4 shrink-0 text-slate" strokeWidth={1.8} />
                  <span className="tnum min-w-0 flex-1 truncate font-mono text-[12.5px] text-pine">{apiKeyLabel}</span>
                  <a href={manageKeysHref} className="shrink-0 rounded-pill border border-edge bg-page px-3 py-1 text-[12px] font-medium text-pine hover:bg-hover-light">
                    Manage keys
                  </a>
                </span>
              </div>
              <p className="m-0 max-w-[70ch] text-[12.5px] leading-[19px] text-slate">
                {keyState !== "local"
                  ? "Runs from this page are made as the key chosen at the top of the Playground, through the same gateway as your own code, so its permissions, rate limit and credits apply. In your own code, send the key as "
                  : "Runs from this page go to the test environment from your console, so no key is sent from here. In your own code, send the key as "}
                <InlineCode tone="light" text="`Authorization: Bearer YOUR_API_KEY`" />.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* the request as code and the response, side by side, the same height */}
      <div ref={responseRef} className="grid scroll-mt-4 gap-4 xl:grid-cols-2">
        <CodePanel snippet={snippet} lang={lang} setLang={setLang} />
        <Response
          outcome={outcome}
          running={running}
          elapsed={elapsed}
          mod={mod}
          view={view}
          setView={setView}
          tree={tree}
          setTree={setTree}
          raw={raw}
          recent={recent}
          onDownload={download}
          request={sent ?? preview}
          captured={!!sent}
          side={side}
          setSide={setSide}
          example={ep.example}
          reqSchema={reqSchema}
        />
      </div>

      {howto ? <FinHowTo ep={ep} onClose={() => setHowto(false)} /> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The response (and the request message / schema)
---------------------------------------------------------------------------- */

function Response({
  outcome,
  running,
  elapsed,
  mod,
  view,
  setView,
  tree,
  setTree,
  raw,
  recent,
  onDownload,
  request,
  captured,
  side,
  setSide,
  example,
  reqSchema,
}: {
  outcome: FinOutcome | null;
  running: boolean;
  elapsed: number;
  mod: string;
  view: RespView;
  setView: (v: RespView) => void;
  tree: { depth: number; v: number };
  setTree: React.Dispatch<React.SetStateAction<{ depth: number; v: number }>>;
  raw: string;
  recent: RunRecord[];
  onDownload: () => void;
  request: FinRequest;
  captured: boolean;
  side: "request" | "response";
  setSide: (s: "request" | "response") => void;
  example: unknown;
  reqSchema: unknown;
}) {
  const showRequest = side === "request" && !running;
  const [reqView, setReqView] = useState<"message" | "schema">("message");
  return (
    <div className={PANEL}>
      <div className="flex min-h-[46px] flex-wrap items-center gap-2 border-b border-white/8 bg-code-chrome px-4 py-2">
        <span role="tablist" aria-label="Output" className="flex items-center gap-0.5 rounded-pill bg-white/7 p-0.5">
          {(["request", "response"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={side === x}
              onClick={() => setSide(x)}
              className={cn("rounded-pill px-3 py-1 text-[12px] font-semibold transition-colors", side === x ? "bg-page text-pine shadow-[0_1px_3px_rgb(0_0_0/0.25)]" : "text-code-ink/65 hover:text-code-ink")}
            >
              {x === "request" ? "Request" : "Response"}
            </button>
          ))}
        </span>
        {!showRequest && outcome ? (
          <>
            <StatusPill tone={toneOf(outcome)} label={statusOf(outcome)} />
            <span className="tnum inline-flex items-center gap-1 rounded-pill bg-white/6 px-2 py-0.5 text-[11px] text-code-ink/80">
              <Clock aria-hidden className="size-3" strokeWidth={2} />
              {fmtMs(outcome.latencyMs)}
            </span>
            <span className="tnum inline-flex items-center gap-1 rounded-pill bg-white/6 px-2 py-0.5 text-[11px] text-code-ink/80">
              <FileText aria-hidden className="size-3" strokeWidth={2} />
              {outcome.size}
            </span>
            <Segment
              options={[
                ["pretty", "Tree"],
                ["raw", "Raw JSON"],
                ["example", "Example"],
              ]}
              value={view}
              onChange={(v) => setView(v as RespView)}
            />
          </>
        ) : !showRequest && running ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-code-ink/60">
            <Loader2 aria-hidden className="size-3.5 animate-spin text-lime" strokeWidth={2.4} />
            {fmtMs(elapsed)}
          </span>
        ) : !showRequest ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-code-ink/55">
            <Sparkles aria-hidden className="size-3.5 text-lime" strokeWidth={2} />
            Example response
          </span>
        ) : (
          <Segment
            options={[
              ["message", "Message"],
              ["schema", "Schema"],
            ]}
            value={reqView}
            onChange={(v) => setReqView(v as "message" | "schema")}
          />
        )}
      </div>

      {!showRequest && outcome && view === "pretty" ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/6 px-3 py-1.5">
          <button type="button" onClick={() => setTree((t) => ({ depth: 99, v: t.v + 1 }))} className="rounded-pill px-2.5 py-1 text-[11.5px] text-code-ink/75 hover:bg-white/8 hover:text-code-ink">
            Expand all
          </button>
          <button type="button" onClick={() => setTree((t) => ({ depth: 1, v: t.v + 1 }))} className="rounded-pill px-2.5 py-1 text-[11.5px] text-code-ink/75 hover:bg-white/8 hover:text-code-ink">
            Collapse all
          </button>
          {recent.length > 1 ? (
            <span className="hidden items-center gap-1.5 pl-1 text-[11px] text-code-ink/50 2xl:flex">
              Earlier
              {recent.slice(1, 3).map((r) => (
                <span key={r.key} className="inline-flex items-center gap-1 rounded-pill bg-white/5 px-2 py-0.5 text-code-ink/70">
                  <span aria-hidden className={cn("size-1.5 rounded-pill", r.tone === "ok" ? "bg-lime" : r.tone === "warn" ? "bg-warn" : "bg-destructive")} />
                  {`${r.status}, ${r.latency}`}
                </span>
              ))}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5">
            <CopyButton value={JSON.stringify(outcome.payload, null, 2)} label="Copy" />
            <button type="button" onClick={onDownload} className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-white/12 px-2.5 text-[11.5px] font-medium text-code-ink hover:bg-white/8">
              <Download aria-hidden className="size-3.5" strokeWidth={1.9} />
              Download
            </button>
          </span>
        </div>
      ) : null}

      <div className={SCROLL}>
        {showRequest ? (
          reqView === "message" ? (
            <RequestView request={request} captured={captured} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 font-sans text-[11.5px] text-code-ink/55">Every header and field the API accepts: where it goes, its type, whether it is required, and its default.</p>
              <JsonTree value={reqSchema} openDepth={4} />
            </div>
          )
        ) : running ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="m-0 flex items-center gap-2 text-[12.5px] text-code-ink">
              <Loader2 aria-hidden className="size-4 animate-spin text-lime" strokeWidth={2.4} />
              Waiting for the response
            </p>
            {[72, 46, 88, 58, 34, 80, 52, 66].map((w, i) => (
              <span key={i} className="block h-3 rounded-[4px] bg-white/7 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : outcome ? (
          view === "raw" ? (
            <CodeLines code={raw} maxLines={4000} />
          ) : view === "example" ? (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 font-sans text-[11.5px] text-code-ink/55">An example response from a real read, for comparison with your live one.</p>
              <JsonTree value={example} openDepth={3} />
            </div>
          ) : (
            <JsonTree key={tree.v} value={outcome.payload} openDepth={tree.depth} foldWhen={isBoundingBox} />
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="m-0 font-sans text-[11.5px] text-code-ink/55">{`This is what comes back, from a real read. Press Send (or ${mod} + Enter) for a live response.`}</p>
            <JsonTree value={example} openDepth={4} />
          </div>
        )}
      </div>
    </div>
  );
}

function RequestView({ request, captured }: { request: FinRequest; captured: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-sans text-[11.5px] text-code-ink/55">{captured ? `Sent at ${request.at}.` : "The request you are building. Press Send to run it."}</p>
        {request.text ? <CopyButton value={request.text} label="Copy body" /> : null}
      </div>
      <div className="font-mono text-[12.5px] leading-[21px] selection:bg-lime/25">
        <div className="break-all">
          <span className="font-semibold text-json-key">{request.method}</span> <span className="text-code-ink">{request.path}</span> <span className="text-json-punct">HTTP/1.1</span>
        </div>
        {request.headers.map(([k, v]) => (
          <div key={k} className="break-all">
            <span className="text-json-number">{k}</span>
            <span className="text-json-punct">: </span>
            <span className="text-json-string">{v}</span>
          </div>
        ))}
        {request.text ? <div className="h-[21px]" aria-hidden /> : null}
        {request.text
          ? request.text.split("\n").map((line, i) => (
              <div key={i} className="whitespace-pre">
                <CodeLineText line={line} />
              </div>
            ))
          : null}
      </div>
    </div>
  );
}

function Segment({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <span className="ml-auto flex items-center gap-0.5 rounded-pill bg-white/5 p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn("rounded-pill px-3 py-1 text-[11.5px] font-medium transition-colors", value === id ? "bg-lime text-pine" : "text-code-ink/65 hover:text-code-ink")}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function CodePanel({ snippet, lang, setLang }: { snippet: string; lang: FinSnippetLang; setLang: (l: FinSnippetLang) => void }) {
  return (
    <div className={PANEL}>
      <div className="flex min-h-[46px] items-center gap-0.5 border-b border-white/8 bg-code-chrome pr-2 pl-2">
        <span className="mr-1 inline-flex items-center gap-1.5 px-2 text-[13px] font-medium text-code-ink">
          <Code2 aria-hidden className="size-4 text-code-ink/70" strokeWidth={1.9} />
          Code
        </span>
        {FIN_SNIPPET_LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLang(l.id)}
            aria-pressed={lang === l.id}
            className={cn("rounded-pill px-3 py-1 text-[11.5px] font-medium transition-colors", lang === l.id ? "bg-lime text-pine" : "text-code-ink/60 hover:text-code-ink")}
          >
            {l.label}
          </button>
        ))}
        <span className="ml-auto">
          <CopyButton value={snippet} />
        </span>
      </div>
      <div className="flex items-center gap-1.5 border-b border-white/6 px-4 py-1.5 text-[11.5px] text-code-ink/50">Updates as you edit the request</div>
      <div className={SCROLL}>
        <CodeLines code={snippet} />
      </div>
    </div>
  );
}

const PANEL = "flex h-[440px] min-w-0 flex-col overflow-hidden rounded-[16px] bg-code-bg shadow-[0_12px_32px_-16px_rgb(10_35_28/0.6)] ring-1 ring-black/10 xl:h-[560px]";
const SCROLL = "min-h-0 flex-1 overflow-auto px-4 py-3.5 [scrollbar-color:rgb(207_224_216/0.28)_transparent] [scrollbar-width:thin]";

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11.5px] font-semibold ring-1",
        tone === "ok" ? "bg-lime/15 text-lime ring-lime/25" : tone === "warn" ? "bg-warn/15 text-[#f3d26b] ring-warn/25" : "bg-destructive/20 text-[#ffb3ad] ring-destructive/30",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-pill", tone === "ok" ? "bg-lime" : tone === "warn" ? "bg-warn" : "bg-destructive")} />
      {label}
    </span>
  );
}
