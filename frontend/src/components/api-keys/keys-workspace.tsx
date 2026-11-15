"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, History, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw } from "lucide-react";

import { ActivityDialog, KeyFormDialog, RevealDialog, RevokeDialog, RotateDialog } from "@/components/api-keys/key-dialogs";
import { EnvChip, StatusChip } from "@/components/api-keys/parts";
import type { KeyRow, KeysCatalog } from "@/lib/console/keys-api";
import { KeysError, keysApi } from "@/lib/console/keys-api";
import { cn } from "@/lib/utils";

/**
 * API Keys, live: the table and every action on it, against the key service (through the console).
 *
 * The header (title + tab strip) arrives from the server page as nodes; this component adds the Create button
 * to it because the button, the table and the dialogs share one state (the catalog, the list, the open dialog).
 * Keys arrive masked; a whole secret exists only inside RevealDialog, right after create or rotate.
 */

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; row: KeyRow }
  | { kind: "rotate"; row: KeyRow }
  | { kind: "revoke"; row: KeyRow }
  | { kind: "activity"; row: KeyRow }
  | { kind: "reveal"; row: KeyRow; secret: string; rotated: boolean };

// The columns and their widths are the Figma frame's (Desktop-48, "Table"); the widths become `fr` ratios. Actions is a
// little wider than the frame's to fit the "more" button that holds Edit, Rotate and Activity.
const COLUMNS: { key: string; header: string; width: number; align?: "right" }[] = [
  { key: "name", header: "Name", width: 220 },
  { key: "key", header: "Key", width: 171 },
  { key: "env", header: "Env", width: 67 },
  { key: "scope", header: "Scope", width: 161 },
  { key: "rate", header: "Rate limit", width: 99, align: "right" },
  { key: "lastUsed", header: "Last used", width: 149 },
  { key: "status", header: "Status", width: 91 },
  { key: "actions", header: "Actions", width: 214, align: "right" },
];

const PRODUCT_NAMES: Record<string, string> = { kyc: "KYC", micr: "MICR", mrz: "MRZ", scan2pay: "Scan-to-Pay" };

