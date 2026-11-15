"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FolderOpen, RefreshCw, Trash2 } from "lucide-react";

import type { Param } from "@/lib/console/playground-run";
import { cn } from "@/lib/utils";

export type FinUploadKind = "cheque" | "card";

const ACCEPT = { mime: "image/jpeg,image/png,image/bmp", label: "JPG, PNG or BMP" };
const MAX = 10 * 1024 * 1024;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function accepts(file: File): string | null {
  if (file.type && !ACCEPT.mime.split(",").includes(file.type)) return `This file type is not supported. Use ${ACCEPT.label}.`;
  if (file.size > MAX) return `This file is ${fmtBytes(file.size)}. The limit is 10 MB.`;
  return null;
}

/** A cheque with its MICR line along the bottom, or a payment card. */
function Drawing({ kind }: { kind: FinUploadKind }) {
  if (kind === "card") {
    return (
      <svg width="132" height="86" viewBox="0 0 132 86" aria-hidden>
        <rect x="1" y="1" width="130" height="84" rx="10" className="fill-pine" />
        <rect x="14" y="24" width="22" height="16" rx="3" className="fill-lime/80" />
        <rect x="14" y="52" width="88" height="6" rx="3" className="fill-white/70" />
        <rect x="14" y="66" width="40" height="5" rx="2.5" className="fill-white/40" />
        <circle cx="106" cy="68" r="8" className="fill-lime/50" />
        <circle cx="116" cy="68" r="8" className="fill-lime/30" />
      </svg>
    );
  }
  return (
    <svg width="150" height="76" viewBox="0 0 150 76" aria-hidden>
      <rect x="1" y="1" width="148" height="74" rx="6" className="fill-page stroke-[#c3ccd7]" strokeWidth="1.5" />
      <rect x="10" y="10" width="44" height="6" rx="3" className="fill-pine/25" />
      <rect x="104" y="10" width="36" height="6" rx="3" className="fill-pine/15" />
      <rect x="10" y="26" width="96" height="4" rx="2" className="fill-pine/15" />
      <rect x="112" y="23" width="28" height="10" rx="2" className="fill-lime-tint stroke-pine/25" />
      <rect x="10" y="38" width="80" height="4" rx="2" className="fill-pine/15" />
      <path d="M98 50c6-6 10 4 16-2s8 3 14-1" className="fill-none stroke-pine/40" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="10" y="60" width="130" height="8" rx="2" className="fill-lime/60" />
      <rect x="14" y="62.5" width="122" height="3" rx="1.5" className="fill-pine/50" />
    </svg>
  );
}

const TIPS: Record<FinUploadKind, string[]> = {
  cheque: [
    "The whole cheque in view, the MICR line along the bottom included.",
    "Flat, in even light, without glare on the code line.",
    "Several cheques in one photo are fine: stack them or lay them in rows.",
  ],
  card: ["The front of the card, filling most of the frame.", "Flat, without glare on the number.", "The photo is read and never stored."],
};

export function FinCaptureTips({ kind }: { kind: FinUploadKind }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[13px] border border-edge bg-panel/60 px-4 py-3.5">
      <p className="m-0 text-[13px] font-medium text-pine">For a clean read</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {TIPS[kind].map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[12.5px] leading-[18px] text-ink-muted">
            <span aria-hidden className="mt-px grid size-[18px] shrink-0 place-items-center rounded-pill bg-lime-tint text-ramp-2">
              <Check className="size-3" strokeWidth={2.6} />
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilePreview({ file, label }: { file: File; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (live && typeof reader.result === "string") setUrl(reader.result);
    };
    reader.readAsDataURL(file);
    createImageBitmap(file)
      .then((b) => {
        if (live) setDims({ w: b.width, h: b.height });
        b.close();
      })
      .catch(() => {
        /* not decodable here; the size is simply not shown */
      });
    return () => {
      live = false;
      reader.abort();
    };
  }, [file]);
  return (
    <div className="relative flex h-[208px] items-center justify-center bg-[#f4f4f2]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      ) : null}
      {dims ? (
        <span className="tnum absolute right-2.5 bottom-2.5 rounded-pill bg-pine/80 px-2 py-0.5 text-[10.5px] font-medium text-white">{`${dims.w} × ${dims.h}`}</span>
      ) : null}
    </div>
  );
}

