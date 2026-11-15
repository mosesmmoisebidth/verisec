"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";

import { EnvChip } from "@/components/api-keys/parts";
import type { CatalogPermission, KeyEnv, KeyEvent, KeyInput, KeyRow, KeysCatalog } from "@/lib/console/keys-api";
import { KeysError, keysApi, stepUpTwoFactor } from "@/lib/console/keys-api";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   The dialog shell: a native <dialog> (focus trap, Escape and the top layer are
   the platform's), opened and closed by the `open` prop.
---------------------------------------------------------------------------- */

function Modal({
  open,
  onClose,
  labelledBy,
  width = 560,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  width?: number;
  /** false: Escape and the backdrop do nothing (the one-time secret must be acknowledged first). */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // The `open` prop alone opens and closes the dialog. Escape (the `cancel` event) is turned into a request to
    // close rather than a native close: listening to the native `close` event would also fire when the app closes
    // one dialog to open the next (create -> the one-time secret) and wipe that next dialog's state.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
      className="m-auto max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      {open ? children : null}
    </dialog>
  );
}

function DialogHeader({ id, title, sub, onClose }: { id: string; title: string; sub?: React.ReactNode; onClose?: () => void }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-rule px-6 pt-5 pb-4">
      <div className="min-w-0">
        <h2 id={id} className="m-0 text-[17.9px] leading-[24px] font-medium tracking-[-0.45px] text-ink">
          {title}
        </h2>
        {sub ? <div className="mt-1 text-[13px] leading-[19px] text-slate">{sub}</div> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
        >
          <X aria-hidden className="size-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </header>
  );
}

const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-lime px-5 text-[14px] font-semibold text-pine shadow-cta transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-hairline bg-page px-4 text-[14px] font-medium text-pine transition-colors hover:bg-hover-light";
const DANGER =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-danger px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const INPUT =
  "h-10 w-full rounded-[10px] border border-hairline bg-panel px-3 text-[14px] text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime";

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="m-0 flex items-start gap-2 rounded-[12px] bg-danger-tint px-3.5 py-2.5 text-[13px] leading-[19px] text-danger">
      <AlertTriangle aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2} />
      {error}
    </p>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-pine">
        {label}
      </label>
      {children}
      {hint ? <div className="text-[12px] leading-[17px] text-slate">{hint}</div> : null}
    </div>
  );
}

const message = (e: unknown) => (e instanceof KeysError ? e.message : "Something went wrong. Try again.");

/* ----------------------------------------------------------------------------
   Create / edit a key
---------------------------------------------------------------------------- */

const DAY = 86_400_000;
/** A moment as a datetime-local value in the viewer's own time zone: "2026-10-09T14:30". */
const localMoment = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type FormProps = {
  mode: "create" | "edit";
  catalog: KeysCatalog;
  initial?: KeyRow;
  onClose: () => void;
  /** Create hands back the secret (shown once); edit only the updated row. */
  onDone: (row: KeyRow, secret?: string) => void;
};

export function KeyFormDialog({ open, ...props }: FormProps & { open: boolean }) {
  return (
    <Modal open={open} onClose={props.onClose} labelledBy="key-form-title" width={1040}>
      <KeyForm {...props} />
    </Modal>
  );
}

