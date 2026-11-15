"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Clock, CreditCard, History, ImageUp, Play, Receipt, Trash2, UploadCloud, X } from "lucide-react";

import { ApiCode, ApiExchange } from "@/components/finance/api-exchange";
import { useWarmAllowed } from "@/components/finance/shell/deep-read-warmup";
import { ImageStage } from "@/components/finance/image-stage";
import type { StageRegion } from "@/components/finance/image-stage";
import { CreditsAction, GhostButton, Notice, PageHeader, ProductChip, Segmented, Spinner, StatePanel, StatusChip, TabStrip } from "@/components/finance/parts";
import { chequeView, ScanResult } from "@/components/finance/scan-result";
import { Select } from "@/components/ui/select";
import { FinApiError, finApi, serviceOf } from "@/lib/finance/api";
import type { FinService } from "@/lib/finance/api";
import { API_DOCS, modeOf } from "@/lib/finance/api-docs";
import { ACCESS, CREDITS, DETAIL, PLAYGROUND, SAMPLES } from "@/lib/finance/content";
import type { PlaygroundSample } from "@/lib/finance/content";
import { duration } from "@/lib/finance/format";
import type { ChequeDeepRead, FinProduct, ScanResponse } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Format = "auto" | "e13b" | "cmc7";
type Tab = "result" | "json" | "code";

interface Picked {
  blob: Blob;
  name: string;
  url: string;
  sample?: PlaygroundSample;
}

type RunState =
  | { kind: "idle" }
  | { kind: "running"; started: number }
  | { kind: "done"; result: ScanResponse | ChequeDeepRead; saved: boolean; imageUrl: string; wallMs?: number }
  | { kind: "error"; title: string; message: string; credits?: boolean };

interface Run {
  key: number;
  at: number;
  product: FinProduct;
  result: ScanResponse | ChequeDeepRead;
  saved: boolean;
  image: Picked;
}

const PRODUCT_OPTIONS = [
  { value: "cheque" as const, label: PLAYGROUND.products[0].label, icon: Receipt },
  { value: "card" as const, label: PLAYGROUND.products[1].label, icon: CreditCard },
];