/** "2026-07-21 09:14", the frame's format, in the viewer's time zone. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < -60) {
    // a time still ahead (a rotation's grace window)
    const a = -s;
    if (a < 3600) return `in ${Math.ceil(a / 60)} min`;
    if (a < 86_400) return `in ${Math.round(a / 3600)} h`;
    return `in ${Math.round(a / 86_400)} d`;
  }
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

const fullDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

export function KeysWorkspace({ title, tabs, createLabel }: { title: React.ReactNode; tabs: React.ReactNode; createLabel: string }) {
  const [catalog, setCatalog] = useState<KeysCatalog | null>(null);
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });

  // the catalog (what this person may grant) and the keys, loaded together; `attempt` re-runs it after an error
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([keysApi.catalog(), keysApi.list()])
      .then(([c, l]) => {
        if (!live) return;
        setError(null);
        setCatalog(c);
        setRows(l.keys);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof KeysError ? { code: e.code, message: e.message } : { code: "error", message: "API keys could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const upsert = (row: KeyRow) => setRows((rs) => (rs ? (rs.some((r) => r.id === row.id) ? rs.map((r) => (r.id === row.id ? row : r)) : [row, ...rs]) : [row]));
  const close = () => setDialog({ kind: "none" });
  const canManage = !!catalog?.can_manage;

  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">{title}</div>
          <button
            type="button"
            onClick={() => setDialog({ kind: "create" })}
            disabled={!catalog || !canManage}
            title={catalog && !canManage ? "Your role cannot manage API keys." : undefined}
            className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3.5 text-micro font-semibold text-pine shadow-cta transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden className="size-[15px]" strokeWidth={2.4} />
            {createLabel}
          </button>
        </div>
        {tabs}
      </header>

      {catalog && !canManage ? (
        <p className="m-0 rounded-[12px] bg-info-tint px-4 py-2.5 text-[13px] text-info">Your role can see API keys but not change them.</p>
      ) : null}

      {error ? (
        <section className="flex flex-col items-start gap-3 rounded-shell border border-hairline bg-page p-6">
          <h2 className="m-0 text-[16px] font-medium text-pine">API keys could not be loaded</h2>
          <p className="m-0 text-[13.5px] text-ink-muted">{error.message}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRows(null);
              setAttempt((n) => n + 1);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline bg-page px-4 text-[13px] font-medium text-pine hover:bg-hover-light"
          >
            <RefreshCw aria-hidden className="size-4" strokeWidth={2} />
            Try again
          </button>
        </section>
      ) : !rows ? (
        <section aria-busy="true" className="overflow-hidden rounded-shell border border-hairline bg-page">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-edge px-5 py-4 last:border-0">
              <span className="h-4 w-40 animate-pulse rounded-pill bg-well" />
              <span className="h-4 w-56 animate-pulse rounded-pill bg-well" />
              <span className="h-4 w-16 animate-pulse rounded-pill bg-well" />
              <span className="ml-auto h-7 w-44 animate-pulse rounded-pill bg-well" />
            </div>
          ))}
          <p className="sr-only">Please wait, loading API keys.</p>
        </section>
      ) : rows.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-shell border border-hairline bg-page px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-pill bg-lime-tint text-pine">
            <KeyRound aria-hidden className="size-6" strokeWidth={1.8} />
          </span>
          <h2 className="m-0 text-[17px] font-medium text-pine">No API keys yet</h2>
          <p className="m-0 max-w-[52ch] text-[13.5px] leading-[20px] text-ink-muted">
            Create a test key to call the sandbox from your server. Live keys open once your account is subscribed.
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className="mt-1 inline-flex h-10 items-center gap-2 rounded-pill bg-lime px-5 text-[14px] font-semibold text-pine shadow-cta hover:brightness-95"
            >
              <Plus aria-hidden className="size-4" strokeWidth={2.4} />
              Create your first key
            </button>
          ) : null}
        </section>
      ) : (
        <KeysGrid rows={rows} canManage={canManage} onAction={setDialog} />
      )}

      {catalog ? (
        <>
          <KeyFormDialog
            open={dialog.kind === "create"}
            mode="create"
            catalog={catalog}
            onClose={close}
            onDone={(row, secret) => {
              upsert(row);
              setDialog(secret ? { kind: "reveal", row, secret, rotated: false } : { kind: "none" });
            }}
          />
          <KeyFormDialog
            open={dialog.kind === "edit"}
            mode="edit"
            catalog={catalog}
            initial={dialog.kind === "edit" ? dialog.row : undefined}
            onClose={close}
            onDone={(row) => {
              upsert(row);
              close();
            }}
          />
          <RotateDialog
            open={dialog.kind === "rotate"}
            row={dialog.kind === "rotate" ? dialog.row : null}
            grace={catalog.grace_hours}
            onClose={close}
            onDone={(row, secret) => {
              upsert(row);
              setDialog({ kind: "reveal", row, secret, rotated: true });
            }}
          />
        </>
      ) : null}
      <RevokeDialog
        open={dialog.kind === "revoke"}
        row={dialog.kind === "revoke" ? dialog.row : null}
        onClose={close}
        onDone={(row) => {
          upsert(row);
          close();
        }}
      />
      <ActivityDialog open={dialog.kind === "activity"} row={dialog.kind === "activity" ? dialog.row : null} onClose={close} />
      <RevealDialog
        open={dialog.kind === "reveal"}
        secret={dialog.kind === "reveal" ? dialog.secret : null}
        row={dialog.kind === "reveal" ? dialog.row : null}
        rotated={dialog.kind === "reveal" && dialog.rotated}
        onClose={close}
      />
    </div>
  );
}

/**
 * The keys table as the Figma frame draws it: Name, Key, Env, Scope, Rate limit, Last used, Status, Actions, one line
 * per key, Copy (lime) and Revoke in the actions. Edit, Rotate and Activity sit behind the "more" button beside them.
 * Copy hands over the key's ID: the secret itself is never in the list (it is shown once, when created or rotated).
 */
