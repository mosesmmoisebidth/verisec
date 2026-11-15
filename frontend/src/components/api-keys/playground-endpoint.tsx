"use client";

import { isBoundingBox } from "@/lib/finance/json-brief";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Braces, ChevronDown, Clock, Code2, Download, FileText, KeyRound, ListTree, Loader2, LockKeyhole, Play, RotateCcw, ScanFace, SlidersHorizontal, Sparkles, WrapText } from "lucide-react";

import { FaceOverlay } from "@/components/api-keys/face-overlay";
import { FieldCell, GalleryField, isCompact, isStructured, StructuredField } from "@/components/api-keys/playground-fields";
import { HowTo } from "@/components/api-keys/playground-howto";
import { CodeLines, CodeLineText, CopyButton, GroupTile, HeaderEditor, InlineCode, JsonEditor, JsonTree } from "@/components/api-keys/playground-parts";
import type { HeaderRow } from "@/components/api-keys/playground-parts";
import { CaptureTips, UploadZone, uploadKind } from "@/components/api-keys/playground-upload";
import { requestSchema } from "@/lib/console/playground-api";
import { DRAWABLE, faceDrawing } from "@/lib/console/face-geometry";
import type { FaceDrawing } from "@/lib/console/face-geometry";
import { buildBody, imageFiles, initialState, placeholderFor } from "@/lib/console/playground-body";
import type { FormState, ImageFor } from "@/lib/console/playground-body";
import { byteSize, encryptImage, runEndpoint } from "@/lib/console/playground-run";
import type { Param, PgEndpoint } from "@/lib/console/playground-run";
import { buildSnippet, prettyJson, PUBLIC_BASE, SNIPPET_LANGS } from "@/lib/console/playground-snippets";
import type { SnippetLang } from "@/lib/console/playground-snippets";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type KeyState = "loading" | "none" | "some";

export type Endpoint = PgEndpoint & { group: string };
export type RunRecord = { key: number; id: string; name: string; group: string; path: string; ok: boolean; tone: Tone; status: string; latency: string; at: string };

type Tone = "ok" | "warn" | "err";
/** `latencyMs` is the whole wait the operator saw; `apiMs` and `uploadMs` say where it went. */
type Outcome = { ok: boolean; http: number; latencyMs: number; apiMs?: number; uploadMs?: number; size: string; payload: unknown; warnings: string[] };
type SentRequest = { method: string; url: string; path: string; headers: [string, string][]; body: Record<string, unknown>; text: string; at: string | null };
type Tab = "params" | "body" | "headers" | "auth";
type RespView = "pretty" | "raw" | "example" | "image";

export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function toneOf(o: Outcome): Tone {
  if (o.ok) return "ok";
  return !o.http || o.http >= 400 ? "err" : "warn";
}

function statusOf(o: Outcome): string {
  if (!o.http) return "No connection";
  if (o.ok) return `${o.http} OK`;
  if (o.http === 400) return "400 Bad request";
  if (o.http === 401 || o.http === 403) return `${o.http} Not allowed`;
  if (o.http === 429) return "429 Too many requests";
  if (o.http >= 500) return `${o.http} Server error`;
  if (o.http >= 400) return `${o.http} Error`;
  return `${o.http} Not completed`;
}

function without(errs: Record<string, string>, key: string): Record<string, string> {
  const next = { ...errs };
  delete next[key];
  return next;
}

/** The `data` of an example response, so the Response panel can preview what you act on before a run. */
function exampleData(example: unknown): unknown {
  if (example && typeof example === "object" && "data" in (example as Record<string, unknown>)) return (example as Record<string, unknown>).data;
  return example ?? null;
}

/* ----------------------------------------------------------------------------
   The row in the endpoint list, and the console it opens
---------------------------------------------------------------------------- */

