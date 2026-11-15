"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, FileText, Loader2, RotateCcw, Upload, X } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import { SampleDialog } from "@/components/verify/sample-dialog";
import { StatusPill } from "@/components/verify/findings-step";
import { CountrySelect } from "@/components/ui/country-select";
import type { Country } from "@/lib/countries";
import type { ScreenContext } from "@/lib/verify/types";
import { readFlow, writeFlow } from "@/lib/verify/flow-store";
import { encryptDocument } from "@/lib/verify/document-crypto";
import { kycApi, type PoaAddress, type PoaResult } from "@/lib/verify/kyc-api";
import { cn } from "@/lib/utils";

/*
 * Proof of Address, wired to the Console API:
 *
 *   address-upload   upload a bill / statement / certificate (PDF or photo) and, optionally,
 *                    type the address. The document is read and checked against the name on
 *                    the ID and the typed address; a document that cannot be used is explained
 *                    here so the applicant can upload another.
 *   address-confirm  the address read from the document (or the typed one), editable, with
 *                    what we checked beside it. Edits against the document are recorded.
 */

const MAX_MB = 10;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const INPUT =
  "h-11 w-full rounded-well border border-divider bg-white px-3.5 text-field text-pine outline-none transition-colors placeholder:text-pine/47 focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/28";

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-2 rounded-well bg-caution-tint/60 px-3.5 py-3 text-body text-caution">
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
      <span>{children}</span>
    </p>
  );
}

/**
 * Big phone photos are scaled down before upload (long side 2800px, JPEG). Small files and
 * PDFs go as they are: re-encoding a clean digital page would blur the traces the checks look for.
 * Returns the raw bytes; they are encrypted in the browser before anything is sent.
 */
async function prepare(file: File): Promise<{ bytes: Uint8Array; mime: string }> {
  const raw = async () => ({ bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type });
  if (file.type === "application/pdf" || file.size <= 3.5 * 1024 * 1024) return raw();
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return raw();
  const scale = Math.min(1, 2800 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
  if (!blob) return raw();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg" };
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What we checked, as tone pills. Used on both screens. */
function ChecksCard({ result, title = "What we checked" }: { result: PoaResult; title?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-card-line bg-tile p-4">
      <h3 className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">{title}</h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {result.checks.map((c, i) => (
          <li
            key={c.label}
            className={cn(
              "flex items-center justify-between gap-3 py-2",
              i < result.checks.length - 1 && "border-b border-divider/60",
            )}
          >
            <span className="min-w-0 text-[12px] leading-4 text-inert">{c.label}</span>
            <span className="min-w-0 text-right [overflow-wrap:anywhere]">
              <StatusPill tone={c.tone}>{c.value}</StatusPill>
            </span>
          </li>
        ))}
      </ul>
      {result.document.issuer && !(result.details ?? []).length ? (
        <p className="m-0 text-[11px] leading-4 text-inert [overflow-wrap:anywhere]">
          {result.document.type} from {result.document.issuer}
        </p>
      ) : null}
    </section>
  );
}

