"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/** The keep-windows, shortest to longest. No custom value, nothing over 3 years. */
const OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "Keep until I delete (no auto-delete)", seconds: null },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
  { label: "2 hours", seconds: 7200 },
  { label: "5 hours", seconds: 18000 },
  { label: "12 hours", seconds: 43200 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "1 month", seconds: 2592000 },
  { label: "3 months", seconds: 7776000 },
  { label: "6 months", seconds: 15552000 },
  { label: "1 year", seconds: 31536000 },
  { label: "2 years", seconds: 63072000 },
  { label: "3 years", seconds: 94608000 },
];

const labelFor = (seconds: number | null) =>
  OPTIONS.find((o) => o.seconds === seconds)?.label ?? "this period";

/**
 * Data & Retention: how long verifications are kept before they are shredded automatically. Reads and
 * writes the live org setting (`/api/verifications/retention`); only an owner or admin may change it.
 *
 * Shortening the window can put records that are already older than the new window in range of the sweep.
 * Before saving such a change we show how many that is and let the operator decide: shred them now, or let
 * them live out one more window first.
 */
export function RetentionField({ label }: { label: string }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // When set, a warning dialog is open for a window the operator picked that would catch existing records.
  const [warn, setWarn] = useState<{ next: number; older: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/verifications/retention`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && typeof d === "object") setSeconds(d.seconds ?? null);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  /** Write the new window. `applyExisting` true shreds older records on the next sweep; false gives them one more window. */
  const commit = async (next: number | null, applyExisting: boolean) => {
    const prev = seconds;
    setSeconds(next);
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/verifications/retention`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: next, applyExisting }),
      });
      if (!r.ok) throw new Error(String(r.status));
      if (next === null) toast.success("Auto-delete turned off");
      else if (applyExisting)
        toast.success("Retention period saved", "Records older than the new period are being shredded now.");
      else toast.success("Retention period saved", `Older records are kept for one more ${labelFor(next)}, then shredded.`);
    } catch (e) {
      setSeconds(prev);
      toast.error(
        "Could not save the retention period",
        String((e as Error).message) === "403" ? "Only an owner or admin can change this." : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onChange = async (next: number | null) => {
    if (next === seconds) return;
    // Turning auto-delete off, or a window that catches nothing, saves straight away. A shorter window that
    // would catch records already older than it first asks how to treat those records.
    if (next === null) {
      void commit(null, false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/verifications/retention/impact?seconds=${next}`, { credentials: "include" });
      const older = r.ok ? Number((await r.json())?.older ?? 0) : 0;
      if (older > 0) setWarn({ next, older });
      else await commit(next, false);
    } catch {
      await commit(next, false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[14px] font-medium text-pine">
        {label}
        {saving ? <Loader2 aria-hidden className="size-3.5 animate-spin text-pine/50" /> : null}
      </span>
      <Select
        block
        icon={Clock}
        label={label}
        options={OPTIONS.map((o) => o.label)}
        value={labelFor(seconds)}
        disabled={!loaded || saving || warn !== null}
        onValueChange={(lbl) => void onChange(OPTIONS.find((o) => o.label === lbl)?.seconds ?? null)}
        className="h-11 w-full rounded-[12px] border border-[#e6e6e3] bg-white pr-10 pl-10 text-[14px] text-pine"
      />
      <span className="text-[13px] leading-relaxed text-pine/55">
        Verifications older than this are permanently shredded automatically. Up to 3 years.
      </span>

      {warn ? (
        <RetentionWarning
          older={warn.older}
          windowLabel={labelFor(warn.next)}
          busy={saving}
          onShredNow={() => void commit(warn.next, true).then(() => setWarn(null))}
          onKeepOneWindow={() => void commit(warn.next, false).then(() => setWarn(null))}
          onCancel={() => setWarn(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The warning before a shorter window is applied. Shredding is irreversible, so this spells out exactly how many
 * records are affected and gives a plain yes/no: shred them now, or keep them one more window and shred them then.
 */
function RetentionWarning({
  older,
  windowLabel,
  busy,
  onShredNow,
  onKeepOneWindow,
  onCancel,
}: {
  older: number;
  windowLabel: string;
  busy: boolean;
  onShredNow: () => void;
  onKeepOneWindow: () => void;
  onCancel: () => void;
}) {
  const n = older.toLocaleString();
  const records = older === 1 ? "verification" : "verifications";
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        disabled={busy}
        className="absolute inset-0 h-full w-full cursor-default bg-pine/20 backdrop-blur-md duration-200 animate-in fade-in"
      />
      <div
        role="dialog"
        aria-label="Apply retention period to older records"
        className="relative flex w-full max-w-[460px] flex-col gap-4 rounded-[20px] border border-hairline bg-white p-6 shadow-[0_28px_70px_-16px_rgba(14,50,40,0.45)] duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fdf1e7] text-[#c2410c]">
            <AlertTriangle aria-hidden className="size-5" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[17px] font-semibold text-pine">
              {n} {records} already older than {windowLabel}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-pine/65">
              These records are older than the new period, so the sweep will shred them. This destroys their
              keys, images and personal data for good and cannot be undone. How should the new period apply to
              them?
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onShredNow}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-[12px] bg-[#dc2626] px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#b91c1c] disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Shred them now
          </button>
          <button
            type="button"
            onClick={onKeepOneWindow}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-[12px] border border-[#e6e6e3] bg-white px-4 py-3 text-[14px] font-medium text-pine transition-colors hover:bg-[#f7f7f5] disabled:opacity-60"
          >
            Keep them one more {windowLabel}, then shred
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="mt-0.5 text-[13px] text-pine/50 transition-colors hover:text-pine disabled:opacity-60"
          >
            Cancel, don&rsquo;t change the period
          </button>
        </div>
      </div>
    </div>
  );
}
