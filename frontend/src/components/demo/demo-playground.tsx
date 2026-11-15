"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Cake,
  Car,
  Check,
  Copy,
  CreditCard,
  FileText,
  Gift,
  ImageUp,
  Loader2,
  Lock,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanFace,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

import { BASE_URL } from "@/config/developers";
import { GridBackdrop } from "@/components/layout/grid-backdrop";
import { Panel } from "@/components/layout/container";
import { useHumanCheck } from "@/components/security/human-check";
import { ALPR_PAGE_SIZE, AlprOverlay, AlprResult, Pager } from "@/components/demo/alpr-result";
import { AlprAccessButton } from "@/components/alpr/alpr-access";
import { cn } from "@/lib/utils";
import {
  deviceRequestId,
  encryptImage,
  fetchDemoConfig,
  fetchQuota,
  loadPass,
  passUsable,
  runDemo,
  savePass,
  toEngineImage,
  sampleBlob,
  toDataUrl,
  type Curated,
  type DemoConfig,
  type DemoProduct,
  type DemoRefusal,
  type DemoRun,
  type Tone,
} from "@/lib/demo/client";

const MAX_BYTES = 10 * 1024 * 1024;

/** The demo's panel: a light lime that deepens toward the far corner (lime, white and pine only). */
const LIME_PANEL = "bg-[linear-gradient(160deg,#f6fde4_0%,#eefccd_45%,#dcf59c_100%)]";

const ICON: Record<string, typeof CreditCard> = {
  document: FileText,
  cheque: ReceiptText,
  card: CreditCard,
  alpr: Car,
  liveness: ScanFace,
  age: Cake,
  attributes: Sparkles,
  "face-match": UsersRound,
};

/** The same call from a customer's own server: the public endpoint and how the image travels. */
const SNIPPET: Record<string, { path: string; body: string }> = {
  document: { path: "/v1/idv/read", body: `-H "Content-Type: application/json" \\\n  -d '{"image_front": "<base64 image>"}'` },
  cheque: { path: "/v2/cheques/micr-line", body: `-F "image=@cheque.jpg"` },
  card: { path: "/v2/cards/read", body: `-F "image=@card.jpg"` },
  alpr: { path: "/v1/anpr/read", body: `-F "image=@car.jpg"` },
  liveness: { path: "/v1/liveness", body: `-H "Content-Type: application/json" \\\n  -d '{"image": "<base64 image>"}'` },
  age: { path: "/v1/face/age", body: `-H "Content-Type: application/json" \\\n  -d '{"image": "<base64 image>"}'` },
  attributes: { path: "/v1/face/attributes", body: `-H "Content-Type: application/json" \\\n  -d '{"image": "<base64 image>", "attributes": ["Age", "Emotion", "Smile"]}'` },
  "face-match": { path: "/v1/face/verify", body: `-H "Content-Type: application/json" \\\n  -d '{"image1": "<base64 image>", "image2": "<base64 image>"}'` },
};
const curlFor = (id: string) => {
  const s = SNIPPET[id];
  return s ? `curl -X POST ${BASE_URL}${s.path} \\\n  -H "Authorization: Bearer $VERISEC_API_KEY" \\\n  ${s.body}` : "";
};

type Picked = {
  blob: Blob;
  url: string;
  name: string;
  /** What happened to the file on the way in, e.g. "Converted from WEBP to JPG". */
  note?: string | null;
  /** A HEIC photo this browser cannot show: the server converts it and the preview arrives with the result. */
  pending?: boolean;
};