/** The photo upload: drop or browse, in the KYC Playground's style, for the formats our engines read. */
export function FinUploadZone({
  param,
  kind,
  file,
  onPick,
  error,
}: {
  param: Param;
  kind: FinUploadKind;
  file: File | null;
  onPick: (f: File | null) => void;
  error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const shownError = rejected ?? error ?? null;
  const errId = `upload-${param.name}-${kind}-err`;

  const take = (f: File | null | undefined) => {
    if (!f) return;
    const why = accepts(f);
    if (why) {
      setRejected(why);
      return;
    }
    setRejected(null);
    onPick(f);
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT.mime}
      className="hidden"
      tabIndex={-1}
      onChange={(e) => {
        take(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (file) {
    return (
      <div className="flex flex-col overflow-hidden rounded-[16px] border border-edge bg-page">
        {picker}
        <FilePreview key={`${file.name}-${file.size}-${file.lastModified}`} file={file} label={param.label} />
        <div className="flex items-center gap-2.5 border-t border-rule px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-pine">{file.name}</span>
            <span className="mt-0.5 block text-[11.5px] text-slate">{`${fmtBytes(file.size)} · sent exactly as it is`}</span>
          </span>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine transition-colors hover:bg-hover-light"
          >
            <RefreshCw aria-hidden className="size-3.5" strokeWidth={2} />
            Replace
          </button>
          <button
            type="button"
            aria-label={`Remove the ${param.label.toLowerCase()}`}
            onClick={() => onPick(null)}
            className="grid size-8 shrink-0 place-items-center rounded-pill text-slate transition-colors hover:bg-danger-tint hover:text-danger"
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        aria-describedby={shownError ? errId : undefined}
        className={cn(
          "group relative flex min-h-[208px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed px-6 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:outline-none",
          over ? "border-pine bg-lime-tint" : shownError ? "border-danger/70 bg-danger-tint/35" : "border-[#c3ccd7] bg-panel hover:border-pine/50 hover:bg-lime-wash/70",
        )}
      >
        {picker}
        <span className={cn("absolute top-3 right-3 rounded-[6px] px-1.5 py-px text-[10.5px] font-medium", param.required ? "bg-danger-tint text-danger" : "bg-well text-slate")}>
          {param.required ? "required" : "optional"}
        </span>
        <span className="relative transition-transform duration-200 group-hover:-translate-y-0.5">
          <Drawing kind={kind} />
          <span className="absolute -right-3 -bottom-2.5 grid size-8 place-items-center rounded-pill bg-pine text-lime ring-4 ring-panel transition-colors group-hover:ring-lime-wash">
            <ArrowUp aria-hidden className="size-4" strokeWidth={2.6} />
          </span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-semibold text-pine">{over ? "Drop it to add it" : `Upload the ${param.label.toLowerCase()}`}</span>
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[12.5px] text-slate">
            Drag and drop a file here, or
            <span className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-pine px-3.5 text-[12.5px] font-medium text-lime shadow-cta transition-[filter] group-hover:brightness-110">
              <FolderOpen aria-hidden className="size-3.5" strokeWidth={2} />
              Browse files
            </span>
          </span>
        </span>
        <span className="text-[11.5px] text-slate">{`${ACCEPT.label}, up to 10 MB · read exactly as uploaded`}</span>
      </button>
      {shownError ? (
        <p id={errId} role="alert" className="m-0 px-1 text-[12px] font-medium text-danger">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