/** What was read off the document (issuer, dates, name, address, amounts, stamps, signatures, codes). */
function DetailsCard({ result, className }: { result: PoaResult; className?: string }) {
  const rows = result.details ?? [];
  if (!rows.length) return null;
  return (
    <section className={cn("flex flex-col gap-3 rounded-[16px] border border-card-line bg-tile p-4", className)}>
      <h3 className="m-0 text-[15.9px] leading-6 font-medium tracking-[-0.32px] text-pine">Read from your document</h3>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className={cn("flex min-w-0 flex-col gap-0.5", d.value.length > 38 && "sm:col-span-2")}
          >
            <dt className="text-[12px] leading-4 text-inert">{d.label}</dt>
            <dd className="m-0 text-body text-pine [overflow-wrap:anywhere]">{d.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const STAGES = ["Reading your document", "Comparing the name with your ID", "Comparing the address", "Checking the document"];

/* ----------------------------------------------------------------- upload -- */

export function AddressUploadClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const panel = ctx.screen.panel as Extract<ScreenContext["screen"]["panel"], { kind: "upload" }>;
  const next = ctx.screen.next?.to;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<PoaResult | null>(null);
  const [rejectedName, setRejectedName] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // an error from the check itself (not from choosing the file): the same file can be sent again
  const [canRetry, setCanRetry] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Session state exists only in the browser, so it is restored after hydration.
  useEffect(() => {
    const f = readFlow();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f.poa?.typed) setTyped(f.poa.typed);
  }, []);

  // Release the preview's object URL when it is replaced or the screen closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = (f: File | null) => {
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (!f && inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 3500);
    const started = Date.now();
    const tick = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [busy]);

  const pick = (f: File | undefined) => {
    setError(null);
    setRejected(null);
    setCanRetry(false);
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      setError("Please upload a PDF, JPG, PNG or WEBP file.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`This file is larger than ${MAX_MB} MB. Please upload a smaller file.`);
      return;
    }
    choose(f);
  };

  const submit = useCallback(async () => {
    if (busy) return;
    const declared = typed.trim();
    setError(null);
    setRejected(null);

    // No document: the typed address goes to confirmation as it is.
    if (!file) {
      if (declared.length < 6) {
        setError("Upload a document, or type your full address.");
        return;
      }
      writeFlow({ poa: { typed: declared, at: Date.now() } });
      if (next) router.push(`/verify/${next}`);
      return;
    }

    setBusy(true);
    setStage(0);
    setElapsed(0);
    setCanRetry(false);
    const f = readFlow();
    let document: string;
    try {
      const { bytes, mime } = await prepare(file);
      // encrypted here, in the browser: nothing after this point can read the file
      document = await encryptDocument(bytes, mime);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message || "We couldn't open this file. Please try another one.");
      return;
    }
    const res = await kycApi.poaAnalyze({
      document,
      filename: file.name,
      declaredAddress: declared || undefined,
      subject: {
        name: f.subject?.name,
        dob: f.subject?.dob,
        idAddress: f.subject?.address,
        country: f.subject?.documentCountry ?? f.country,
      },
    });
    setBusy(false);
    if (!res.ok) {
      // the file is kept: the applicant can send the same one again
      setError(res.reason);
      setCanRetry(true);
      return;
    }
    writeFlow({ poa: { typed: declared || undefined, fileName: file.name, result: res.data, at: Date.now() } });
    if (res.data.outcome === "retake") {
      setRejected(res.data);
      setRejectedName(file.name);
      choose(null);
      return;
    }
    if (next) router.push(`/verify/${next}`);
  }, [busy, typed, file, next, router]);

  return (
    <FlowShell ctx={ctx} nav={{ onNext: submit, loading: busy, nextDisabled: busy || (!file && typed.trim().length < 6) }}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="flex max-w-[330px] flex-col gap-3">
          <p className="m-0 text-read text-quiet">{panel.guidance}</p>
          <SampleDialog
            trigger={panel.samples.trigger}
            title={panel.samples.title}
            close={panel.samples.close}
            specimen={panel.samples.specimen}
          />
          {rejected ? <ChecksCard result={rejected} title={rejectedName ? `Why we couldn't use ${rejectedName}` : "Why we couldn't use it"} /> : null}
          {rejected ? <DetailsCard result={rejected} /> : null}
        </div>

        <div className="flex w-full max-w-[440px] shrink-0 flex-col gap-4">
          {busy ? (
            <div
              className="flex aspect-[440/240] flex-col justify-center gap-4 rounded-box border border-divider bg-pine/[0.03] p-5"
              aria-live="polite"
            >
              <p className="m-0 flex items-center gap-2.5 text-read font-medium text-pine">
                <Loader2 aria-hidden className="size-5 shrink-0 animate-spin" strokeWidth={1.8} />
                Please wait while we check your document.
                <span className="tnum ml-auto text-body font-normal text-quiet">{elapsed} s</span>
              </p>
              {elapsed >= 12 ? (
                <p className="m-0 text-body text-quiet">Reading every detail of the page can take up to a minute. Please keep this window open.</p>
              ) : null}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {STAGES.map((label, i) => (
                  <li key={label} className={cn("flex items-center gap-2 text-body", i <= stage ? "text-pine" : "text-pine/47")}>
                    {i < stage ? (
                      <Check aria-hidden className="size-4 shrink-0 text-pine" strokeWidth={2.2} />
                    ) : i === stage ? (
                      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" strokeWidth={2} />
                    ) : (
                      <span aria-hidden className="size-4 shrink-0" />
                    )}
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : file ? (
            <div className="flex aspect-[440/240] items-center gap-4 rounded-box border border-lime bg-lime/12 p-4">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full max-h-[180px] w-auto max-w-[45%] rounded-well object-contain" />
              ) : (
                <FileText aria-hidden className="size-14 shrink-0 text-pine" strokeWidth={1.25} />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-read font-medium text-pine [overflow-wrap:anywhere]">{file.name}</span>
                <span className="text-eyebrow text-quiet">{sizeLabel(file.size)}</span>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="mt-2 inline-flex w-fit items-center gap-1 text-body text-pine/82 underline underline-offset-4 hover:text-pine"
                >
                  <X aria-hidden className="size-3.5" strokeWidth={2} />
                  Choose another file
                </button>
              </div>
            </div>
          ) : (
            <label className="flex aspect-[440/240] cursor-pointer flex-col items-center justify-center gap-2 rounded-box border border-lime bg-lime/12 p-3 text-center transition-colors hover:bg-lime/20 has-focus-visible:ring-4 has-focus-visible:ring-lime/50">
              <Upload aria-hidden className="size-[70px] text-pine" strokeWidth={1.25} />
              <span className="text-[21px] leading-[30px] text-pine/90">
                {rejected ? "Upload another document" : panel.dropzone.label}
              </span>
              <span className="text-eyebrow text-quiet">
                {panel.accept.join(" · ")}, up to {panel.maxMb}MB
              </span>
              <input
                ref={inputRef}
                type="file"
                name="proofOfAddress"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="address-manual" className="text-field font-medium text-pine/82">
              {file ? "Your address (we compare it with the document)" : panel.manual.label}
            </label>
            <input
              id="address-manual"
              name="addressManual"
              type="text"
              autoComplete="street-address"
              placeholder={panel.manual.placeholder}
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className={INPUT}
            />
          </div>

          {error ? (
            <div className="flex flex-col gap-2">
              <ErrorNote>{error}</ErrorNote>
              {canRetry && file && !busy ? (
                <button
                  type="button"
                  onClick={() => void submit()}
                  className="inline-flex w-fit items-center gap-1.5 rounded-pill border border-divider bg-white px-3.5 py-1.5 text-body font-medium text-pine transition-colors hover:bg-pine/[0.04]"
                >
                  <RotateCcw aria-hidden className="size-4" strokeWidth={1.9} />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {rejected ? (
            <div className="flex flex-col gap-2">
              <ErrorNote>{rejected.message}</ErrorNote>
              {rejected.tips.length ? (
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-pine/82">
                  {rejected.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </FlowShell>
  );
}

/* ---------------------------------------------------------------- confirm -- */

type FieldKey = "street" | "building" | "sector" | "district" | "city" | "postalCode";
const FIELDS: { key: FieldKey; label: string; auto: string; half?: boolean }[] = [
  { key: "street", label: "Street", auto: "address-line1" },
  { key: "building", label: "House or plot number", auto: "address-line2", half: true },
  { key: "sector", label: "Area or sector", auto: "address-level3", half: true },
  { key: "district", label: "District", auto: "address-level2", half: true },
  { key: "city", label: "City or town", auto: "address-level2", half: true },
  { key: "postalCode", label: "Postal code (if any)", auto: "postal-code", half: true },
];

export function AddressConfirmClient({ ctx, countries }: { ctx: ScreenContext; countries: Country[] }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<PoaResult | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    street: "",
    building: "",
    sector: "",
    district: "",
    city: "",
    postalCode: "",
  });
  const [country, setCountry] = useState("rw");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDoc, setFromDoc] = useState<Record<FieldKey, string> | null>(null);

  // Session state exists only in the browser, so the form is seeded after hydration.
  useEffect(() => {
    const f = readFlow();
    const r = f.poa?.result ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(r);
    const a: Partial<PoaAddress> = r?.address ?? {};
    // Sector, village and cell often repeat a name (village Kamatamu in cell Kamatamu): list each once.
    const area = [...new Set([a.sector, a.village, a.cell].filter((x): x is string => !!x?.trim()))].join(", ");
    const seeded: Record<FieldKey, string> = {
      street: a.street ?? (r ? "" : f.poa?.typed ?? ""),
      building: a.building ?? "",
      sector: area,
      district: a.district ?? "",
      city: a.city ?? "",
      postalCode: a.postalCode ?? "",
    };
    // A document that was read but whose street could not be split: keep the full line.
    if (r && !seeded.street && !seeded.city && a.raw) seeded.street = a.raw;
    const saved = f.poa?.confirmed;
    setValues(saved ? { ...seeded, ...(saved as Partial<Record<FieldKey, string>>) } : seeded);
    if (r) setFromDoc(seeded);
    const c = (saved?.country ?? a.country ?? f.subject?.documentCountry ?? f.country ?? "rw").toLowerCase();
    if (countries.some((x) => x.code === c)) setCountry(c);
    setReady(true);
  }, [countries]);

  const changed = useMemo(
    () =>
      fromDoc
        ? (Object.keys(values) as FieldKey[]).filter((k) => values[k].trim() !== (fromDoc[k] ?? "").trim())
        : [],
    [values, fromDoc],
  );

  const submit = useCallback(async () => {
    if (busy) return;
    if (!values.street.trim() && !values.city.trim()) {
      setError("Please enter at least your street and city.");
      return;
    }
    setBusy(true);
    setError(null);
    const f = readFlow();
    const address = { ...values, country };
    const res = await kycApi.poaConfirm({
      reference: f.poa?.result?.reference,
      address: { ...address, typed: f.poa?.typed },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    writeFlow({ poa: { ...f.poa, confirmed: address, edited: res.data.edited, at: Date.now() } });
    if (next) router.push(`/verify/${next}`);
  }, [busy, values, country, next, router]);

  const aside = result ? (
    <div className="flex flex-col gap-3">
      <ChecksCard result={result} />
      {result.outcome === "review" ? (
        <p className="m-0 text-[12px] leading-4 text-inert">{result.message}</p>
      ) : null}
    </div>
  ) : null;

  return (
    <FlowShell ctx={ctx} asideSlot={aside} nav={{ onNext: submit, loading: busy, nextDisabled: !ready }}>
      <form
        className="grid max-w-[560px] grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!result ? (
          <p className="m-0 text-body text-quiet sm:col-span-2">
            You didn&apos;t upload a document, so this address has not been checked against one.
          </p>
        ) : null}
        {FIELDS.map((fd) => (
          <div key={fd.key} className={cn("flex flex-col gap-1.5", !fd.half && "sm:col-span-2")}>
            <label htmlFor={`addr-${fd.key}`} className="flex items-center gap-2 text-field font-medium text-pine/82">
              {fd.label}
              {changed.includes(fd.key) ? (
                <span className="text-[11px] font-normal text-caution">Changed from the document</span>
              ) : null}
            </label>
            <input
              id={`addr-${fd.key}`}
              type="text"
              autoComplete={fd.auto}
              value={values[fd.key]}
              disabled={busy}
              onChange={(e) => setValues((v) => ({ ...v, [fd.key]: e.target.value }))}
              className={INPUT}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="text-field font-medium text-pine/82">Country</span>
          {ready ? (
            <CountrySelect
              countries={countries}
              defaultCode={country}
              onChange={setCountry}
              label="Country"
              className="h-11 w-full rounded-well border border-divider bg-white pr-8 pl-3 text-field text-pine"
            />
          ) : (
            <div className={INPUT} />
          )}
        </div>
        {error ? (
          <div className="sm:col-span-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
        {result ? <DetailsCard result={result} className="mt-2 sm:col-span-2" /> : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </FlowShell>
  );
}