const TIER_BADGE: Record<string, { label: string; cls: string } | undefined> = {
  major: { label: "Major", cls: "bg-lime text-pine" },
  workflow: { label: "Workflow", cls: "bg-info-tint text-info" },
};

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
  keyId,
  keyState,
  price,
}: {
  ep: Endpoint;
  open: boolean;
  mounted: boolean;
  hidden: boolean;
  onToggle: () => void;
  onRun: (r: Omit<RunRecord, "key">) => void;
  recent: RunRecord[];
  apiKeyLabel: string;
  manageKeysHref: string;
  /** The key the runs are made with (none chosen yet: Send explains what is missing). */
  keyId: string | null;
  /** The organisation's active keys: still loading, none at all, or some. */
  keyState: KeyState;
  /** What one call costs, already in words ("0.20 credits", "up to 1.39 credits"). */
  price?: string;
}) {
  const tier = TIER_BADGE[ep.tier];
  return (
    <div id={`ep-${ep.id}`} className={cn("border-b border-rule last:border-0", hidden && "hidden")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn("relative flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors sm:px-5", open ? "bg-[image:var(--gradient-tab)]" : "hover:bg-hover-light")}
      >
        <GroupTile group={ep.group} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-medium text-pine">{ep.name}</span>
            {tier ? <span className={cn("rounded-pill px-1.5 py-px text-[10px] font-semibold", tier.cls)}>{tier.label}</span> : null}
            {ep.images.length ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-lime-tint px-2 py-px text-[10.5px] font-medium whitespace-nowrap text-ramp-2">
                <LockKeyhole aria-hidden className="size-3" strokeWidth={2} />
                Encrypted upload
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <span className="rounded-[6px] bg-info-tint px-1.5 py-px text-[10.5px] font-semibold tracking-[0.3px] text-info">{ep.method}</span>
            <code className="truncate font-mono text-[12px] text-slate">{ep.path}</code>
          </span>
        </span>
        {!open ? <span className="hidden max-w-[38ch] truncate text-[12.5px] text-slate xl:block">{ep.summary}</span> : null}
        {price ? <span className="tnum shrink-0 rounded-pill border border-edge bg-page px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-pine">{price}</span> : null}
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
          <EndpointConsole ep={ep} onRun={onRun} recent={recent} apiKeyLabel={apiKeyLabel} manageKeysHref={manageKeysHref} keyId={keyId} keyState={keyState} />
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The request console
---------------------------------------------------------------------------- */

function EndpointConsole({
  ep,
  onRun,
  recent,
  apiKeyLabel,
  manageKeysHref,
  keyId,
  keyState,
}: {
  ep: Endpoint;
  onRun: (r: Omit<RunRecord, "key">) => void;
  recent: RunRecord[];
  apiKeyLabel: string;
  manageKeysHref: string;
  keyId: string | null;
  keyState: KeyState;
}) {
  const [state, setState] = useState<FormState>(() => initialState(ep));
  const [customJson, setCustomJson] = useState<string | null>(null);
  const [headers, setHeaders] = useState<HeaderRow[]>([{ name: "X-Request-Id", value: "", on: false }]);
  const [tab, setTab] = useState<Tab>("params");
  const [lang, setLang] = useState<SnippetLang>("curl");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"encrypting" | "waiting">("waiting");
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [view, setView] = useState<RespView>("pretty");
  const [ranImages, setRanImages] = useState<File[]>([]);
  const [sent, setSent] = useState<SentRequest | null>(null);
  const [side, setSide] = useState<"request" | "response">("response");
  const [tree, setTree] = useState({ depth: 3, v: 0 });
  const [howto, setHowto] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  const uploads = useMemo(() => ep.params.filter((p) => p.kind === "image"), [ep.params]);
  const drawing = useMemo(() => (outcome?.ok ? faceDrawing(ep.id, outcome.payload) : null), [outcome, ep.id]);
  const lists = useMemo(() => ep.params.filter((p) => p.kind === "images"), [ep.params]);
  const compact = useMemo(() => ep.params.filter(isCompact), [ep.params]);
  const structured = useMemo(() => ep.params.filter(isStructured), [ep.params]);
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, [running]);

  // the request body for display and snippets (images shown as placeholders)
  const displayImg: ImageFor = useMemo(() => (field, file, { param }) => placeholderFor(param, file), []);
  const derived = useMemo(() => {
    try {
      return { body: buildBody(ep, state, displayImg), error: null as string | null };
    } catch (e) {
      return { body: {} as Record<string, unknown>, error: (e as Error).message };
    }
  }, [ep, state, displayImg]);
  const bodyText = customJson ?? prettyJson(derived.body, 100);
  const customError = useMemo(() => {
    if (customJson === null || !customJson.trim()) return null;
    try {
      const v = JSON.parse(customJson);
      return v && typeof v === "object" && !Array.isArray(v) ? null : "The body must be a JSON object.";
    } catch {
      return "This is not valid JSON. Check for a missing comma or quote.";
    }
  }, [customJson]);

  const displayBody = useMemo(() => {
    if (customJson !== null && !customError) {
      try {
        return JSON.parse(customJson) as Record<string, unknown>;
      } catch {
        /* shown in the editor */
      }
    }
    return derived.body;
  }, [customJson, customError, derived.body]);

  const snippet = useMemo(() => buildSnippet(lang, ep.path, displayBody, "YOUR_API_KEY"), [lang, ep.path, displayBody]);
  const reqSchema = useMemo(() => requestSchema(ep), [ep]);

  const raw = useMemo(() => {
    if (!outcome) return "";
    return prettyJson(outcome.payload)
      .split("\n")
      .map((l) => (l.length > 1600 ? `${l.slice(0, 1600)} … (${l.length - 1600} more characters)` : l))
      .join("\n");
  }, [outcome]);

  const requestFor = (body: Record<string, unknown>, at: string | null): SentRequest => {
    const hdrs: [string, string][] = [
      ["Host", PUBLIC_BASE.replace("https://", "")],
      ["Authorization", "Bearer YOUR_API_KEY"],
      ["Content-Type", "application/json"],
      ["Accept", "application/json"],
      ...headers.filter((h) => h.on && h.name.trim() && h.value.trim()).map((h) => [h.name.trim(), h.value.trim()] as [string, string]),
    ];
    return { method: ep.method, url: `${PUBLIC_BASE}${ep.path}`, path: ep.path, headers: hdrs, body, text: prettyJson(body), at };
  };
  const preview = useMemo(() => requestFor(displayBody, null), [displayBody, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (name: string, v: string | boolean) => {
    setState((s) => ({ ...s, values: { ...s.values, [name]: v } }));
    if (errors[name]) setErrors((e) => without(e, name));
  };
  const setFile = (name: string, f: File | null) => {
    setState((s) => ({ ...s, files: { ...s.files, [name]: f } }));
    if (errors[name]) setErrors((e) => without(e, name));
  };
  const setList = (name: string, items: FormState["lists"][string]) => {
    setState((s) => ({ ...s, lists: { ...s.lists, [name]: items } }));
    if (errors[name]) setErrors((e) => without(e, name));
  };

  const reset = () => {
    setState(initialState(ep));
    setCustomJson(null);
    setErrors({});
    setOutcome(null);
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (customJson !== null) return errs; // raw JSON mode: the API validates it
    for (const p of ep.params) {
      if (p.kind === "image") {
        if (p.required && !state.files[p.name]) errs[p.name] = `Add the ${p.label.toLowerCase()} to send this request.`;
      } else if (p.kind === "images" && p.list) {
        const n = (state.lists[p.name] ?? []).filter((it) => it.file).length;
        if ((p.required || n) && (n < p.list.min || n > p.list.max)) {
          errs[p.name] = `Add ${p.list.min === p.list.max ? p.list.min : `${p.list.min} to ${p.list.max}`} ${p.list.itemLabel}s (${n} so far).`;
        }
      } else if (p.required) {
        const v = state.values[p.name];
        if (v === undefined || v === "" || v === false) errs[p.name] = `${p.label} is required.`;
      }
    }
    return errs;
  };

  const send = async () => {
    if (running) return;
    // every run is made with an API key: say plainly what is missing (a disabled Send would just do nothing)
    if (!keyId) {
      if (keyState === "none") toast.warning("No active API keys", "Create a key in API Keys, then come back to run requests here.");
      else if (keyState === "loading") toast.info("Loading your API keys", "Try again in a moment.");
      else toast.warning("Choose an API key", "Pick the key to run with at the top of the Playground.");
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTab("params");
      return;
    }
    if (derived.error && customJson === null) return;
    if (customError) {
      setTab("body");
      return;
    }

    const started = performance.now();
    setSent(requestFor(displayBody, new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })));
    setSide("response");
    setRunning(true);
    setElapsed(0);
    setOutcome(null);
    const files = imageFiles(ep, state);
    setRanImages(files.map((f) => f.file));
    setPhase(files.length ? "encrypting" : "waiting");
    try {
      let body: Record<string, unknown>;
      if (customJson !== null) {
        body = customJson.trim() ? (JSON.parse(customJson) as Record<string, unknown>) : {};
      } else {
        const sealed: Record<string, string> = {};
        // every image is encrypted at once (a match pair, a gallery), not one after another
        await Promise.all(files.map(async ({ key, file }) => (sealed[key] = await encryptImage(file))));
        const sendImg: ImageFor = (field, _file, { index }) => sealed[index === undefined ? field : `${field}#${index}`];
        body = buildBody(ep, state, sendImg);
      }
      setPhase("waiting");
      const extra: Record<string, string> = {};
      for (const h of headers) if (h.on && h.name.trim() && h.value.trim()) extra[h.name.trim()] = h.value.trim();
      const r = await runEndpoint(ep.id, body, extra, keyId);
      const payload = r.ok ? r.data : (r.error ?? { message: "No response." });
      const o: Outcome = {
        ok: r.ok,
        http: r.httpStatus,
        latencyMs: performance.now() - started,
        apiMs: r.latency_ms || undefined,
        uploadMs: r.upload_ms,
        size: byteSize(payload),
        payload,
        warnings: r.warnings,
      };
      setOutcome(o);
      // the drawing stays on for the next run if it was on
      // Face Search opens straight on the marked photos (falls back to the result text when nothing could be drawn)
      setView((v) => (v === "image" || ep.id === "face.search" ? "image" : "pretty"));
      setTree((t) => ({ depth: 3, v: t.v + 1 }));
      onRun({ id: ep.id, name: ep.name, group: ep.group, path: ep.path, ok: o.ok, tone: toneOf(o), status: statusOf(o), latency: fmtMs(o.latencyMs), at: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
    } catch (e) {
      setOutcome({ ok: false, http: 0, latencyMs: performance.now() - started, size: "0 B", payload: { message: (e as Error).message }, warnings: [] });
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

  const enabledHeaders = headers.filter((h) => h.on && h.name.trim()).length + 1;
  const tabs: { id: Tab; label: string; icon: typeof Braces; badge?: string }[] = [
    { id: "params", label: "Parameters", icon: SlidersHorizontal, badge: String(ep.params.length) },
    { id: "body", label: "Body", icon: Braces, badge: customJson !== null ? "Custom" : undefined },
    { id: "headers", label: "Headers", icon: ListTree, badge: String(enabledHeaders) },
    { id: "auth", label: "Authorization", icon: KeyRound },
  ];

  /* the inputs, arranged by size */
  const cells = (list: Param[], cols: 1 | 2 | 3) => (
    <div className={cn("grid content-start gap-x-5 gap-y-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3")}>
      {list.map((p) => (
        <FieldCell key={p.name} param={p} value={state.values[p.name]} error={errors[p.name]} onChange={(v) => setValue(p.name, v)} />
      ))}
    </div>
  );
  // a single face upload is kept narrow so it reads as one slot, not a banner
  const narrowFace = ep.group === "Face" || ep.group === "Face workflows";
  const uploadGrid = (
    <div className={cn("grid gap-3", uploads.length > 1 && "sm:grid-cols-2")}>
      {uploads.map((p) => (
        <UploadZone key={p.name} param={p} kind={uploadKind(ep.group, p.name)} file={state.files[p.name] ?? null} error={errors[p.name]} onPick={(f) => setFile(p.name, f)} />
      ))}
    </div>
  );
  let top: React.ReactNode = null;
  if (uploads.length) {
    const one = uploads.length === 1;
    // Beside one upload the options sit two to a row, so a lone switch or tag never stretches across the page;
    // beside two uploads the column is narrow and holds one per row. An upload with no options gets capture tips
    // in that place instead of a drop area stretched across the full width.
    const side = compact.length ? cells(compact, one ? 2 : 1) : <CaptureTips kind={uploadKind(ep.group, uploads[0]?.name ?? "")} />;
    top = (
      <div className="grid gap-6 xl:grid-cols-12">
        <div className={one && narrowFace ? "xl:col-span-5" : one ? "xl:col-span-6" : "xl:col-span-7"}>{uploadGrid}</div>
        <div className={one && narrowFace ? "xl:col-span-7" : one ? "xl:col-span-6" : "xl:col-span-5"}>{side}</div>
      </div>
    );
  } else if (compact.length) {
    top = compact.length === 1 ? <div className="max-w-[560px]">{cells(compact, 1)}</div> : cells(compact, compact.length === 2 ? 2 : 3);
  }

  // pickers pair up two to a row (a pair shares one fixed height); an odd one out spans the row and fits its content
  const pairedAt = (i: number) => structured.length > 1 && !(structured.length % 2 === 1 && i === structured.length - 1);

  return (
    <div ref={rootRef} className="flex flex-col gap-4 border-t border-rule bg-page px-4 pt-4 pb-5 duration-200 motion-safe:animate-in motion-safe:fade-in sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-[75ch] text-[13.5px] leading-[21px] text-ink-muted">{ep.summary}</p>
        {ep.docs ? (
          <button
            type="button"
            onClick={() => setHowto(true)}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border border-pine/25 bg-lime-tint px-3.5 text-[12.5px] font-semibold text-pine shadow-[0_1px_2px_rgb(14_50_40/0.06)] transition-colors hover:bg-lime-wash"
          >
            <BookOpen aria-hidden className="size-4" strokeWidth={2} />
            How to use
          </button>
        ) : null}
      </div>

      {/* where it goes, and the one primary action */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-edge bg-page p-1.5 pl-2.5 shadow-[0_1px_2px_rgb(14_50_40/0.05)]">
        <span className="rounded-[8px] bg-info-tint px-2 py-1 text-[11.5px] font-semibold tracking-[0.3px] text-info">{ep.method}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-[12.5px] whitespace-nowrap">
          <span className="hidden text-slate sm:inline">{PUBLIC_BASE.replace("https://", "")}</span>
          {ep.path
            .split("/")
            .filter(Boolean)
            .map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-slate/50">/</span>
                <span className="text-pine">{seg}</span>
              </span>
            ))}
        </span>
        {customJson !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-caution-tint px-2.5 py-1 text-[11.5px] font-medium text-caution">
            <Braces aria-hidden className="size-3.5" strokeWidth={2} />
            Sending custom JSON
          </span>
        ) : null}
        <CopyButton tone="light" value={`${PUBLIC_BASE}${ep.path}`} label="Copy URL" />
        <button
          type="button"
          onClick={() => void send()}
          disabled={running}
          title={keyId ? undefined : keyState === "none" ? "No active API keys yet: create one in API Keys" : "Choose the API key to run with, at the top of the Playground"}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-lime pr-2.5 pl-4 text-[14px] font-semibold text-pine shadow-cta transition-[filter,transform] hover:brightness-95 active:translate-y-px disabled:cursor-wait disabled:opacity-75"
        >
          {running ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.4} /> : <Play aria-hidden className="size-4" strokeWidth={2} fill="currentColor" />}
          {running ? (phase === "encrypting" ? "Encrypting" : "Running") : "Send"}
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
              {top}
              {lists.map((p) => (
                <GalleryField key={p.name} param={p} kind={uploadKind(ep.group, p.name)} items={state.lists[p.name] ?? []} error={errors[p.name]} onChange={(items) => setList(p.name, items)} />
              ))}
              {structured.length ? (
                <div className={cn("grid gap-5", structured.length > 1 && "xl:grid-cols-2")}>
                  {structured.map((p, i) => (
                    <div key={p.name} className={cn("flex min-w-0 flex-col [&>*]:flex-1", structured.length > 1 && !pairedAt(i) && "xl:col-span-2")}>
                      <StructuredField param={p} value={state.values[p.name]} error={errors[p.name]} onChange={(v) => setValue(p.name, v)} paired={pairedAt(i)} />
                    </div>
                  ))}
                </div>
              ) : null}
              {!top && !lists.length && !structured.length ? <p className="m-0 text-[13px] text-slate">This endpoint takes no parameters.</p> : null}
            </div>
          ) : null}

          {tab === "body" ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-well px-2.5 py-1 text-[11.5px] text-slate">
                  Content type <span className="font-mono text-pine">application/json</span>
                </span>
                <span className={cn("rounded-pill px-2.5 py-1 text-[11.5px] font-medium", customJson !== null ? "bg-caution-tint text-caution" : "bg-lime-tint text-ramp-2")}>
                  {customJson !== null ? "Sending this JSON" : "Follows the parameters until you edit it"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (customJson === null || customError) return;
                      setCustomJson(prettyJson(JSON.parse(customJson)));
                    }}
                    disabled={customJson === null || !!customError}
                    className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <WrapText aria-hidden className="size-3.5" strokeWidth={1.9} />
                    Format
                  </button>
                  {customJson !== null ? (
                    <button type="button" onClick={() => setCustomJson(null)} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine hover:bg-hover-light">
                      <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.9} />
                      Use the parameters
                    </button>
                  ) : null}
                </span>
              </div>
              <JsonEditor value={bodyText} onChange={(v) => setCustomJson(v)} error={customError} />
              {customError ? <p role="alert" className="m-0 text-[12px] font-medium text-danger">{customError}</p> : null}
              {ep.images.length ? (
                <p className="m-0 flex items-center gap-1.5 text-[12px] text-slate">
                  <LockKeyhole aria-hidden className="size-3.5" strokeWidth={1.9} />
                  Images are added from the Parameters tab and encrypted in your browser when you send; the body shows them as placeholders.
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "headers" ? (
            <div className="flex max-w-[860px] flex-col gap-3">
              <HeaderEditor rows={headers} setRows={setHeaders} />
              <p className="m-0 text-[12px] text-slate">Checked headers are sent with the request. Content-Type is set for you.</p>
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
                Runs from this page are made as the key you picked, through the same gateway your servers call: its permissions, rate limit, IP allow-list, expiry and spend cap all apply, and each call uses your credits. The key&apos;s secret never leaves the console. In your own code, send the key as{" "}
                <InlineCode tone="light" text="`Authorization: Bearer YOUR_API_KEY`" />.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* the request as code and the response, side by side, the same height, each scrolling inside itself */}
      <div ref={responseRef} className="grid scroll-mt-4 gap-4 xl:grid-cols-2">
        <CodePanel snippet={snippet} lang={lang} setLang={setLang} />
        <Response
          outcome={outcome}
          running={running}
          phase={phase}
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
          drawable={DRAWABLE.has(ep.id)}
          drawing={drawing}
          drawFiles={ranImages}
        />
      </div>

      {howto && ep.docs ? (
        <HowTo name={ep.name} group={ep.group} method={ep.method} path={ep.path} tier={ep.tier} docs={ep.docs} params={ep.params} example={ep.example} onClose={() => setHowto(false)} />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The response (and the request message / schema)
---------------------------------------------------------------------------- */

function Response({
  outcome,
  running,
  phase,
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
  drawable,
  drawing,
  drawFiles,
}: {
  outcome: Outcome | null;
  running: boolean;
  phase: "encrypting" | "waiting";
  elapsed: number;
  mod: string;
  view: RespView;
  setView: (v: RespView) => void;
  tree: { depth: number; v: number };
  setTree: React.Dispatch<React.SetStateAction<{ depth: number; v: number }>>;
  raw: string;
  recent: RunRecord[];
  onDownload: () => void;
  request: SentRequest;
  captured: boolean;
  side: "request" | "response";
  setSide: (s: "request" | "response") => void;
  example: unknown;
  reqSchema: unknown;
  /** This endpoint's answers carry positions in the image (face boxes, landmarks). */
  drawable: boolean;
  drawing: FaceDrawing | null;
  drawFiles: File[];
}) {
  const showRequest = side === "request" && !running;
  const drawOn = view === "image" && !!drawing;
  const drawToggle = drawable ? (
    <button
      type="button"
      role="switch"
      aria-checked={drawOn}
      disabled={!drawing}
      title={drawing ? "Draw what the API found on the image you sent" : "Send a request with an image first: its result is drawn on that image"}
      onClick={() => setView(drawOn ? "pretty" : "image")}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-pill border px-2.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        drawOn ? "border-lime/50 bg-lime/15 text-lime" : "border-white/14 text-code-ink/80 hover:text-code-ink",
      )}
    >
      <ScanFace aria-hidden className="size-3.5" strokeWidth={2} />
      Draw on image
      <span aria-hidden className={cn("relative h-4 w-7 shrink-0 rounded-pill transition-colors", drawOn ? "bg-lime" : "bg-white/20")}>
        <span className={cn("absolute top-0.5 size-3 rounded-pill transition-[left]", drawOn ? "left-[14px] bg-pine" : "left-0.5 bg-page")} />
      </span>
    </button>
  ) : null;
  const [reqView, setReqView] = useState<"message" | "schema">("message");
  const example0 = exampleData(example);
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
            <span
              title={
                outcome.apiMs !== undefined
                  ? `Total ${fmtMs(outcome.latencyMs)}: API ${fmtMs(outcome.apiMs)}${outcome.uploadMs ? `, image upload ${fmtMs(outcome.uploadMs)}` : ""}`
                  : undefined
              }
              className="tnum inline-flex items-center gap-1 rounded-pill bg-white/6 px-2 py-0.5 text-[11px] text-code-ink/80"
            >
              <Clock aria-hidden className="size-3" strokeWidth={2} />
              {fmtMs(outcome.latencyMs)}
            </span>
            <span className="tnum inline-flex items-center gap-1 rounded-pill bg-white/6 px-2 py-0.5 text-[11px] text-code-ink/80">
              <FileText aria-hidden className="size-3" strokeWidth={2} />
              {outcome.size}
            </span>
            {drawToggle}
            <Segment
              options={[
                ["pretty", "Tree"],
                ["raw", "Raw JSON"],
                ...(example0 ? ([["example", "Example"]] as [RespView, string][]) : []),
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
          <>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-code-ink/55">
              <Sparkles aria-hidden className="size-3.5 text-lime" strokeWidth={2} />
              Example response
            </span>
            {drawToggle}
          </>
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

      {!showRequest && outcome && (view === "pretty" || (view === "image" && !drawing)) ? (
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

      {outcome && outcome.warnings.length && !showRequest ? (
        <div className="flex flex-col gap-1 border-b border-white/6 bg-warn/5 px-4 py-2">
          {outcome.warnings.slice(0, 4).map((w, i) => (
            <p key={i} className="m-0 text-[11.5px] leading-[16px] text-[#f3d26b]">{w}</p>
          ))}
        </div>
      ) : null}

      <div className={SCROLL}>
        {showRequest ? (
          reqView === "message" ? (
            <RequestView request={request} captured={captured} />
          ) : (
            <SchemaView value={reqSchema} note="Every field the API accepts, with its type, whether it is required, and its default." />
          )
        ) : running ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="m-0 flex items-center gap-2 text-[12.5px] text-code-ink">
              <Loader2 aria-hidden className="size-4 animate-spin text-lime" strokeWidth={2.4} />
              {phase === "encrypting" ? "Encrypting the images in your browser" : "Waiting for the response"}
            </p>
            {[72, 46, 88, 58, 34, 80, 52, 66].map((w, i) => (
              <span key={i} className="block h-3 rounded-[4px] bg-white/7 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : outcome ? (
          drawOn && drawing ? (
            <FaceOverlay drawing={drawing} files={drawFiles} />
          ) : view === "raw" ? (
            <CodeLines code={raw} maxLines={4000} />
          ) : view === "example" && example0 ? (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 font-sans text-[11.5px] text-code-ink/55">An example response, for comparison with your live one above.</p>
              <JsonTree value={example0} openDepth={3} />
            </div>
          ) : (
            <JsonTree key={tree.v} value={outcome.payload} openDepth={tree.depth} foldWhen={isBoundingBox} />
          )
        ) : example0 ? (
          <div className="flex flex-col gap-2.5">
            <p className="m-0 font-sans text-[11.5px] text-code-ink/55">{`This is what comes back. Press Send (or ${mod} + Enter) for a live response.`}</p>
            <JsonTree value={example0} openDepth={4} />
          </div>
        ) : (
          <p className="m-0 text-[12.5px] text-code-ink/60">{`Press Send (or ${mod} + Enter) to see the response here.`}</p>
        )}
      </div>
    </div>
  );
}

function RequestView({ request, captured }: { request: SentRequest; captured: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-sans text-[11.5px] text-code-ink/55">
          {captured ? `Sent at ${request.at}. Images are encrypted in your browser before upload.` : "The request you are building. Press Send to run it."}
        </p>
        <CopyButton value={request.text} label="Copy body" />
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
        <div className="h-[21px]" aria-hidden />
        {request.text.split("\n").map((line, i) => (
          <div key={i} className="whitespace-pre">
            <CodeLineText line={line} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemaView({ value, note }: { value: unknown; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-sans text-[11.5px] text-code-ink/55">{note}</p>
      <JsonTree key={JSON.stringify(value).length} value={value} openDepth={4} />
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

function CodePanel({ snippet, lang, setLang }: { snippet: string; lang: SnippetLang; setLang: (l: SnippetLang) => void }) {
  return (
    <div className={PANEL}>
      <div className="flex min-h-[46px] items-center gap-0.5 border-b border-white/8 bg-code-chrome pr-2 pl-2">
        <span className="mr-1 inline-flex items-center gap-1.5 px-2 text-[13px] font-medium text-code-ink">
          <Code2 aria-hidden className="size-4 text-code-ink/70" strokeWidth={1.9} />
          Code
        </span>
        {SNIPPET_LANGS.map((l) => (
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