export function DemoPlayground() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const [image, setImage] = useState<Picked | null>(null);
  const [back, setBack] = useState<Picked | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DemoRun | null>(null);
  const [refusal, setRefusal] = useState<DemoRefusal | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // the visit pass: after one passed security check the server signs a 30-minute pass, so later runs skip the checks
  const [pass, setPass] = useState<string | null>(null);
  // ALPR / ANPR: the vehicle pointed at (on the photo or its card) and the page of cards shown
  const [alprHover, setAlprHover] = useState<number | null>(null);
  const [alprPage, setAlprPage] = useState(0);
  useEffect(() => {
    setAlprHover(null);
    setAlprPage(0);
  }, [result]);
  useEffect(() => setPass(loadPass()), []);
  const keepPass = useCallback((p: string | null) => {
    setPass(p);
    savePass(p);
  }, []);

  const human = useHumanCheck("demo");
  const product = useMemo(() => config?.products.find((p) => p.id === selectedId) ?? null, [config, selectedId]);

  useEffect(() => {
    let gone = false;
    fetchDemoConfig()
      .then(async (c) => {
        if (gone) return;
        setConfig(c);
        setSelectedId(c.products[0]?.id ?? null);
        try {
          const rid = await deviceRequestId(c.fingerprint);
          const q = await fetchQuota(rid);
          if (!gone) setRemaining(q.remaining);
        } catch {
          /* count fills in after the first run */
        }
      })
      .catch(() => !gone && setConfigError("The demo is unavailable right now. Please try again in a moment."));
    return () => {
      gone = true;
    };
  }, []);

  const drop = useCallback((setter: typeof setImage) => setter((p) => (p && URL.revokeObjectURL(p.url), null)), []);

  const pickProduct = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    drop(setImage);
    drop(setBack);
    setResult(null);
    setRefusal(null);
    setRunError(null);
  };

  const isAlpr = product?.id === "alpr";
  // the cheque and card readers take JPG, PNG and BMP only: other formats are converted, or refused when they cannot be
  const isFin = product?.id === "cheque" || product?.id === "card";
  const accept = useCallback(
    async (file: File, which: "main" | "back") => {
      setRunError(null);
      const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      // a HEIC file often arrives with no type at all (Windows): it still goes to the converter, which converts it
      // where the browser can and otherwise answers with the HEIC-specific message below
      if (!file.type.startsWith("image/") && !((isAlpr || isFin) && heic)) return setRunError("Please choose an image (JPG, PNG or similar).");
      if (file.size > MAX_BYTES) return setRunError("That image is over 10 MB. Please choose a smaller photo.");
      // a newer format is converted to JPEG the moment it is picked (JPEG, PNG and BMP stay as they are)
      const ready = isAlpr || isFin ? await toEngineImage(file) : { blob: file as Blob, name: file.name, note: null, pending: false };
      if (isFin && (ready.pending || !/^image\/(jpeg|png|bmp)$/i.test(ready.blob.type))) {
        const fmt = (file.type.split("/")[1] || file.name.split(".").pop() || "this").replace(/^x-/, "").toUpperCase();
        return setRunError(
          `${fmt} photos can't be read here and this browser can't convert it. Please upload a JPG, PNG or BMP${heic ? " (on an iPhone: Settings, Camera, Formats, Most Compatible)" : ""}.`,
        );
      }
      const picked: Picked = { blob: ready.blob, url: URL.createObjectURL(ready.blob), name: ready.name, note: ready.note, pending: ready.pending };
      (which === "main" ? setImage : setBack)((prev) => (prev && URL.revokeObjectURL(prev.url), picked));
      if (which === "main") {
        setResult(null);
        setRefusal(null);
      }
    },
    [isAlpr, isFin],
  );

  const useSample = useCallback(async (src: string, label: string) => {
    setRunError(null);
    try {
      const blob = await sampleBlob(src);
      setImage((prev) => (prev && URL.revokeObjectURL(prev.url), { blob, url: URL.createObjectURL(blob), name: label }));
      setResult(null);
      setRefusal(null);
    } catch {
      setRunError("Could not load the sample. Please upload your own image.");
    }
  }, []);

  const run = useCallback(async () => {
    if (!product || !image || running) return;
    const usePass = passUsable(pass);
    if (!usePass && human.enabled && !human.ready) return setRunError("Please complete the security check first.");
    setRunning(true);
    setResult(null);
    setRefusal(null);
    setRunError(null);
    try {
      // with a valid visit pass the run goes straight to the engine: no security check, no device check
      const fpRequestId = usePass ? null : await deviceRequestId(config?.fingerprint ?? null);
      const captchaToken = !usePass && human.enabled ? human.take() : undefined;
      const body: Record<string, unknown> = {};
      if (product.encrypted) {
        body.image = await encryptImage(image.blob);
        if (product.hasBack && back) body.imageBack = await encryptImage(back.blob);
      } else {
        body.image = await toDataUrl(image.blob);
      }
      const res = await runDemo(product.id, { fpRequestId, body, captchaToken, pass: usePass ? pass : undefined });
      if (res.pass) keepPass(res.pass);
      setResult(res);
      // a HEIC photo the browser could not show: use the JPEG the server converted it to, so the boxes can be drawn
      const preview = res.data?.alpr?.preview;
      if (preview) setImage((prev) => (prev && prev.pending ? { ...prev, url: preview, pending: false, note: "Converted from HEIC to JPG on our server" } : prev));
      setRemaining(res.remaining);
    } catch (e) {
      if (e && typeof e === "object" && "httpStatus" in e) {
        const ref = e as DemoRefusal;
        if (ref.pass) keepPass(ref.pass);
        else if (ref.code === "captcha_failed") keepPass(null);
        setRefusal(ref);
        if (typeof ref.remaining === "number") setRemaining(ref.remaining);
      } else {
        setRunError((e as Error)?.message ?? "The demo could not run. Please try again.");
      }
    } finally {
      setRunning(false);
    }
  }, [product, image, back, running, human, config, pass, keepPass]);

  if (configError || !config || !product) {
    return (
      <Panel className={LIME_PANEL}>
        <GridBackdrop tone="light" />
        <div className="relative grid min-h-[420px] place-items-center px-6 py-16 text-center">
          {configError ? <p className="max-w-md text-lg text-pine/80">{configError}</p> : <Loader2 aria-hidden className="size-8 animate-spin text-pine/50" />}
        </div>
      </Panel>
    );
  }

  const passOk = passUsable(pass);
  const outOfRuns = !product.unlimited && typeof remaining === "number" && remaining <= 0;
  const haveImages = !!image && (!product.pair || !!back);
  const canRun = haveImages && !running && !outOfRuns && (passOk || !(human.enabled && !human.ready));
  // the ALPR / ANPR boxes are drawn on the uploaded photo itself, never on a second copy of it
  const alpr = product.id === "alpr" && result?.ok && !running ? (result.data?.alpr ?? null) : null;
  const pickVehicle = (i: number) => {
    setAlprHover(i);
    setAlprPage(Math.floor(i / ALPR_PAGE_SIZE));
  };
  const Icon = ICON[product.id] ?? Sparkles;

  return (
    <Panel className={LIME_PANEL}>
      <GridBackdrop tone="light" />

      <div className="relative flex flex-col gap-7 px-5 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        {/* The checks, and the shared request budget */}
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Demo APIs" className="flex flex-wrap gap-2">
            {config.products.map((p) => {
              const PIcon = ICON[p.id] ?? Sparkles;
              const active = p.id === product.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pickProduct(p.id)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
                    active ? "border-pine bg-pine text-lime" : "border-pine/10 bg-white/70 text-pine hover:border-pine/25 hover:bg-white",
                  )}
                >
                  <PIcon aria-hidden className="size-[18px]" strokeWidth={1.9} />
                  {p.label}
                </button>
              );
            })}
          </div>
          {product.unlimited ? (
            <div className="flex w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto">
              <span className="inline-flex h-11 items-center gap-2 rounded-pill border border-pine/10 bg-white/70 px-4 text-[14px] text-pine/75">
                <span aria-hidden className="size-2 rounded-pill bg-ramp-3" />
                <span>
                  <b className="font-semibold text-pine">Unlimited</b> runs on {product.label}
                </span>
              </span>
              {/* the plate reader also ships as an offline SDK: the same request form as on the home and Solutions pages */}
              {product.id === "alpr" ? (
                <AlprAccessButton variant="pine" className="w-full sm:w-auto">
                  Contact us for the offline SDK
                </AlprAccessButton>
              ) : null}
            </div>
          ) : typeof remaining === "number" ? (
            <span className="tnum ml-auto inline-flex h-11 items-center gap-2 rounded-pill border border-pine/10 bg-white/70 px-4 text-[14px] text-pine/75">
              <span aria-hidden className={cn("size-2 rounded-pill", remaining > 0 ? "bg-ramp-3" : "bg-danger")} />
              <span>
                <b className="font-semibold text-pine">{remaining}</b> of {config.limit} free requests left
              </span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
          {/* Input */}
          <div className="flex flex-col gap-5 rounded-site-card bg-white/45 p-6 ring-1 ring-white/70 backdrop-blur-xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-pine text-lime">
                  <Icon aria-hidden className="size-[22px]" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="text-[22px] leading-tight font-semibold text-pine">{product.label}</h3>
                  <p className="mt-1 text-[15px] leading-snug text-pine/70">{product.blurb}</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-pine px-2.5 py-1 text-xs font-semibold text-lime">
                <span aria-hidden className="size-1.5 animate-pulse rounded-pill bg-lime" /> Live
              </span>
            </div>

            {product.pair ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-[14px] font-medium text-pine/70">First photo</span>
                  <Stage picked={image} onFile={(f) => accept(f, "main")} onClear={() => drop(setImage)} compact />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[14px] font-medium text-pine/70">Second photo</span>
                  <Stage picked={back} onFile={(f) => accept(f, "back")} onClear={() => drop(setBack)} compact />
                </div>
              </div>
            ) : (
              <>
                <Stage
                  picked={image}
                  onFile={(f) => accept(f, "main")}
                  onClear={() => drop(setImage)}
                  modern={isAlpr ? "alpr" : isFin ? "fin" : undefined}
                  tall={!!alpr}
                  overlay={alpr ? <AlprOverlay alpr={alpr} hover={alprHover} setHover={setAlprHover} onPick={pickVehicle} /> : null}
                />
                {product.samples.length || product.hasBack ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {product.samples.length ? <span className="text-[14px] font-medium text-pine/65">Try a sample</span> : null}
                    {product.samples.map((s) => (
                      <button
                        key={s.src}
                        type="button"
                        onClick={() => useSample(s.src, s.label)}
                        title={`Try: ${s.label}`}
                        className="h-14 w-[84px] overflow-hidden rounded-[12px] bg-white ring-1 ring-pine/15 transition hover:ring-2 hover:ring-pine focus-visible:ring-2 focus-visible:ring-pine focus-visible:outline-none"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.src} alt={s.label} className="size-full object-cover" />
                      </button>
                    ))}
                    {product.hasBack ? <BackChip picked={back} onFile={(f) => accept(f, "back")} onClear={() => drop(setBack)} /> : null}
                  </div>
                ) : null}
              </>
            )}

            <p className="flex items-start gap-2 text-[13.5px] leading-snug text-pine/60">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
              {product.encrypted
                ? product.pair
                  ? "Both photos are encrypted in your browser before they are sent."
                  : product.hasBack
                    ? "Encrypted in your browser before it is sent. Upload either side; the other side is optional."
                    : "Encrypted in your browser before it is sent."
                : "The photo is read and never stored."}
            </p>

            {human.enabled && !passOk ? <div>{human.widget}</div> : null}
            {runError ? <p role="alert" className="m-0 text-[14px] text-danger">{runError}</p> : null}

            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className={cn(
                "mt-auto inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-pill text-[17px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-pine/50 focus-visible:ring-offset-2",
                canRun ? "bg-pine text-lime hover:bg-pine/90" : "cursor-not-allowed bg-pine/10 text-pine/40",
              )}
            >
              {running ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
              {running ? "Reading your image" : outOfRuns ? "No free requests left" : `Run ${product.label}`}
              {!running && !outOfRuns ? <ArrowRight aria-hidden className="size-[19px]" /> : null}
            </button>
          </div>

          {/* Result */}
          <div className="flex min-h-[480px] min-w-0 flex-col rounded-site-card bg-white p-6 shadow-[0_24px_60px_-28px_rgba(14,50,40,0.35)] ring-1 ring-pine/5 sm:p-7">
            <ResultView
              product={product}
              running={running}
              result={result}
              refusal={refusal}
              imageUrl={image?.url ?? null}
              alprHover={alprHover}
              setAlprHover={setAlprHover}
              alprPage={alprPage}
              setAlprPage={setAlprPage}
            />
          </div>
        </div>

        {/* What signing up adds */}
        <div className="flex flex-col gap-5 rounded-site-card bg-pine p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-lime text-pine">
              <Gift aria-hidden className="size-6" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-[19px] leading-snug font-semibold text-white">See more data when you sign up</p>
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-white/70">
                This demo shows a short preview. Create a free account to see the full report for every check, use all our APIs, and start with{" "}
                <span className="font-semibold text-lime">5 free credits</span>.
              </p>
            </div>
          </div>
          <a
            href="/signup"
            className="inline-flex h-[50px] shrink-0 items-center justify-center gap-2.5 self-start rounded-pill bg-lime px-7 text-[17px] font-medium text-pine transition hover:brightness-95 lg:self-auto"
          >
            Create a free account <ArrowRight aria-hidden className="size-[19px]" />
          </a>
        </div>

        <p className="text-[13.5px] leading-relaxed text-pine/60">
          The demo gives {config.limit} free requests in total on this device, shared across every check. They are counted on our server, so a new network or a private window does not reset them. License plate (ALPR / ANPR) runs are unlimited and do not use them.
        </p>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- the image stage -- */

function Stage({
  picked,
  onFile,
  onClear,
  compact,
  tall,
  overlay,
  modern,
}: {
  picked: Picked | null;
  onFile: (f: File) => void;
  onClear: () => void;
  compact?: boolean;
  /** A larger photo, for a result drawn on it. */
  tall?: boolean;
  /** Drawn over the photo, in the photo's own coordinates (the ALPR / ANPR boxes). */
  overlay?: React.ReactNode;
  /** Newer formats are converted: "alpr" also takes HEIC (the server converts it); "fin" converts or refuses. */
  modern?: "alpr" | "fin";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // the shown picture's own size, tied to its URL (an instant data-URL preview must not race a reset)
  const [nat, setNat] = useState<{ url: string; w: number; h: number } | null>(null);


  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
  };
  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={modern === "alpr" ? "image/*,.heic,.heif,.avif,.webp" : "image/*"}
      className="sr-only"
      onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
    />
  );

  if (!picked) {
    return (
      <div
        {...dragProps}
        className={cn(
          "relative grid place-items-center rounded-[20px] border-2 border-dashed transition-colors",
          compact ? "h-[200px]" : "h-[260px]",
          over ? "border-pine bg-lime-tint" : "border-pine/20 bg-white hover:border-pine/40",
        )}
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[20px] px-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-inset"
        >
          <span className={cn("grid place-items-center rounded-[18px] bg-lime text-pine shadow-[0_14px_30px_-12px_rgba(140,190,40,0.8)]", compact ? "size-12" : "size-16")}>
            <ImageUp aria-hidden className={compact ? "size-6" : "size-8"} strokeWidth={1.8} />
          </span>
          <span className={cn("font-semibold text-pine", compact ? "text-[15px]" : "text-[18px]")}>Drop a photo here</span>
          <span className="text-[13px] text-pine/65">
            {compact
              ? "or click to choose"
              : modern === "alpr"
                ? "or click to choose a file. JPG, PNG, WEBP, AVIF, HEIC and more, up to 10 MB."
                : modern === "fin"
                  ? "or click to choose a file. JPG, PNG or BMP (WEBP, AVIF and others are converted), up to 10 MB."
                  : "or click to choose a file. JPG, PNG or WEBP, up to 10 MB."}
          </span>
        </button>
        {fileInput}
      </div>
    );
  }

  const ratio = picked && nat && nat.url === picked.url ? nat.w / nat.h : 3 / 2;
  return (
    <div {...dragProps} className="relative">
      <div
        className={cn("relative mx-auto overflow-hidden rounded-[20px] bg-white ring-1", over ? "ring-2 ring-pine" : "ring-pine/10")}
        style={{ aspectRatio: String(ratio), width: `min(100%, ${Math.round((compact ? 240 : tall ? 460 : 340) * ratio)}px)` }}
      >
        {picked.pending ? (
          // this browser cannot show a HEIC photo: a plain card until the server's converted preview arrives
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-lime-tint/60 px-6 text-center">
            <ImageUp aria-hidden className="size-8 text-pine/70" strokeWidth={1.7} />
            <span className="text-[15px] font-semibold text-pine">{picked.name}</span>
            <span className="max-w-[260px] text-[12.5px] leading-snug text-pine/65">
              Your browser cannot preview HEIC photos. Run it and we convert it to JPG, then draw the result on it.
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picked.url}
            alt={picked.name}
            onLoad={(e) => setNat({ url: picked.url, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute inset-0 size-full object-contain"
          />
        )}
        {overlay}
        <div className="absolute top-2.5 right-2.5 z-30 flex gap-1.5">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-pine/80 px-3 text-[12.5px] font-medium text-white backdrop-blur transition-colors hover:bg-pine focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          >
            <RefreshCw aria-hidden className="size-3.5" /> Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove image"
            className="grid size-8 place-items-center rounded-pill bg-pine/80 text-white backdrop-blur transition-colors hover:bg-pine focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      {picked.note && !picked.pending ? <p className="m-0 mt-2 text-center text-[12px] text-pine/60">{picked.note}</p> : null}
      {fileInput}
    </div>
  );
}

/** The optional other side of a document, as a small chip so it never dominates the layout. */
function BackChip({ picked, onFile, onClear }: { picked: Picked | null; onFile: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  if (picked) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-pill bg-white py-1 pr-2 pl-1.5 text-[14px] font-medium text-pine ring-1 ring-pine/15">
        <span className="size-8 overflow-hidden rounded-pill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={picked.url} alt="Other side" className="size-full object-cover" />
        </span>
        Other side added
        <button type="button" onClick={onClear} aria-label="Remove other side" className="grid size-6 place-items-center rounded-pill text-pine/55 hover:bg-well hover:text-pine">
          <X aria-hidden className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="inline-flex h-11 items-center gap-2 rounded-pill border border-dashed border-pine/30 bg-white/50 px-4 text-[14px] font-medium text-pine/80 transition-colors hover:border-pine hover:bg-white hover:text-pine"
      >
        <Plus aria-hidden className="size-4" strokeWidth={2.2} /> Add the other side
        <span className="text-pine/45">(optional)</span>
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </>
  );
}

/* ---------------------------------------------------------------- the result -- */

function ResultView({
  product,
  running,
  result,
  refusal,
  imageUrl,
  alprHover,
  setAlprHover,
  alprPage,
  setAlprPage,
}: {
  product: DemoProduct;
  running: boolean;
  result: DemoRun | null;
  refusal: DemoRefusal | null;
  /** The photo the result was read from (each ALPR / ANPR card shows its plate cut from it). */
  imageUrl: string | null;
  alprHover: number | null;
  setAlprHover: (i: number | null) => void;
  alprPage: number;
  setAlprPage: (p: number) => void;
}) {
  const [tab, setTab] = useState<"result" | "json">("result");
  const data = result?.ok ? result.data : null;
  const ok = !!data && !running && !refusal;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-slate">Live result</p>
          <p className="text-[17px] font-semibold text-pine">{product.label}</p>
        </div>
        {ok ? (
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-pill bg-well px-2.5 py-1 text-[12px] font-semibold text-slate sm:inline-flex">
              <span aria-hidden className="size-1.5 rounded-pill bg-ramp-3" />
              Read in {((result?.latency_ms ?? 0) / 1000).toFixed(1)}s
            </span>
            <div role="tablist" className="flex gap-1 rounded-pill bg-well p-1">
              {(["result", "json"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn("rounded-pill px-3.5 py-1 text-[13px] font-semibold transition-colors", tab === t ? "bg-pine text-white" : "text-slate hover:text-pine")}
                >
                  {t === "json" ? "JSON" : "Result"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {refusal ? (
        <Notice tone={refusal.code === "demo_limit" || refusal.httpStatus === 429 ? "warn" : "bad"} message={refusal.message} signup={refusal.code === "demo_limit" || refusal.httpStatus === 429} />
      ) : result && !result.ok && !running ? (
        <Notice tone="warn" message={result.error?.message ?? "Nothing could be read. Try a clearer, straight-on photo."} />
      ) : running ? (
        <RunningResult />
      ) : ok && data ? (
        tab === "result" ? (
          data.alpr ? (
            <div className="flex flex-col gap-4">
              <Headline data={data} />
              <AlprResult alpr={data.alpr} imageUrl={imageUrl} hover={alprHover} setHover={setAlprHover} page={alprPage} setPage={setAlprPage} />
            </div>
          ) : (
            <ResultBody data={data} />
          )
        ) : (
          <JsonBody data={data} page={alprPage} setPage={setAlprPage} />
        )
      ) : (
        <EmptyResult product={product} />
      )}

      <CodeBar id={product.id} />
    </div>
  );
}

/** The same call from your own server, kept to one slim row at the foot of the result card. */
function CodeBar({ id }: { id: string }) {
  const s = SNIPPET[id];
  if (!s) return null;
  return (
    <div className="mt-auto flex flex-col gap-2 pt-1">
      <p className="text-[13px] font-medium text-slate">Same call from your code</p>
      <div className="flex items-center gap-3 rounded-[14px] bg-pine py-2.5 pr-2.5 pl-4">
        <span className="shrink-0 rounded-[6px] bg-lime/15 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-lime">POST</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/85">{s.path}</code>
        <DarkCopy value={curlFor(id)} label="Copy curl" />
        <a href="/signup" className="hidden shrink-0 rounded-pill bg-lime px-3 py-1.5 text-[12.5px] font-medium text-pine hover:brightness-95 sm:inline-flex">
          Get an API key
        </a>
      </div>
    </div>
  );
}

/** A copy button for dark surfaces (the shared one is styled for light cards). */
function DarkCopy({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-white/15 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-lime" /> : <Copy aria-hidden className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}


function EmptyResult({ product }: { product: DemoProduct }) {
  const Icon = ICON[product.id] ?? Sparkles;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-[18px] bg-lime-tint text-pine">
        <Icon aria-hidden className="size-7" strokeWidth={1.7} />
      </span>
      <p className="m-0 text-[16px] font-semibold text-pine">Your live result appears here</p>
      <p className="m-0 max-w-[320px] text-[14px] leading-relaxed text-slate">
        {product.pair
          ? "Add two photos and run the compare. You get a match and a similarity score."
          : `Add an image and run ${product.label.toLowerCase()}. You get the fields it reads, each with its confidence.`}
      </p>
    </div>
  );
}

function RunningResult() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="relative grid size-14 place-items-center">
        <span className="absolute size-14 animate-ping rounded-pill bg-lime/40" />
        <span className="grid size-11 place-items-center rounded-pill bg-lime-tint text-pine">
          <Loader2 aria-hidden className="size-5 animate-spin" />
        </span>
      </span>
      <p className="m-0 text-[15px] font-semibold text-pine">Reading your image</p>
      <p className="m-0 text-[13.5px] text-slate">This takes a few seconds.</p>
    </div>
  );
}

const confTone = (c: number) => (c >= 80 ? "bg-pass-tint text-ramp-2" : c >= 50 ? "bg-caution-tint text-caution" : "bg-danger-tint text-danger");
const toneTile = (t?: Tone) => (t === "bad" ? "bg-danger-tint" : t === "warn" ? "bg-caution-tint" : "bg-lime-tint");
const toneText = (t?: Tone) => (t === "bad" ? "text-danger" : t === "warn" ? "text-caution" : "text-pine");

/** The few headline values of a result, as tiles. */
function Headline({ data }: { data: Curated }) {
  if (!data.headline.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {data.headline.map((h, i) => (
        <div key={i} className={cn("min-w-0 rounded-[16px] px-4 py-3", toneTile(h.tone))}>
          <div className="text-[12.5px] font-medium text-slate">{h.label}</div>
          <div className={cn("mt-0.5 line-clamp-2 text-[17px] leading-snug font-semibold break-words", toneText(h.tone))} title={h.value}>
            {h.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultBody({ data }: { data: Curated }) {
  return (
    <div className="flex flex-col gap-4">
      <Headline data={data} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {data.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.portrait} alt="Portrait found" className="h-32 w-auto shrink-0 self-start rounded-[14px] border border-edge object-cover" />
        ) : null}
        {data.fields.length ? (
          <dl className="m-0 min-w-0 flex-1 overflow-hidden rounded-[16px] border border-edge">
            {data.fields.map((f, i) => (
              <div key={`${f.label}-${i}`} className={cn("flex items-center gap-3 px-4 py-2.5", i ? "border-t border-rule" : "")}>
                <dt className="w-[38%] shrink-0 text-[13.5px] text-slate">{f.label}</dt>
                <dd className="m-0 min-w-0 flex-1 truncate text-[14.5px] font-medium text-pine" title={f.value}>
                  {f.value}
                </dd>
                <span className="flex shrink-0 items-center gap-1.5">
                  {f.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-pass-tint px-2 py-0.5 text-[11.5px] font-semibold text-ramp-2">
                      <Check aria-hidden className="size-3" strokeWidth={3} /> Verified
                    </span>
                  ) : null}
                  {typeof f.confidence === "number" ? (
                    <span className={cn("tnum rounded-pill px-2 py-0.5 text-[11.5px] font-semibold", confTone(f.confidence))}>{f.confidence}%</span>
                  ) : null}
                </span>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 text-[14px] text-slate">{data.status.label}.</p>
        )}
      </div>

      {data.locked.length ? <LockedFields names={data.locked} /> : null}
    </div>
  );
}

/** The further fields this check found, named but not shown until sign-up. */
function LockedFields({ names }: { names: string[] }) {
  const shown = names.slice(0, 10);
  return (
    <div className="rounded-[16px] border border-dashed border-pine/20 bg-lime-tint/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[14.5px] font-semibold text-pine">
          <Lock aria-hidden className="size-4" strokeWidth={2} /> {names.length} more field{names.length === 1 ? "" : "s"} detected
        </p>
        <a href="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-pine px-4 text-[13px] font-medium text-lime hover:bg-pine/90">
          Sign up to view more <ArrowRight aria-hidden className="size-3.5" />
        </a>
      </div>
      <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-x-5 gap-y-2 p-0 sm:grid-cols-2">
        {shown.map((n) => (
          <li key={n} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="flex min-w-0 items-center gap-1.5 text-pine/80">
              <Lock aria-hidden className="size-3.5 shrink-0 text-pine/45" strokeWidth={2} />
              <span className="truncate">{n}</span>
            </span>
            <span aria-hidden className="h-2.5 w-16 shrink-0 rounded-pill bg-pine/15 blur-[1.5px]" />
          </li>
        ))}
      </ul>
      {names.length > shown.length ? <p className="m-0 mt-2 text-[12.5px] text-slate">and {names.length - shown.length} more</p> : null}
    </div>
  );
}

function JsonBody({ data, page = 0, setPage }: { data: Curated; page?: number; setPage?: (p: number) => void }) {
  // the same clean answer the result shows; the portrait image is not printed inline.
  // ALPR / ANPR: one object per vehicle, its plate (with the plate's country) and the vehicle nested inside it.
  // The per-character confidences are shown on each card, not repeated here. Shown page by page; Copy takes all.
  const alpr = data.alpr;
  const vehiclesJson = alpr
    ? alpr.vehicles.map((v) => (v.plate ? { ...v, plate: Object.fromEntries(Object.entries(v.plate).filter(([k]) => k !== "characters")) } : v))
    : [];
  const full = alpr
    ? JSON.stringify({ status: data.status.label, ...alpr, preview: undefined, vehicles: vehiclesJson }, null, 2)
    : JSON.stringify({ ...data, portrait: data.portrait ? "[portrait image]" : undefined }, null, 2);
  const pages = alpr ? Math.max(1, Math.ceil(vehiclesJson.length / ALPR_PAGE_SIZE)) : 1;
  const current = Math.min(page, pages - 1);
  const shown =
    alpr && pages > 1
      ? JSON.stringify(
          { status: data.status.label, ...alpr, preview: undefined, vehicles: vehiclesJson.slice(current * ALPR_PAGE_SIZE, current * ALPR_PAGE_SIZE + ALPR_PAGE_SIZE) },
          null,
          2,
        )
      : full;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {alpr && setPage ? <Pager total={vehiclesJson.length} page={current} setPage={setPage} label="JSON pages" /> : null}
      <div className="relative min-h-0 flex-1">
        <pre className="max-h-[440px] overflow-auto rounded-[16px] bg-pine p-4 pr-24 font-mono text-[12px] leading-relaxed text-lime/90">{shown}</pre>
        <div className="absolute top-2.5 right-2.5">
          <DarkCopy value={full} label={pages > 1 ? "Copy all" : "Copy"} />
        </div>
      </div>
    </div>
  );
}

function Notice({ tone, message, signup }: { tone: "warn" | "bad"; message: string; signup?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className={cn("grid size-12 place-items-center rounded-pill", tone === "warn" ? "bg-caution-tint text-caution" : "bg-danger-tint text-danger")}>
        <Lock aria-hidden className="size-5" strokeWidth={1.8} />
      </span>
      <p className="m-0 max-w-sm text-[16px] font-medium text-pine">{message}</p>
      {signup ? (
        <a href="/signup" className="mt-1 inline-flex h-11 items-center gap-2 rounded-pill bg-pine px-5 text-[15px] font-medium text-lime hover:bg-pine/90">
          Create a free account <ArrowRight aria-hidden className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