function KeysGrid({ rows, canManage, onAction }: { rows: KeyRow[]; canManage: boolean; onAction: (d: Dialog) => void }) {
  const template = COLUMNS.map((c) => `${c.width}fr`).join(" ");
  return (
    <section className="overflow-hidden rounded-shell border border-hairline bg-page">
      <div className="overflow-x-auto">
        <div role="table" aria-label="API keys" style={{ minWidth: 1068 }}>
          <div role="row" className="grid items-center gap-x-3 border-b border-edge bg-panel px-3 py-3" style={{ gridTemplateColumns: template }}>
            {COLUMNS.map((c) => (
              <span
                key={c.key}
                role="columnheader"
                className={cn("text-[12px] leading-[16px] text-keycap-ink", c.align === "right" ? "text-right" : "text-left")}
              >
                {c.header}
              </span>
            ))}
          </div>
          <div role="rowgroup">
            {rows.map((r) => {
              const active = r.status === "active";
              const detail = [
                r.permissions.join("\n"),
                r.products.map((p) => PRODUCT_NAMES[p] ?? p).join(", "),
                r.ip_allow.length ? `Allowed IPs: ${r.ip_allow.join(", ")}` : null,
                r.expires_at ? `Expires ${fullDate(r.expires_at)}` : null,
              ]
                .filter(Boolean)
                .join("\n");
              return (
                <div
                  key={r.id}
                  role="row"
                  className="grid min-h-[57px] items-center gap-x-3 border-b border-edge px-3 py-[12.5px] transition-colors last:border-b-0 hover:bg-hover-light"
                  style={{ gridTemplateColumns: template }}
                >
                  <div role="cell" className="min-w-0">
                    <span className="block truncate text-body font-medium text-pine" title={`${r.name}\nCreated ${fullDate(r.created_at)} by ${r.created_by}`}>
                      {r.name}
                    </span>
                  </div>
                  <div role="cell" className="min-w-0">
                    <span className="tnum block truncate font-mono text-[12px] leading-[16px] text-pine">{r.key}</span>
                  </div>
                  <div role="cell">
                    <EnvChip env={r.env} />
                  </div>
                  <div role="cell" className="min-w-0" title={detail}>
                    <span className="block truncate text-[12px] leading-[16px] text-pine">{r.scope}</span>
                  </div>
                  <div role="cell" className="text-right">
                    <span className="tnum text-body text-pine">{r.rate_per_min}/min</span>
                  </div>
                  <div role="cell" className="min-w-0">
                    {r.last_used_at ? (
                      <span className="tnum block truncate text-[12px] leading-[16px] text-ink-soft" title={when(r.last_used_at)}>
                        {stamp(r.last_used_at)}
                      </span>
                    ) : (
                      <span className="text-[12px] leading-[16px] text-ink-soft">
                        -<span className="sr-only">Never used</span>
                      </span>
                    )}
                  </div>
                  <div
                    role="cell"
                    className="min-w-0"
                    title={r.rotating_until && active ? `Rotated: the previous secret works until ${fullDate(r.rotating_until)}` : undefined}
                  >
                    <StatusChip status={r.status} />
                  </div>
                  <div role="cell" className="flex items-center justify-end gap-2">
                    <CopyIdButton id={r.id} name={r.name} />
                    <button
                      type="button"
                      disabled={!active || !canManage}
                      onClick={() => onAction({ kind: "revoke", row: r })}
                      title={active && !canManage ? "Your role cannot revoke keys." : undefined}
                      className="inline-flex h-8 items-center justify-center rounded-[10px] border border-hairline bg-panel px-3 text-[12px] leading-[16px] text-pine transition-colors hover:bg-hover-panel disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-panel"
                    >
                      {active ? "Revoke" : r.status === "expired" ? "Expired" : "Revoked"}
                      <span className="sr-only"> {r.name}</span>
                    </button>
                    <MoreMenu row={r} canManage={canManage && active} onAction={onAction} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CopyIdButton({ id, name }: { id: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      title="Copy the key ID"
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => setCopied(true), () => undefined);
      }}
      className="inline-flex h-8 items-center justify-center gap-[5px] rounded-[10px] bg-lime px-3 text-[12px] leading-[16px] text-pine transition-[filter] hover:brightness-95"
    >
      {copied ? <Check aria-hidden className="size-3" strokeWidth={2.4} /> : <Copy aria-hidden className="size-3" strokeWidth={2} />}
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> the ID of {name}</span>
    </button>
  );
}

/** Edit, Rotate (active keys, roles that manage keys) and Activity (everyone), in a menu fixed to the viewport so the
 *  table's rounded, clipped edge never cuts it off. */
function MoreMenu({ row, canManage, onAction }: { row: KeyRow; canManage: boolean; onAction: (d: Dialog) => void }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const items: { label: string; icon: typeof Pencil; run: () => void }[] = [
    ...(canManage
      ? [
          { label: "Edit", icon: Pencil, run: () => onAction({ kind: "edit", row }) },
          { label: "Rotate", icon: RefreshCw, run: () => onAction({ kind: "rotate", row }) },
        ]
      : []),
    { label: "Activity", icon: History, run: () => onAction({ kind: "activity", row }) },
  ];

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={`More actions for ${row.name}`}
        title="More"
        onClick={() => {
          if (at) return setAt(null);
          const b = button.current?.getBoundingClientRect();
          if (b) setAt({ top: b.bottom + 6, right: window.innerWidth - b.right });
        }}
        className={cn(
          "grid size-8 place-items-center rounded-[10px] border border-hairline bg-panel text-pine transition-colors hover:bg-hover-panel",
          at && "bg-hover-panel",
        )}
      >
        <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
      </button>
      {at ? (
        <div
          ref={menu}
          role="menu"
          aria-label={`Actions for ${row.name}`}
          style={{ position: "fixed", top: at.top, right: at.right }}
          className="z-50 flex min-w-[160px] flex-col gap-0.5 rounded-[12px] border border-hairline bg-page p-1 shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)]"
        >
          {items.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                setAt(null);
                run();
              }}
              className="flex h-9 items-center gap-2.5 rounded-[8px] px-3 text-left text-[13px] text-pine transition-colors hover:bg-hover-light focus-visible:bg-hover-light focus-visible:outline-none"
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
