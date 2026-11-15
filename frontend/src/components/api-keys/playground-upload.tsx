"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileText, FolderOpen, LockKeyhole, RefreshCw, Trash2 } from "lucide-react";

import type { Param } from "@/lib/console/playground-run";
import { cn } from "@/lib/utils";

/**
 * The upload area for an image parameter. It has to read as "put a file here" at a glance, so it uses the cues every
 * good uploader shares: a tall dashed drop area, a drawing of exactly what is expected (a card front, a card back, a
 * passport page, a face, a paper document), a verb title, a real Browse button and the allowed formats. Once a file is
 * chosen the area becomes a preview of that file.
 */

export type UploadKind = "id-front" | "id-back" | "passport" | "face" | "document";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function uploadKind(group: string, name: string): UploadKind {
  if (group === "Face" || group === "Face workflows") return "face";
  if (group === "MRZ") return "passport";
  if (name === "front") return "id-front";
  if (name === "back") return "id-back";
  return "document";
}

const ACCEPT: Record<UploadKind, { mime: string; label: string }> = {
  "id-front": { mime: "image/jpeg,image/png,image/webp", label: "JPG, PNG or WEBP" },
  "id-back": { mime: "image/jpeg,image/png,image/webp", label: "JPG, PNG or WEBP" },
  passport: { mime: "image/jpeg,image/png,image/webp", label: "JPG, PNG or WEBP" },
  face: { mime: "image/jpeg,image/png,image/webp", label: "JPG, PNG or WEBP" },
  document: { mime: "application/pdf,image/jpeg,image/png,image/webp", label: "PDF, JPG, PNG or WEBP" },
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function accepts(kind: UploadKind, file: File): string | null {
  const allowed = ACCEPT[kind].mime.split(",");
  if (file.type && !allowed.includes(file.type)) return `This file type is not supported. Use ${ACCEPT[kind].label}.`;
  if (file.size > MAX_UPLOAD_BYTES) return `This file is ${fmtBytes(file.size)}. The limit is 10 MB.`;
  return null;
}

/* ----------------------------------------------------------------------------
   Drawings of what to upload
---------------------------------------------------------------------------- */

function Portrait({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} className="fill-lime-tint" />
      <circle cx={cx} cy={y + h * 0.38} r={w * 0.2} className="fill-pine/30" />
      <path d={`M${x + 3} ${y + h} c${w * 0.08} ${-h * 0.3} ${w * 0.25} ${-h * 0.36} ${w / 2 - 3} ${-h * 0.36} s${w * 0.42 - 3} ${h * 0.06} ${w / 2 - 3} ${h * 0.36} z`} className="fill-pine/30" />
    </g>
  );
}

