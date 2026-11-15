"use client";

import { useRef, useState, type ReactNode } from "react";
import { Eye, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { PersonPlaceholder } from "@/components/shell/account-avatar";
import { toast } from "@/components/ui/toast";
import { downscaleImage } from "@/lib/console/downscale-image";

/**
 * A photo/logo tile with a working ⋯ Actions menu (View, Edit, Delete) — the Figma tile, now live.
 *
 * Picking a file downscales it in the browser to a small data URL (so uploads stay tiny) and hands it
 * to `onUpload`; Delete calls `onClear`; View opens the current image. Used for the profile photo
 * (per-user avatar) and the organisation logo (shown to applicants), each wired to its own endpoints.
 */
export function PhotoTile({
  label,
  imageUrl,
  placeholder,
  max = 256,
  onUpload,
  onClear,
  editable = true,
}: {
  label: string;
  /** The current image (data URL or remote), or null for the placeholder. */
  imageUrl: string | null;
  /** What to show when there is no image. Defaults to a person silhouette. */
  placeholder?: ReactNode;
  /** Longest-side cap for the downscaled upload (logos use a larger value than avatars). */
  max?: number;
  onUpload: (dataUrl: string) => Promise<void>;
  onClear: () => Promise<void>;
  /** Owner/admin gates set this false to show the tile read-only (no Edit/Delete). */
  editable?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  // An optimistic preview so the new image shows the instant it is picked.
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? imageUrl;

  const closeMenu = () => detailsRef.current?.removeAttribute("open");

  const pick = () => {
    closeMenu();
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type)) {
      toast.error("That file is not an image", "Use a PNG, JPEG, WebP or SVG.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await downscaleImage(file, { max });
      setPreview(dataUrl);
      await onUpload(dataUrl);
      toast.success(`${label} updated`);
    } catch (e) {
      setPreview(null);
      toast.error(`Could not update ${label.toLowerCase()}`, errorText(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const view = () => {
    closeMenu();
    if (!shown) {
      toast.success("No image set yet");
      return;
    }
    window.open(shown, "_blank", "noopener,noreferrer");
  };

  const remove = async () => {
    closeMenu();
    if (!shown) return;
    setBusy(true);
    try {
      await onClear();
      setPreview(null);
      toast.success(`${label} removed`);
    } catch (e) {
      toast.error(`Could not remove ${label.toLowerCase()}`, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-medium text-pine">{label}</span>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={editable ? pick : view}
          className="group relative grid size-28 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-[#e4e4e1]"
          aria-label={editable ? `Change ${label.toLowerCase()}` : `View ${label.toLowerCase()}`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar/logo, may be remote or a data URL
            <img src={shown} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            placeholder ?? <PersonPlaceholder className="size-full text-[#adada8]" />
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-white/55">
              <Loader2 aria-hidden className="size-6 animate-spin text-pine/70" strokeWidth={2} />
            </span>
          ) : editable ? (
            <span className="absolute inset-0 grid place-items-center bg-pine/0 text-white opacity-0 transition-[background-color,opacity] group-hover:bg-pine/35 group-hover:opacity-100">
              <Pencil aria-hidden className="size-5" strokeWidth={1.8} />
            </span>
          ) : null}
        </button>

        {editable ? (
          <details ref={detailsRef} className="group relative">
            <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-full bg-[#ececeb] text-pine/70 transition-colors hover:bg-[#e2e2e0] [&::-webkit-details-marker]:hidden">
              <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
            </summary>
            <div className="absolute left-0 top-[calc(100%+8px)] z-50 flex w-44 flex-col gap-[9px] rounded-[14px] bg-[rgba(14,50,40,0.03)] px-2.5 py-[11px] backdrop-blur-[27px]">
              <p className="m-0 text-[16px] font-medium tracking-[-0.17px] text-pine">Actions</p>
              <div aria-hidden className="h-px w-full bg-[rgba(14,50,40,0.1)]" />
              <MenuItem icon={Eye} label="View" onClick={view} />
              <MenuItem icon={Pencil} label="Edit" onClick={pick} />
              <MenuItem icon={Trash2} label="Delete" onClick={() => void remove()} disabled={!shown} />
            </div>
          </details>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-1.5 rounded-[6px] bg-[rgba(14,50,40,0.05)] py-1.5 pr-1.5 pl-2 text-left text-[13px] text-pine transition-colors hover:bg-[rgba(14,50,40,0.1)] disabled:opacity-40"
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.7} />
      {label}
    </button>
  );
}

function errorText(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 403) return "Only an owner or admin can change this.";
  return "Please try again.";
}