/** Mounted each time the dialog opens, so every field starts from the key being edited or the defaults. */
function KeyForm({ mode, catalog, initial, onClose, onDone }: FormProps) {
  const liveOk = catalog.environments.find((e) => e.id === "live")?.available ?? false;
  const [name, setName] = useState(initial?.name ?? "");
  const [env, setEnv] = useState<KeyEnv>(initial?.env ?? "test");
  const [products, setProducts] = useState<string[]>(initial?.products ?? ["kyc"]);
  const [perms, setPerms] = useState<Set<string>>(() => new Set(initial?.permissions ?? []));
  const [rate, setRate] = useState(String(initial?.rate_per_min ?? catalog.rate.default));
  const [ips, setIps] = useState((initial?.ip_allow ?? []).join("\n"));
  // the expiry is a moment in the viewer's own time ("2026-10-09T14:30"), sent as an exact UTC instant
  const [expires, setExpires] = useState(initial?.expires_at ? localMoment(new Date(initial.expires_at)) : "");
  const [cap, setCap] = useState(initial?.spend_cap ? String(initial.spend_cap) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState<{ has: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // the earliest expiry the picker offers: a minute from now (fixed while the form is open)
  const [soonest] = useState(() => localMoment(new Date(Date.now() + 60_000)));

  const bySection = useMemo(() => {
    const m = new Map<string, CatalogPermission[]>();
    for (const p of catalog.permissions) m.set(p.section, [...(m.get(p.section) ?? []), p]);
    return m;
  }, [catalog.permissions]);

  const grantable = (p: CatalogPermission) => p.allowed && !p.soon && products.includes(p.id.split(":")[0] ?? "");
  const toggle = (id: string) =>
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sensitiveOn = catalog.permissions.filter((p) => p.sensitive && perms.has(p.id));
  const ipLines = ips.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: KeyInput = {
      name: name.trim(),
      products,
      permissions: [...perms].filter((p) => products.includes(p.split(":")[0] ?? "")),
      rate_per_min: Number(rate),
      ip_allow: ipLines,
      expires_at: expires ? new Date(expires).toISOString() : null,
      spend_cap: cap ? Number(cap) : null,
    };
    if (mode === "create") input.env = env;
    setBusy(true);
    try {
      if (mode === "create") {
        const r = await keysApi.create(input);
        onDone(r.key, r.secret);
      } else if (initial) {
        const r = await keysApi.edit(initial.id, input);
        onDone(r.key);
      }
    } catch (err) {
      // a secret needs two-factor sign-in: ask for the code here instead of a dead end
      if (err instanceof KeysError && err.code === "mfa_required") {
        setNeedCode({ has: !!err.hasTwoFactor });
        setError(null);
      } else setError(message(err));
      setBusy(false);
    }
  }

  const title = mode === "create" ? "Create API key" : "Edit key";
  return (
    <form ref={formRef} onSubmit={(e) => void submit(e)} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <DialogHeader
          id="key-form-title"
          title={title}
          onClose={onClose}
          sub={
            mode === "create"
              ? "Grant only what this key needs. It can call nothing you do not tick."
              : (
                <span className="inline-flex items-center gap-2">
                  {initial?.name} <EnvChip env={initial?.env ?? "test"} />
                  <span className="font-mono text-[12px]">{initial?.key}</span>
                </span>
              )
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="key-name" hint="Where it runs, so a teammate knows what breaks if it is revoked.">
              <span className="relative flex items-center">
                <Server aria-hidden className="pointer-events-none absolute left-3 size-[17px] text-slate" strokeWidth={1.6} />
                <input
                  id="key-name"
                  required
                  maxLength={60}
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Backend production"
                  className={cn(INPUT, "pl-10")}
                />
              </span>
            </Field>

            {mode === "create" ? (
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-[13.5px] font-medium text-pine">Environment</span>
                <div role="radiogroup" aria-label="Environment" className="grid grid-cols-2 gap-1 rounded-[12px] bg-well p-1">
                  {catalog.environments.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={env === e.id}
                      disabled={!e.available}
                      title={e.reason ?? undefined}
                      onClick={() => setEnv(e.id)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-[13.5px] transition-colors",
                        env === e.id ? "bg-white font-semibold text-pine shadow-[0_1px_2px_rgb(14_50_40/0.12)]" : "text-slate hover:text-pine",
                        !e.available && "cursor-not-allowed opacity-55 hover:text-slate",
                      )}
                    >
                      {!e.available ? <Lock aria-hidden className="size-3.5" strokeWidth={2} /> : null}
                      {e.name}
                    </button>
                  ))}
                </div>
                <div className="text-[12px] leading-[17px] text-slate">
                  {env === "test"
                    ? "Sandbox: synthetic data, no billing. Secret starts sk_test_."
                    : "Production: billed, real data. Secret starts ak_live_."}
                  {!liveOk ? <span className="block text-caution">{catalog.environments.find((x) => x.id === "live")?.reason}</span> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[13.5px] font-medium text-pine">Products</span>
            <div className="flex flex-wrap gap-2">
              {catalog.products.map((p) => {
                const on = products.includes(p.id);
                return (
                  <label
                    key={p.id}
                    title={p.reason ?? undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-[13.5px] transition-colors",
                      on ? "border-pine/25 bg-lime-tint font-medium text-pine" : "border-hairline bg-page text-pine",
                      p.available ? "cursor-pointer hover:bg-hover-light" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={!p.available}
                      onChange={() => setProducts((ps) => (on ? ps.filter((x) => x !== p.id) : [...ps, p.id]))}
                    />
                    <span aria-hidden className={cn("grid size-4 place-items-center rounded-pill border-[1.5px]", on ? "border-pine bg-pine text-lime" : "border-hairline")}>
                      {on ? <Check className="size-2.5" strokeWidth={3.4} /> : null}
                    </span>
                    {p.name}
                    {!p.available ? <Lock aria-hidden className="size-3" strokeWidth={2} /> : null}
                  </label>
                );
              })}
            </div>
            {catalog.products.some((p) => !p.available) ? (
              <p className="m-0 text-[12px] text-slate">Products you have not set up stay locked until you do.</p>
            ) : null}
          </div>

          <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Permissions</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-[13.5px] font-medium text-pine">Permissions</span>
              <span className="tnum rounded-pill bg-well px-2 py-0.5 text-[11.5px] font-medium text-pine">{perms.size} selected</span>
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                {catalog.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPerms(new Set(p.permissions.filter((x) => products.includes(x.split(":")[0] ?? ""))))}
                    className="inline-flex h-8 items-center rounded-pill border border-hairline bg-page px-3 text-[12.5px] font-medium text-pine hover:bg-hover-light"
                  >
                    {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => setPerms(new Set())} className="inline-flex h-8 items-center rounded-pill px-2.5 text-[12.5px] font-medium text-slate hover:text-pine">
                  Clear
                </button>
              </span>
            </div>

            <div className="max-h-[340px] overflow-y-auto rounded-[14px] border border-edge [scrollbar-width:thin]">
              {catalog.sections.map((s) => {
                const list = bySection.get(s.id) ?? [];
                const on = list.filter((p) => perms.has(p.id)).length;
                return (
                  <section key={s.id} className="border-b border-rule last:border-0">
                    <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-rule bg-panel px-4 py-2">
                      <span className="grid size-5 place-items-center rounded-[6px] bg-pine text-[11px] font-semibold text-lime">{s.id}</span>
                      <span className="text-[13px] font-medium text-pine">{s.name}</span>
                      <span className="tnum ml-auto text-[11.5px] text-slate">
                        {on} of {list.length}
                      </span>
                    </div>
                    {/* two columns once the dialog is wide enough, so the list is read across, not scrolled */}
                    <ul className="m-0 grid list-none p-0 md:grid-cols-2">
                      {list.map((p) => {
                        const can = grantable(p);
                        const checked = perms.has(p.id);
                        return (
                          <li key={p.id}>
                            <label
                              className={cn(
                                "flex items-start gap-3 px-4 py-2.5 transition-colors",
                                can ? "cursor-pointer hover:bg-hover-light" : "cursor-not-allowed",
                                checked && "bg-lime-wash/40",
                              )}
                            >
                              <input type="checkbox" className="peer sr-only" checked={checked} disabled={!can && !checked} onChange={() => toggle(p.id)} />
                              <span
                                aria-hidden
                                className={cn(
                                  "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-lime",
                                  checked ? "border-pine bg-pine text-lime" : "border-hairline bg-page",
                                  !can && !checked && "opacity-40",
                                )}
                              >
                                {checked ? <Check className="size-3" strokeWidth={3.2} /> : null}
                              </span>
                              <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !can && !checked && "opacity-55")}>
                                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] leading-[19px] text-ink">
                                  {p.label}
                                  {p.sensitive ? (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-caution-tint px-1.5 py-px text-[10.5px] font-semibold text-caution">
                                      <ShieldAlert aria-hidden className="size-3" strokeWidth={2.2} />
                                      Handle with care
                                    </span>
                                  ) : null}
                                  {p.soon ? <span className="rounded-pill bg-inert-tint px-1.5 py-px text-[10.5px] font-medium text-inert">Coming soon</span> : null}
                                  {!p.soon && !p.allowed ? <span className="rounded-pill bg-inert-tint px-1.5 py-px text-[10.5px] font-medium text-inert">Not for your role</span> : null}
                                </span>
                                <code className="truncate font-mono text-[11.5px] text-slate">{p.id}</code>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
            {sensitiveOn.length ? (
              <p className="m-0 flex items-start gap-2 rounded-[12px] bg-caution-tint px-3.5 py-2.5 text-[12.5px] leading-[18px] text-caution">
                <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2} />
                {`This key can ${sensitiveOn.map((p) => p.label.charAt(0).toLowerCase() + p.label.slice(1)).join("; ")}. Give it only to a server that needs it.`}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Rate limit" htmlFor="key-rate" hint={`Requests per minute, ${catalog.rate.min} to ${catalog.rate.max}. Past it, calls get 429 until the minute resets.`}>
              <span className="flex items-center gap-2">
                <span className="relative flex min-w-0 flex-1 items-center">
                  <Gauge aria-hidden className="pointer-events-none absolute left-3 size-[17px] text-slate" strokeWidth={1.6} />
                  <input
                    id="key-rate"
                    type="number"
                    inputMode="numeric"
                    min={catalog.rate.min}
                    max={catalog.rate.max}
                    required
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className={cn(INPUT, "tnum pr-16 pl-10")}
                  />
                  <span className="pointer-events-none absolute right-3 text-[12.5px] text-slate">/ min</span>
                </span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {catalog.rate.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setRate(String(o))}
                    className={cn(
                      "tnum inline-flex h-7 items-center rounded-pill border px-2.5 text-[12px]",
                      String(o) === rate ? "border-pine/25 bg-lime-tint font-medium text-pine" : "border-hairline bg-page text-pine hover:bg-hover-light",
                    )}
                  >
                    {o}
                  </button>
                ))}
              </span>
            </Field>

            <Field label="Expiry" htmlFor="key-exp" hint="Optional. The key stops working at this moment (your local time).">
              <span className="relative flex items-center">
                <Clock aria-hidden className="pointer-events-none absolute left-3 size-[17px] text-slate" strokeWidth={1.6} />
                <input
                  id="key-exp"
                  type="datetime-local"
                  min={soonest}
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className={cn(INPUT, "pl-10")}
                />
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {[
                  ["30 days", 30],
                  ["90 days", 90],
                  ["1 year", 365],
                ].map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setExpires(localMoment(new Date(Date.now() + Number(days) * DAY)))}
                    className="inline-flex h-7 items-center rounded-pill border border-hairline bg-page px-2.5 text-[12px] text-pine hover:bg-hover-light"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setExpires("")}
                  className={cn(
                    "inline-flex h-7 items-center rounded-pill border px-2.5 text-[12px]",
                    !expires ? "border-pine/25 bg-lime-tint font-medium text-pine" : "border-hairline bg-page text-pine hover:bg-hover-light",
                  )}
                >
                  Never
                </button>
              </span>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="IP allow-list"
              htmlFor="key-ips"
              hint={
                <>
                  Optional, one per line: an address (203.0.113.10) or a range (203.0.113.0/24). Empty accepts calls from anywhere.
                  {ipLines.length ? <span className="tnum block font-medium text-pine">{`${ipLines.length} of up to ${catalog.max_ips}`}</span> : null}
                </>
              }
            >
              <textarea
                id="key-ips"
                rows={3}
                spellCheck={false}
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                placeholder="203.0.113.10"
                className="w-full resize-y rounded-[10px] border border-hairline bg-panel px-3 py-2 font-mono text-[13px] text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
              />
            </Field>
            <Field label="Spend cap" htmlFor="key-cap" hint={`Optional, in credits. ${catalog.spend_cap_note}`}>
              <span className="relative flex items-center">
                <Wallet aria-hidden className="pointer-events-none absolute left-3 size-[17px] text-slate" strokeWidth={1.6} />
                <input
                  id="key-cap"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="No cap"
                  className={cn(INPUT, "tnum pl-10")}
                />
              </span>
            </Field>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-rule px-6 py-4">
          {needCode ? <TwoFactorStep hasTwoFactor={needCode.has} onVerified={() => { setNeedCode(null); formRef.current?.requestSubmit(); }} /> : <ErrorNote error={error} />}
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button type="button" onClick={onClose} className={SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim() || perms.size === 0 || products.length === 0} className={PRIMARY}>
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.4} /> : <KeyRound aria-hidden className="size-4" strokeWidth={2} />}
              {mode === "create" ? "Create key" : "Save changes"}
            </button>
          </div>
        </footer>
    </form>
  );
}

/* ----------------------------------------------------------------------------
   The secret, once
---------------------------------------------------------------------------- */

export function RevealDialog({
  open,
  secret,
  row,
  rotated,
  onClose,
}: {
  open: boolean;
  secret: string | null;
  row: KeyRow | null;
  rotated: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={() => undefined} dismissible={false} labelledBy="reveal-title" width={620}>
      <RevealBody secret={secret} row={row} rotated={rotated} onClose={onClose} />
    </Modal>
  );
}

function RevealBody({ secret, row, rotated, onClose }: { secret: string | null; row: KeyRow | null; rotated: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const until = row?.rotating_until ? new Date(row.rotating_until) : null;
  return (
    <div className="flex flex-col">
        <DialogHeader
          id="reveal-title"
          title={rotated ? "Your new secret" : "Your new API key"}
          sub={
            row ? (
              <span className="inline-flex items-center gap-2">
                {row.name} <EnvChip env={row.env} />
              </span>
            ) : null
          }
        />
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="m-0 flex items-start gap-2 rounded-[12px] bg-caution-tint px-3.5 py-3 text-[13px] leading-[19px] text-caution">
            <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2} />
            This is the only time this secret is shown. Copy it now into your server&apos;s secret store. We keep only a fingerprint of it, so it
            cannot be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-[14px] border border-edge bg-code-bg p-2 pl-3.5">
            <code className="min-w-0 flex-1 font-mono text-[13px] break-all text-code-ink select-all">{secret}</code>
            <button type="button" onClick={() => void copy()} className={cn(PRIMARY, "h-9 shrink-0 px-4")}>
              {copied ? <Check aria-hidden className="size-4" strokeWidth={2.6} /> : <Copy aria-hidden className="size-4" strokeWidth={2} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-pine">Send it on every call as</span>
            <code className="rounded-[10px] bg-well px-3 py-2 font-mono text-[12.5px] text-pine">Authorization: Bearer {row?.key ?? "sk_test_..."}</code>
          </div>
          {rotated ? (
            <p className="m-0 text-[13px] leading-[19px] text-slate">
              {until
                ? `The previous secret keeps working until ${until.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Switch your servers before then.`
                : "The previous secret stopped working just now."}
            </p>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-[#0e3228]" />
            I have stored this secret safely
          </label>
        </div>
        <footer className="flex justify-end border-t border-rule px-6 py-4">
          <button type="button" onClick={onClose} disabled={!saved} className={PRIMARY}>
            Done
          </button>
        </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Rotate
---------------------------------------------------------------------------- */

const GRACE_WORDS: Record<number, [string, string]> = {
  0: ["Immediately", "The current secret stops working now."],
  1: ["1 hour", "For a quick swap on one server."],
  24: ["24 hours", "Recommended: time to roll out to every server."],
  72: ["3 days", "For deploys that take longer."],
  168: ["7 days", "For partners who need notice."],
};

export function RotateDialog({
  open,
  row,
  grace,
  onClose,
  onDone,
}: {
  open: boolean;
  row: KeyRow | null;
  grace: number[];
  onClose: () => void;
  onDone: (row: KeyRow, secret: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="rotate-title" width={560}>
      <RotateBody row={row} grace={grace} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function RotateBody({
  row,
  grace,
  onClose,
  onDone,
}: {
  row: KeyRow | null;
  grace: number[];
  onClose: () => void;
  onDone: (row: KeyRow, secret: string) => void;
}) {
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState<{ has: boolean } | null>(null);
  async function go() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const r = await keysApi.rotate(row.id, hours);
      onDone(r.key, r.secret);
    } catch (e) {
      if (e instanceof KeysError && e.code === "mfa_required") {
        setNeedCode({ has: !!e.hasTwoFactor });
        setError(null);
      } else setError(message(e));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col">
        <DialogHeader id="rotate-title" title="Rotate key" onClose={onClose} sub={row ? `${row.name}: a new secret, same scope and limits.` : null} />
        <div className="flex flex-col gap-3 px-6 py-5">
          <span className="text-[13.5px] font-medium text-pine">How long should the current secret keep working?</span>
          <div role="radiogroup" aria-label="Grace window" className="flex flex-col gap-2">
            {grace.map((h) => {
              const [label, note] = GRACE_WORDS[h] ?? [`${h} hours`, ""];
              const on = h === hours;
              return (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setHours(h)}
                  className={cn(
                    "flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors",
                    on ? "border-pine/30 bg-lime-tint" : "border-hairline bg-page hover:bg-hover-light",
                  )}
                >
                  <span aria-hidden className={cn("grid size-[18px] place-items-center rounded-pill border-[1.5px]", on ? "border-pine" : "border-hairline")}>
                    {on ? <span className="size-2 rounded-pill bg-pine" /> : null}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13.5px] font-medium text-pine">{label}</span>
                    <span className="text-[12px] text-slate">{note}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {needCode ? <TwoFactorStep hasTwoFactor={needCode.has} onVerified={() => { setNeedCode(null); void go(); }} /> : <ErrorNote error={error} />}
        </div>
        <footer className="flex justify-end gap-2.5 border-t border-rule px-6 py-4">
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={() => void go()} disabled={busy} className={PRIMARY}>
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.4} /> : <RefreshCw aria-hidden className="size-4" strokeWidth={2} />}
            Rotate key
          </button>
        </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Revoke
---------------------------------------------------------------------------- */

export function RevokeDialog({
  open,
  row,
  onClose,
  onDone,
}: {
  open: boolean;
  row: KeyRow | null;
  onClose: () => void;
  onDone: (row: KeyRow) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="revoke-title" width={520}>
      <RevokeBody row={row} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function RevokeBody({ row, onClose, onDone }: { row: KeyRow | null; onClose: () => void; onDone: (row: KeyRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const r = await keysApi.revoke(row.id);
      onDone(r.key);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col">
        <DialogHeader id="revoke-title" title={row ? `Revoke ${row.name}?` : "Revoke key"} onClose={onClose} />
        <div className="flex flex-col gap-3 px-6 py-5">
          <p className="m-0 text-[14px] leading-[21px] text-ink-muted">
            Every server using <code className="rounded-[6px] bg-well px-1.5 py-0.5 font-mono text-[12.5px] text-pine">{row?.key}</code> gets
            401 from its next call. Revoking cannot be undone; create a new key if you need one again.
          </p>
          <ErrorNote error={error} />
        </div>
        <footer className="flex justify-end gap-2.5 border-t border-rule px-6 py-4">
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={() => void go()} disabled={busy} className={DANGER}>
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.4} /> : null}
            Revoke key
          </button>
        </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Activity: the audit trail of one key
---------------------------------------------------------------------------- */

const ACTION_WORDS: Record<string, string> = {
  "key.created": "Created",
  "key.updated": "Scope or limits changed",
  "key.rotated": "Secret rotated",
  "key.revoked": "Revoked",
};

function describe(e: KeyEvent): string {
  const d = e.detail;
  if (e.action === "key.rotated") {
    const g = Number(d["grace_hours"] ?? 0);
    return g ? `Previous secret kept for ${g} hour${g === 1 ? "" : "s"}` : "Previous secret stopped at once";
  }
  if (e.action === "key.updated") {
    const words: Record<string, string> = {
      name: "name",
      permissions: "permissions",
      products: "products",
      rate_per_min: "rate limit",
      ip_allow: "IP allow-list",
      expires_at: "expiry",
      spend_cap: "spend cap",
    };
    return Object.keys(d)
      .map((k) => words[k] ?? k)
      .join(", ");
  }
  if (e.action === "key.created") {
    const perms = Array.isArray(d["permissions"]) ? d["permissions"].length : 0;
    return `${String(d["env"] ?? "")} key, ${perms} permission${perms === 1 ? "" : "s"}, ${String(d["rate_per_min"] ?? "")}/min`;
  }
  return "";
}

export function ActivityDialog({ open, row, onClose }: { open: boolean; row: KeyRow | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="activity-title" width={600}>
      <ActivityBody row={row} onClose={onClose} />
    </Modal>
  );
}

function ActivityBody({ row, onClose }: { row: KeyRow | null; onClose: () => void }) {
  const [events, setEvents] = useState<KeyEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    let live = true;
    keysApi
      .events(row.id)
      .then((r) => {
        if (live) setEvents(r.events);
      })
      .catch((e: unknown) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [row]);
  return (
      <div className="flex max-h-[80dvh] flex-col">
        <DialogHeader id="activity-title" title="Key activity" onClose={onClose} sub={row ? `${row.name}: every change, who made it and when.` : null} />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-width:thin]">
          <ErrorNote error={error} />
          {!events && !error ? (
            <p className="m-0 flex items-center gap-2 text-[13px] text-slate">
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} />
              Please wait...
            </p>
          ) : null}
          {events ? (
            <ol className="m-0 flex list-none flex-col p-0">
              {events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
                  <span aria-hidden className="relative mt-1.5 flex flex-col items-center">
                    <span className={cn("size-2.5 rounded-pill", e.action === "key.revoked" ? "bg-danger" : "bg-ramp-3")} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13.5px] font-medium text-pine">{ACTION_WORDS[e.action] ?? e.action}</span>
                    {describe(e) ? <span className="text-[12.5px] text-ink-muted">{describe(e)}</span> : null}
                    <span className="text-[12px] text-slate">
                      {new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}, by {e.actor}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
  );
}

/**
 * A key hands out a secret, so creating or rotating one needs two-factor sign-in. Instead of a dead end: with
 * two-factor set up, the authenticator's code is asked for right here (the session is confirmed and the action runs
 * again); without it, the way to set it up.
 */
function TwoFactorStep({ hasTwoFactor, onVerified }: { hasTwoFactor: boolean; onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!hasTwoFactor)
    return (
      <div role="alert" className="flex flex-col gap-2.5 rounded-[12px] border border-caution/40 bg-caution-tint px-4 py-3.5">
        <p className="m-0 text-[13.5px] font-medium text-pine">API keys need two-factor sign-in on your account</p>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-pine/80">
          <li>Open Settings, Security, and turn on two-factor sign-in (scan the QR code with Google Authenticator, Microsoft Authenticator or Authy).</li>
          <li>Come back and create the key again: you will be asked for the 6-digit code once.</li>
        </ol>
        <a
          href="/settings/security/"
          className="inline-flex h-9 w-fit items-center rounded-pill bg-pine px-4 text-[13px] font-medium text-white transition-[filter] hover:brightness-110"
        >
          Set up two-factor
        </a>
      </div>
    );
  const verify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setErr(null);
    const r = await stepUpTwoFactor(code);
    setBusy(false);
    if (r.ok) onVerified();
    else {
      setErr(r.message);
      setCode("");
    }
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-lime bg-lime-tint px-4 py-3.5">
      <p className="m-0 text-[13.5px] font-medium text-pine">Confirm it is you</p>
      <p className="m-0 text-[13px] text-pine/80">A key hands out a secret. Enter the 6-digit code from your authenticator app to continue.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Two-factor code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void verify();
            }
          }}
          placeholder="000000"
          className="tnum h-10 w-36 rounded-[10px] border border-hairline bg-white px-3 text-center text-[17px] tracking-[0.3em] text-pine outline-none focus-visible:ring-2 focus-visible:ring-lime"
        />
        <button
          type="button"
          onClick={() => void verify()}
          disabled={code.length !== 6 || busy}
          className="inline-flex h-10 items-center gap-2 rounded-pill bg-pine px-4 text-[13px] font-medium text-white disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Verify and continue
        </button>
      </div>
      {err ? <p role="alert" className="m-0 text-[12.5px] text-danger">{err}</p> : null}
    </div>
  );
}