function Drawing({ kind }: { kind: UploadKind }) {
  const frame = "fill-page stroke-pine/55";
  if (kind === "id-front") {
    return (
      <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden>
        <rect x="1" y="1" width="94" height="62" rx="8" className={frame} strokeWidth="1.6" />
        <Portrait x={9} y={11} w={24} h={32} />
        <rect x="40" y="13" width="32" height="4.5" rx="2.25" className="fill-pine/30" />
        <rect x="40" y="23" width="44" height="4" rx="2" className="fill-pine/15" />
        <rect x="40" y="31" width="36" height="4" rx="2" className="fill-pine/15" />
        <rect x="9" y="50" width="56" height="4" rx="2" className="fill-pine/12" />
      </svg>
    );
  }
  if (kind === "id-back") {
    const bars = [2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 2, 3, 1, 2, 1];
    let x = 9;
    return (
      <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden>
        <rect x="1" y="1" width="94" height="62" rx="8" className={frame} strokeWidth="1.6" />
        {bars.map((w, i) => {
          const r = <rect key={i} x={x} y={10} width={w} height={18} className="fill-pine/45" />;
          x += w + 1.6;
          return r;
        })}
        <line x1="9" y1="41" x2="87" y2="41" className="stroke-pine/35" strokeWidth="3.2" strokeDasharray="3.4 2" />
        <line x1="9" y1="50" x2="87" y2="50" className="stroke-pine/35" strokeWidth="3.2" strokeDasharray="3.4 2" />
      </svg>
    );
  }
  if (kind === "passport") {
    return (
      <svg viewBox="0 0 72 90" width="58" height="72" aria-hidden>
        <rect x="1" y="1" width="70" height="88" rx="7" className={frame} strokeWidth="1.6" />
        <Portrait x={8} y={10} w={20} h={26} />
        <rect x="33" y="12" width="28" height="4" rx="2" className="fill-pine/30" />
        <rect x="33" y="21" width="30" height="3.5" rx="1.75" className="fill-pine/15" />
        <rect x="33" y="29" width="22" height="3.5" rx="1.75" className="fill-pine/15" />
        <rect x="8" y="46" width="55" height="3.5" rx="1.75" className="fill-pine/12" />
        <line x1="8" y1="68" x2="64" y2="68" className="stroke-pine/40" strokeWidth="3" strokeDasharray="3 1.8" />
        <line x1="8" y1="77" x2="64" y2="77" className="stroke-pine/40" strokeWidth="3" strokeDasharray="3 1.8" />
      </svg>
    );
  }
  if (kind === "face") {
    const c = "stroke-pine/60";
    return (
      <svg viewBox="0 0 80 80" width="70" height="70" aria-hidden>
        <path d="M4 20V10a6 6 0 0 1 6-6h10" className={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M60 4h10a6 6 0 0 1 6 6v10" className={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M76 60v10a6 6 0 0 1-6 6H60" className={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M20 76H10a6 6 0 0 1-6-6V60" className={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="40" cy="33" r="12" className="fill-lime-tint stroke-pine/45" strokeWidth="1.6" />
        <path d="M18 66c3-11 11.5-16 22-16s19 5 22 16" className="fill-lime-tint stroke-pine/45" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 72 90" width="58" height="72" aria-hidden>
      <path d="M9 1h39l23 23v57a8 8 0 0 1-8 8H9a8 8 0 0 1-8-8V9a8 8 0 0 1 8-8z" className={frame} strokeWidth="1.6" />
      <path d="M48 1v17a6 6 0 0 0 6 6h17" className="fill-none stroke-pine/55" strokeWidth="1.6" />
      <rect x="10" y="12" width="20" height="8" rx="2" className="fill-lime-tint" />
      {[36, 44, 52, 60, 68].map((y, i) => (
        <rect key={y} x="10" y={y} width={[50, 44, 52, 38, 30][i]} height="3.5" rx="1.75" className="fill-pine/15" />
      ))}
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   The drop area, and the preview it becomes
---------------------------------------------------------------------------- */

export function UploadZone({
  param,
  kind,
  file,
  onPick,
  error,
}: {
  param: Param;
  kind: UploadKind;
  file: File | null;
  onPick: (f: File | null) => void;
  error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const shownError = rejected ?? error ?? null;
  const title = `Upload the ${param.label.charAt(0).toLowerCase()}${param.label.slice(1)}`;
  const errId = `upload-${param.name}-err`;

  const take = (f: File | null | undefined) => {
    if (!f) return;
    const why = accepts(kind, f);
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
      accept={ACCEPT[kind].mime}
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
            <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate">
              {fmtBytes(file.size)}
              <span aria-hidden className="size-1 rounded-pill bg-icon-soft" />
              <LockKeyhole aria-hidden className="size-3" strokeWidth={2} />
              Encrypted when you send
            </span>
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
            aria-label={`Remove ${param.label.toLowerCase()}`}
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
          over
            ? "border-pine bg-lime-tint"
            : shownError
              ? "border-danger/70 bg-danger-tint/35"
              : "border-[#c3ccd7] bg-panel hover:border-pine/50 hover:bg-lime-wash/70",
        )}
      >
        {picker}
        <span
          className={cn(
            "absolute top-3 right-3 rounded-[6px] px-1.5 py-px text-[10.5px] font-medium",
            param.required ? "bg-danger-tint text-danger" : "bg-well text-slate",
          )}
        >
          {param.required ? "required" : "optional"}
        </span>

        <span className="relative transition-transform duration-200 group-hover:-translate-y-0.5">
          <Drawing kind={kind} />
          <span className="absolute -right-3 -bottom-2.5 grid size-8 place-items-center rounded-pill bg-pine text-lime ring-4 ring-panel transition-colors group-hover:ring-lime-wash">
            <ArrowUp aria-hidden className="size-4" strokeWidth={2.6} />
          </span>
        </span>

        <span className="flex flex-col items-center gap-1">
          <span className="text-[14px] font-semibold text-pine">{over ? "Drop it to add it" : title}</span>
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[12.5px] text-slate">
            Drag and drop a file here, or
            <span className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-pine px-3.5 text-[12.5px] font-medium text-lime shadow-cta transition-[filter] group-hover:brightness-110">
              <FolderOpen aria-hidden className="size-3.5" strokeWidth={2} />
              Browse files
            </span>
          </span>
        </span>

        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-slate">
          <span>{`${ACCEPT[kind].label}, up to 10 MB`}</span>
          <span className="inline-flex items-center gap-1">
            <LockKeyhole aria-hidden className="size-3" strokeWidth={2} />
            Encrypted before it leaves your browser
          </span>
        </span>
      </button>
      {shownError ? (
        <p id={errId} role="alert" className="m-0 px-1 text-[12px] font-medium text-danger">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   A compact slot for one item in a gallery or a sequence of frames
---------------------------------------------------------------------------- */

export function UploadSlot({
  kind,
  file,
  onPick,
  invalid,
  caption,
  tall,
}: {
  kind: UploadKind;
  file: File | null;
  onPick: (f: File | null) => void;
  invalid?: boolean;
  caption?: string;
  /** One of a pair (the two match images): a little taller, like the single upload areas. */
  tall?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const name = caption ?? "image";
  const take = (f: File | null | undefined) => {
    if (!f) return;
    const why = accepts(kind, f);
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
      accept={ACCEPT[kind].mime}
      className="hidden"
      tabIndex={-1}
      onChange={(e) => {
        take(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  // one fixed height, empty or filled, so the fields under each slot line up across the row
  const height = tall ? "h-[212px]" : "h-[196px]";
  if (file) {
    return (
      <div className="flex flex-col gap-1">
        <div className={cn("relative flex flex-col overflow-hidden rounded-[12px] border-2 border-edge bg-page", height)}>
          {picker}
          <MiniPreview file={file} />
          <div className="flex items-center gap-2 border-t border-rule px-2.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-pine" title={file.name}>
                {file.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate">
                {fmtBytes(file.size)}
                <LockKeyhole aria-hidden className="ml-1 size-3" strokeWidth={2} />
                Encrypted when you send
              </span>
            </span>
            <button
              type="button"
              aria-label={`Replace ${name.toLowerCase()}`}
              onClick={() => input.current?.click()}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-pill border border-edge bg-page px-2.5 text-[11.5px] font-medium text-pine transition-colors hover:bg-hover-light"
            >
              <RefreshCw aria-hidden className="size-3" strokeWidth={2.2} />
              Replace
            </button>
            <button
              type="button"
              aria-label={`Remove ${name.toLowerCase()}`}
              onClick={() => onPick(null)}
              className="grid size-7 shrink-0 place-items-center rounded-pill text-slate transition-colors hover:bg-danger-tint hover:text-danger"
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
            </button>
          </div>
        </div>
        {rejected ? (
          <p role="alert" className="m-0 text-[11px] font-medium text-danger">
            {rejected}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
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
        className={cn(
          "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[12px] border-2 border-dashed px-4 py-4 text-center transition-colors focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none",
          height,
          over ? "border-pine bg-lime-tint" : invalid || rejected ? "border-danger/70 bg-danger-tint/35" : "border-[#c3ccd7] bg-page hover:border-pine/50 hover:bg-lime-wash/70",
        )}
      >
        {picker}
        <span className="relative scale-[0.82] transition-transform duration-200 group-hover:-translate-y-0.5">
          <Drawing kind={kind} />
          <span className="absolute -right-3 -bottom-2.5 grid size-8 place-items-center rounded-pill bg-pine text-lime ring-4 ring-page transition-colors group-hover:ring-lime-wash">
            <ArrowUp aria-hidden className="size-4" strokeWidth={2.6} />
          </span>
        </span>
        <span className="flex flex-col items-center gap-1.5">
          <span className="text-[13px] font-semibold text-pine">{over ? "Drop it to add it" : `Add ${name.toLowerCase()}`}</span>
          <span className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11.5px] text-slate">
            Drag a file here, or
            <span className="inline-flex h-7 items-center gap-1 rounded-pill bg-pine px-3 text-[11.5px] font-medium text-lime shadow-cta transition-[filter] group-hover:brightness-110">
              <FolderOpen aria-hidden className="size-3.5" strokeWidth={2} />
              Browse
            </span>
          </span>
        </span>
        <span className="text-[10.5px] text-slate">{`${ACCEPT[kind].label}, up to 10 MB`}</span>
      </button>
      {rejected ? (
        <p role="alert" className="m-0 text-[11px] font-medium text-danger">
          {rejected}
        </p>
      ) : null}
    </div>
  );
}

function MiniPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  useEffect(() => {
    if (!isImage) return;
    let live = true;
    const reader = new FileReader();
    reader.onload = () => live && typeof reader.result === "string" && setUrl(reader.result);
    reader.readAsDataURL(file);
    return () => { live = false; reader.abort(); };
  }, [file, isImage]);
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center bg-[#eef1f4] p-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-2 m-auto max-h-[calc(100%-16px)] max-w-[calc(100%-16px)] rounded-[6px] object-contain" />
      ) : (
        <span className="grid size-10 place-items-center rounded-[10px] bg-page text-pine shadow-[0_2px_8px_rgb(14_50_40/0.12)]">
          <FileText aria-hidden className="size-5" strokeWidth={1.6} />
        </span>
      )}
      <span className="absolute top-1.5 left-1.5 grid size-4 place-items-center rounded-pill bg-lime text-pine">
        <Check aria-hidden className="size-2.5" strokeWidth={3} />
      </span>
    </div>
  );
}

function FilePreview({ file, label }: { file: File; label: string }) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // read the picture for the preview (a data URL needs no revoking, so it survives a re-mount)
  useEffect(() => {
    if (!isImage) return;
    let live = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (live && typeof reader.result === "string") setUrl(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      live = false;
      reader.abort();
    };
  }, [file, isImage]);
  // the pixel size, read from the file itself
  useEffect(() => {
    if (!isImage) return;
    let live = true;
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
    };
  }, [file, isImage]);
  return (
    <div className="relative grid h-[164px] place-items-center bg-[#eef1f4]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${label} you chose`}
          className="max-h-[148px] max-w-[calc(100%-24px)] rounded-[8px] object-contain shadow-[0_2px_8px_rgb(14_50_40/0.18)]"
        />
      ) : (
        <span className="flex flex-col items-center gap-2 text-slate">
          <span className="grid size-14 place-items-center rounded-[14px] bg-page shadow-[0_2px_8px_rgb(14_50_40/0.12)]">
            <FileText aria-hidden className="size-7 text-pine" strokeWidth={1.6} />
          </span>
          <span className="text-[12px] font-medium">PDF document</span>
        </span>
      )}
      <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-pill bg-lime px-2 py-0.5 text-[11px] font-semibold text-pine shadow-cta">
        <Check aria-hidden className="size-3" strokeWidth={3} />
        Ready
      </span>
      {dims ? <span className="tnum absolute right-2.5 bottom-2.5 rounded-pill bg-pine/80 px-2 py-0.5 text-[10.5px] font-medium text-page">{`${dims.w} × ${dims.h}`}</span> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Beside an upload that has no other options: what makes a capture read well
---------------------------------------------------------------------------- */

const TIPS: Record<UploadKind, string[]> = {
  passport: [
    "The whole page in the frame, all four corners visible.",
    "The MRZ lines sharp and level, with nothing covering them.",
    "No glare or shadow across the text. Turn the flash off if it reflects.",
    "The original in colour, not a photocopy or a photo of a screen.",
  ],
  document: [
    "The whole page or card in the frame, all four corners visible.",
    "Flat, sharp and level, with no blur from movement.",
    "No glare or shadow across the portrait or the text.",
    "The original in colour, not a photocopy or a photo of a screen.",
  ],
  "id-front": [],
  "id-back": [],
  face: [
    "One face, looking at the camera.",
    "Even light, with no strong shadow or glare.",
    "Nothing covering the face: hair, hands, a mask or dark glasses.",
    "A real capture, not a photo of a screen or a print.",
  ],
};

export function CaptureTips({ kind }: { kind: UploadKind }) {
  const tips = TIPS[kind].length ? TIPS[kind] : TIPS.document;
  return (
    <div className="flex h-full flex-col gap-3 rounded-[13px] border border-edge bg-panel/60 px-4 py-3.5">
      <p className="m-0 text-[13px] font-medium text-pine">For a clean read</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tips.map((t) => (
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