export function FinPlayground() {
  const [product, setProduct] = useState<FinProduct>("cheque");
  const [format, setFormat] = useState<Format>("auto");
  const [deep, setDeep] = useState(true); // deep read (MICR + vision + bank) is the default
  const [picked, setPicked] = useState<Picked | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [tab, setTab] = useState<Tab>("result");
  const [pickError, setPickError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  // The cheque picked when the photo holds several (its MICR line is marked on the image).
  const [chequeNo, setChequeNo] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [health, setHealth] = useState<Record<FinService, "checking" | "up" | "down">>({ micr: "checking", card: "checking" });

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const runKey = useRef(0);
  // One read at a time. Set synchronously, so a double-click (or Read pressed while a
  // sample is still downloading) can't start a second, separately charged read before
  // the "running" state has rendered and disabled the controls.
  const inFlight = useRef(false);
  const keepUrls = useRef(new Set<string>());

  const service = serviceOf(product);
  const productCopy = PLAYGROUND.products.find((p) => p.id === product) ?? PLAYGROUND.products[0];

  /* ---- deep read: wake the model before the user runs a read --------------- */
  // The deep-read model sleeps when unused and takes several seconds to wake. The
  // portal shell pings it on entry; here it is pinged again whenever a deep read
  // becomes likely (cheque playground opened, deep read switched on, file picked),
  // and kept awake while the user is actively here with deep read on. It goes back
  // to sleep ~90s after the last ping or read, so an idle tab costs nothing.
  const mayWarm = useWarmAllowed();
  const warmDeep = useCallback(() => {
    if (mayWarm) void finApi.warmChequeDeep();
  }, [mayWarm]);

  useEffect(() => {
    if (product === "cheque") warmDeep();
  }, [deep, product, warmDeep]);

  useEffect(() => {
    if (!(deep && product === "cheque" && mayWarm)) return;
    let lastActive = Date.now();
    const onActive = () => {
      lastActive = Date.now();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActive, { passive: true }));
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActive < 120_000) void finApi.warmChequeDeep(50_000);
    }, 60_000);
    return () => {
      window.clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, onActive));
    };
  }, [deep, product, mayWarm]);

  /* ---- service health, so the toolbar can say online / offline ---------- */
  useEffect(() => {
    let alive = true;
    (["micr", "card"] as const).forEach((s) => {
      finApi
        .health(s)
        .then((h) => alive && setHealth((prev) => ({ ...prev, [s]: h.engine === "ready" ? "up" : "down" })))
        .catch(() => alive && setHealth((prev) => ({ ...prev, [s]: "down" })));
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ---- image selection ---------------------------------------------------- */
  const replacePicked = useCallback((next: Picked | null) => {
    setPicked((prev) => {
      if (prev && !keepUrls.current.has(prev.url)) URL.revokeObjectURL(prev.url);
      return next;
    });
    setRun({ kind: "idle" });
    setTab("result");
  }, []);

  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      setPickError(null);
      if (!file) return;
      if (!(PLAYGROUND.accepted as readonly string[]).includes(file.type)) {
        setPickError(PLAYGROUND.errors.wrongType);
        return;
      }
      if (file.size > PLAYGROUND.maxBytes) {
        setPickError(PLAYGROUND.errors.tooLarge);
        return;
      }
      if (deep && product === "cheque") warmDeep();
      replacePicked({ blob: file, name: file.name || "image.jpg", url: URL.createObjectURL(file) });
    },
    [replacePicked, deep, product, warmDeep],
  );

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) acceptFile(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFile]);

  /* ---- running a read ----------------------------------------------------- */
  const runRead = useCallback(
    async (image: Picked, forProduct: FinProduct) => {
      setRun({ kind: "running", started: Date.now() });
      setTab("result");
      let result: ScanResponse | ChequeDeepRead | null = null;
      let saved = false;
      const t0 = performance.now();
      try {
        result =
          forProduct === "cheque"
            ? deep
              ? await finApi.readChequeDeep(image.blob, image.name, { format, source: "playground" })
              : await finApi.readCheque(image.blob, image.name, { format, source: "playground" })
            : await finApi.readCard(image.blob, image.name, { source: "playground" });
      } catch (err) {
        const e = err instanceof FinApiError ? err : null;
        if (e?.kind === "offline" && image.sample) {
          result = image.sample.saved;
          saved = true;
          setHealth((prev) => ({ ...prev, [serviceOf(forProduct)]: "down" }));
        } else if (e?.kind === "offline") {
          setHealth((prev) => ({ ...prev, [serviceOf(forProduct)]: "down" }));
          setRun({ kind: "error", title: PLAYGROUND.offlineTitle, message: PLAYGROUND.offlineBody });
          return;
        } else if (e?.code === ACCESS.code) {
          setRun({ kind: "error", title: ACCESS.title, message: e.message || ACCESS.body });
          return;
        } else if (e?.code === CREDITS.code) {
          setRun({ kind: "error", title: CREDITS.title, message: CREDITS.body, credits: true });
          return;
        } else {
          setRun({ kind: "error", title: PLAYGROUND.failedTitle, message: e?.message ?? String(err) });
          return;
        }
      }
      if (!result) return;
      const wallMs = saved ? undefined : Math.round(performance.now() - t0);
      keepUrls.current.add(image.url);
      setRun({ kind: "done", result, saved, imageUrl: image.url, wallMs });
      setChequeNo(0);
      runKey.current += 1;
      const key = runKey.current;
      setHistory((prev) => [{ key, at: Date.now(), product: forProduct, result: result as ScanResponse | ChequeDeepRead, saved, image }, ...prev].slice(0, 30));
    },
    [format, deep],
  );

  const execute = useCallback(
    async (image: Picked, forProduct: FinProduct) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await runRead(image, forProduct);
      } finally {
        inFlight.current = false;
      }
    },
    [runRead],
  );

  const pickSample = useCallback(
    async (sample: PlaygroundSample) => {
      if (inFlight.current) return;
      setPickError(null);
      try {
        const res = await fetch(sample.image);
        const blob = await res.blob();
        if (inFlight.current) return; // a read started while the sample downloaded
        const next: Picked = { blob, name: sample.image.split("/").pop() ?? "sample.jpg", url: URL.createObjectURL(blob), sample };
        replacePicked(next);
        void execute(next, sample.product);
      } catch {
        setPickError(PLAYGROUND.errors.wrongType);
      }
    },
    [execute, replacePicked],
  );

  const switchProduct = (next: FinProduct) => {
    if (next === product) return;
    setProduct(next);
    replacePicked(null);
    setPickError(null);
  };

  const restore = (r: Run) => {
    setProduct(r.product);
    setPicked(r.image);
    setRun({ kind: "done", result: r.result, saved: r.saved, imageUrl: r.image.url });
    setChequeNo(0);
    setTab("result");
    setHistoryOpen(false);
  };

  const done = run.kind === "done" ? run : null;
  // The call being tried right now: cheque MICR, cheque deep read, or card.
  const mode = modeOf(product, deep);
  const showsCurrent = done && picked && done.imageUrl === picked.url;
  // A deep read as seen for the picked cheque (the whole read when the photo has one).
  const deepView =
    showsCurrent && done.result.object === "cheque_read" ? chequeView(done.result, done.result.cheques?.[chequeNo]) : null;
  const box = showsCurrent
    ? done.result.object === "cheque"
      ? done.result.micr?.box
      : done.result.object === "card"
        ? done.result.card?.box
        : deepView?.micr.micr?.box // cheque_read: the picked cheque's MICR line
    : null;
  // Every text box found during the deep read (it came in the same response), in the
  // image's pixel space. Drawing only: every word on screen comes from the read.
  const shownDeep = showsCurrent && done.result.object === "cheque_read" ? done.result : null;
  const textBoxes = shownDeep?.text_boxes;
  const regions: StageRegion[] | undefined =
    shownDeep && textBoxes?.width
      ? textBoxes.boxes.map((b) => ({
          box: b.box.map((v) => (v * shownDeep.image.width) / textBoxes.width),
          confidence: b.score,
        }))
      : undefined;
  // The MICR line's label: the engine's own text and confidence (0 to 100).
  const micrLine = showsCurrent
    ? done.result.object === "cheque"
      ? done.result.micr
      : (deepView?.micr.micr ?? null)
    : null;

  return (
    <>
      <PageHeader
        title={PLAYGROUND.title}
        subtitle={PLAYGROUND.subtitle}
        actions={
          <GhostButton icon={History} onClick={() => setHistoryOpen(true)}>
            {PLAYGROUND.historyLabel}
            {history.length ? <span className="tnum rounded-pill bg-well px-1.5 text-[11px]">{history.length}</span> : null}
          </GhostButton>
        }
      />

      <section className="flex flex-col gap-4 rounded-shell border border-hairline bg-panel p-4 sm:p-5">
        {/* toolbar ---------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Product" options={PRODUCT_OPTIONS} value={product} onChange={switchProduct} size="lg" />
          <span className="inline-flex h-9 items-center gap-2 rounded-pill bg-page px-3">
            <span className="rounded-well bg-[#ede9fe] px-2 py-0.5 text-[11px] font-semibold tracking-[0.3px] text-[#6d3bdb]">POST</span>
            <span className="font-mono text-[12.5px] text-pine">{API_DOCS[modeOf(product, deep)].path}</span>
          </span>
          <ServiceDot state={health[service]} label={service === "micr" ? "MICR API" : "Card API"} />
          {product === "cheque" ? (
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-micro text-slate">
                <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="size-3.5 accent-pine" />
                {PLAYGROUND.deepLabel}
              </label>
              <span className="text-micro text-slate">{PLAYGROUND.formatLabel}</span>
              <Select
                id="fin-format"
                label={PLAYGROUND.formatLabel}
                options={PLAYGROUND.formats.map((f) => f.label)}
                value={PLAYGROUND.formats.find((f) => f.value === format)?.label}
                onValueChange={(label) => setFormat(PLAYGROUND.formats.find((f) => f.label === label)?.value ?? "auto")}
                className="h-9 rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-micro text-pine"
                menuAlign="end"
              />
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {/* image ---------------------------------------------------------- */}
          <div className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-hairline bg-page p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">{PLAYGROUND.imageTitle}</h2>
              {picked ? (
                <div className="flex items-center gap-1.5">
                  <GhostButton icon={ImageUp} className="h-8" onClick={() => fileRef.current?.click()}>
                    {PLAYGROUND.drop.browse}
                  </GhostButton>
                  <GhostButton icon={Trash2} className="h-8" onClick={() => replacePicked(null)} aria-label={PLAYGROUND.drop.clear}>
                    {PLAYGROUND.drop.clear}
                  </GhostButton>
                </div>
              ) : null}
            </div>

            {picked ? (
              <ImageStage
                src={picked.url}
                alt={picked.sample?.label ?? picked.name}
                size={showsCurrent ? done.result.image : null}
                box={box}
                boxLabel={product === "cheque" ? (micrLine?.printed ?? PLAYGROUND.micrBoxLabel) : undefined}
                boxConfidence={micrLine?.confidence != null ? micrLine.confidence / 100 : undefined}
                regions={regions}
                showBoxLabel={PLAYGROUND.showBox}
                missingLabel={DETAIL.imageMissing}
              />
            ) : (
              // A drop target only: keyboard and screen-reader users get the
              // Browse and Use camera buttons inside it, which do the same thing.
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  acceptFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-[16px] border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging ? "border-lime bg-lime/10" : "border-[#d9e7b8] bg-[#fbfdf6]",
                )}
              >
                <span className="grid size-12 place-items-center rounded-pill bg-lime/40 text-pine">
                  <UploadCloud aria-hidden className="size-6" strokeWidth={1.7} />
                </span>
                <p className="m-0 text-section font-medium text-pine">{PLAYGROUND.drop.title}</p>
                <p className="m-0 max-w-[40ch] text-micro text-slate">{PLAYGROUND.drop.body}</p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex h-9 items-center gap-2 rounded-pill bg-pine px-4 text-micro font-medium text-lime transition-[filter] hover:brightness-110"
                  >
                    <ImageUp aria-hidden className="size-4" strokeWidth={1.8} />
                    {PLAYGROUND.drop.browse}
                  </button>
                  <GhostButton icon={Camera} className="h-9" onClick={() => cameraRef.current?.click()}>
                    {PLAYGROUND.drop.camera}
                  </GhostButton>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept={PLAYGROUND.accepted.join(",")}
              className="hidden"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {pickError ? <Notice tone="error">{pickError}</Notice> : null}

            <button
              type="button"
              disabled={!picked || run.kind === "running"}
              onClick={() => picked && void execute(picked, product)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-lime text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
            >
              {run.kind === "running" ? <Spinner /> : <Play aria-hidden className="size-4" strokeWidth={2} />}
              {run.kind === "running" ? PLAYGROUND.running : productCopy.runLabel}
            </button>

            <div className="flex flex-col gap-2.5 border-t border-rule pt-4">
              <p className="m-0 text-eyebrow font-medium tracking-[0.6px] text-slate uppercase">{PLAYGROUND.drop.samples}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {SAMPLES.filter((s) => s.product === product).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={run.kind === "running"}
                    onClick={() => void pickSample(s)}
                    className={cn(
                      "group flex min-w-0 flex-col overflow-hidden rounded-[12px] border bg-page text-left transition-colors disabled:cursor-wait",
                      picked?.sample?.id === s.id ? "border-lime ring-2 ring-lime/40" : "border-hairline hover:border-pine/25",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local sample thumbnail */}
                    <img src={s.image} alt="" className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    <span className="flex flex-col gap-0.5 px-2.5 py-2">
                      <span className="truncate text-micro font-medium text-pine">{s.label}</span>
                      <span className="truncate text-[11px] text-slate">{s.caption}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* result --------------------------------------------------------- */}
          <div className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-hairline bg-page p-4">
            <TabStrip
              label="Result views"
              tabs={[
                { id: "result" as const, label: PLAYGROUND.tabs.result },
                { id: "json" as const, label: PLAYGROUND.tabs.json },
                { id: "code" as const, label: PLAYGROUND.tabs.code },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === "result" ? <ResultPane run={run} cheque={chequeNo} onChequeChange={setChequeNo} /> : null}

            {tab === "json" ? (
              <ApiExchange
                key={mode}
                mode={mode}
                format={format}
                file={
                  picked
                    ? { name: picked.name, type: picked.blob.type || "image/jpeg", size: picked.blob.size }
                    : { name: product === "card" ? "card.jpg" : "cheque.jpg", type: "image/jpeg", size: null }
                }
                live={done && modeOf(done.result.object === "card" ? "card" : "cheque", done.result.object === "cheque_read") === mode ? done.result : null}
              />
            ) : null}

            {tab === "code" ? <ApiCode mode={mode} /> : null}
          </div>
        </div>
      </section>

      <HistoryDrawer open={historyOpen} runs={history} onClose={() => setHistoryOpen(false)} onPick={restore} />
    </>
  );
}

/* ----------------------------------------------------------------------------
   Result pane
---------------------------------------------------------------------------- */

function ResultPane({
  run,
  cheque,
  onChequeChange,
}: {
  run: RunState;
  cheque: number;
  onChequeChange: (index: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.kind !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run.kind]);

  if (run.kind === "idle") return <StatePanel icon={Play} title={PLAYGROUND.emptyTitle} body={PLAYGROUND.emptyBody} />;

  if (run.kind === "running") {
    const s = Math.max(0, (now - run.started) / 1000);
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-shell border border-hairline bg-panel px-6 py-16 text-center">
        <Spinner className="size-7 border-[3px]" />
        <p className="m-0 text-section font-medium text-pine">{PLAYGROUND.running}</p>
        <p className="m-0 text-micro text-slate">
          {PLAYGROUND.runningHint} <span className="tnum">{s.toFixed(1)} s</span>
        </p>
      </div>
    );
  }

  if (run.kind === "error") {
    return (
      <Notice tone={run.credits ? "warning" : "error"} title={run.title} action={run.credits ? <CreditsAction /> : undefined}>
        {run.message}
      </Notice>
    );
  }

  const serverMs = run.result.object === "cheque_read" ? run.result.timing?.total_ms : undefined;
  return (
    <div className="flex flex-col gap-3">
      {run.saved ? <Notice tone="info">{PLAYGROUND.savedNote}</Notice> : null}
      {run.result.object === "cheque_read" && run.wallMs !== undefined ? (
        <p className="tnum m-0 inline-flex items-center gap-1.5 text-micro text-slate">
          <Clock aria-hidden className="size-3.5" strokeWidth={1.8} />
          {PLAYGROUND.wallLabel}{" "}
          <span className="font-medium text-pine">{(run.wallMs / 1000).toFixed(2)} s</span>
          {serverMs !== undefined ? (
            <span>
              ({PLAYGROUND.serverLabel} {(serverMs / 1000).toFixed(2)} s)
            </span>
          ) : null}
        </p>
      ) : null}
      <ScanResult result={run.result} cheque={cheque} onChequeChange={onChequeChange} />
    </div>
  );
}

function ServiceDot({ state, label }: { state: "checking" | "up" | "down"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-micro text-slate">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          state === "up" ? "bg-[#6fb801] shadow-[0_0_0_3px_rgba(111,184,1,.15)]" : state === "down" ? "bg-danger" : "bg-icon-soft",
        )}
      />
      {label} {state === "up" ? "online" : state === "down" ? "offline" : ""}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Run history, the console's floating drawer
---------------------------------------------------------------------------- */

function HistoryDrawer({
  open,
  runs,
  onClose,
  onPick,
}: {
  open: boolean;
  runs: Run[];
  onClose: () => void;
  onPick: (r: Run) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label={PLAYGROUND.history.close}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-pine/10 backdrop-blur-md duration-200 animate-in fade-in"
      />
      <aside
        role="dialog"
        aria-label={PLAYGROUND.history.title}
        className="absolute top-5 right-5 bottom-5 flex w-[calc(100%-2.5rem)] max-w-[440px] flex-col overflow-hidden rounded-[24px] border border-hairline bg-page shadow-[0_28px_70px_-16px_rgba(14,50,40,0.45)] duration-200 animate-in slide-in-from-right-4 fade-in"
      >
        <div className="flex items-center justify-between gap-4 border-b border-edge px-6 py-5">
          <h2 className="m-0 text-[20px] font-medium tracking-[-0.3px] text-pine">{PLAYGROUND.history.title}</h2>
          <button
            type="button"
            aria-label={PLAYGROUND.history.close}
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-pine/60 transition-colors hover:bg-hover-light hover:text-pine"
          >
            <X aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5 overflow-y-auto p-6">
          {runs.length === 0 ? (
            <p className="m-0 py-10 text-center text-body text-slate">{PLAYGROUND.history.empty}</p>
          ) : (
            runs.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onPick(r)}
                className="flex items-center gap-3 rounded-[14px] border border-hairline bg-panel p-2.5 text-left transition-colors hover:border-pine/20 hover:bg-hover-light"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img src={r.image.url} alt="" className="size-12 shrink-0 rounded-[10px] object-cover" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <ProductChip product={r.product} />
                    <StatusChip status={r.result.status} />
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-slate">{r.result.id}</span>
                </span>
                <span className="tnum flex shrink-0 flex-col items-end gap-1 text-micro text-slate">
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="size-3.5" strokeWidth={1.8} />
                    {duration(r.result.processing_ms)}
                  </span>
                  <span>{new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
