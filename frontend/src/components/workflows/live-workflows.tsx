"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Archive, ArchiveRestore, Loader2, MoreHorizontal, PencilLine, Plus, Search, ShieldOff, TextCursorInput, Trash2, X } from "lucide-react";

import { Drawer } from "@/components/explorer/kit";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/verifications/live";
import { CheckBadge } from "@/components/ui/component-icon";
import { FatfReview } from "@/components/workflows/fatf-review";
import { WorkflowGlyph } from "@/components/workflows/workflow-glyph";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/access";
import type { ComponentIcon, WorkflowsData } from "@/lib/console/types";
import { bannerOf } from "@/lib/console/workflow-banners";
import { priceRange, updatedAgo, workflowsApi, type ArchivedWorkflow, type Catalogue, type WorkflowListItem } from "@/lib/console/workflows-api";
import { cn } from "@/lib/utils";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; list: WorkflowListItem[]; catalogue: Catalogue };

const STATUSES = ["All statuses", "Published", "Draft"] as const;
/** The filter's words to the stored status (a published workflow is stored as "active"). */
const STATUS_OF: Record<string, string> = { Published: "active", Draft: "draft" };
const COLUMNS = [
  { key: "select", header: "" },
  { key: "workflow", header: "Workflow" },
  { key: "status", header: "Status" },
  { key: "checks", header: "Checks" },
  { key: "version", header: "Version" },
  { key: "price", header: "Price" },
  { key: "uses", header: "Verifications", right: true },
  { key: "used", header: "Last used" },
  { key: "actions", header: "" },
] as const;
const TEMPLATE = "20px minmax(240px,2.4fr) minmax(150px,1.25fr) minmax(140px,1.5fr) minmax(64px,0.6fr) 1.15fr 0.9fr 1fr 44px";

/** "3 hours ago" (updatedAgo without its verb). */
const ago = (iso: string) => updatedAgo(iso).replace(/^Updated /, "");

/**
 * The organisation's workflows as a table, most recently used first: what each one checks, its
 * version, price, how many verifications ran on it and when it was last used. "Create new
 * workflow" opens the gallery of ready-made ones (or one built from scratch); a row opens the
 * workflow in the editor.
 */
export function LiveWorkflows({ copy }: { copy: WorkflowsData }) {
  // a role that may only look (Reviewer, Viewer) opens workflows in the editor read-only
  const canManage = useAccess().can("workflows.manage");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(STATUSES[0]);
  const [renaming, setRenaming] = useState<WorkflowListItem | null>(null);
  // the rows ticked for a batch action, the batch confirmation, and the Archived panel
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archived, setArchived] = useState<ArchivedWorkflow[] | null>(null);

  const loadArchived = useCallback(async () => {
    const a = await workflowsApi.archived();
    setArchived(a.ok ? a.data.workflows : []);
  }, []);

  const refresh = useCallback(async () => {
    const [l, c] = await Promise.all([workflowsApi.list(), workflowsApi.catalogue()]);
    if (!l.ok) return setLoad({ state: "error", message: l.message });
    if (!c.ok) return setLoad({ state: "error", message: c.message });
    setLoad({ state: "ready", list: l.data.workflows, catalogue: c.data });
    // a row that left the list (archived) is no longer ticked
    setPicked((p) => new Set([...p].filter((id) => l.data.workflows.some((w) => w.id === id))));
    void loadArchived();
  }, [loadArchived]);

  useEffect(() => {
    void Promise.all([workflowsApi.list(), workflowsApi.catalogue()]).then(([l, c]) => {
      if (!l.ok) return setLoad({ state: "error", message: l.message });
      if (!c.ok) return setLoad({ state: "error", message: c.message });
      setLoad({ state: "ready", list: l.data.workflows, catalogue: c.data });
    });
    void loadArchived();
  }, [loadArchived]);

  const rows = useMemo(() => {
    if (load.state !== "ready") return [];
    const q = query.trim().toLowerCase();
    return load.list.filter(
      (w) => (status === STATUSES[0] || w.status === STATUS_OF[status]) && (!q || w.name.toLowerCase().includes(q)),
    );
  }, [load, query, status]);

  if (load.state === "loading") return <Card icon={Loader2} title="Loading workflows" />;
  if (load.state === "error") return <Card icon={ShieldOff} title={load.message} />;

  const { list, catalogue } = load;
  const checkName = new Map(catalogue.checks.map((c) => [c.id, c.name]));
  const templateName = new Map(catalogue.templates.map((t) => [t.id, t.name]));
  const published = list.filter((w) => w.status === "active").length;
  const drafts = list.filter((w) => w.status === "draft").length;

  const archive = async (w: WorkflowListItem) => {
    const r = await workflowsApi.archive(w.id);
    if (!r.ok) {
      toast.error("Couldn't archive", r.message);
      return;
    }
    toast.success(`${w.name} archived`, "New verifications can no longer use it; finished ones keep it.");
    await refresh();
  };

  const archivePicked = async () => {
    setBatchBusy(true);
    const r = await workflowsApi.archiveMany([...picked]);
    setBatchBusy(false);
    setConfirmBatch(false);
    if (!r.ok) {
      toast.error("Couldn't archive", r.message);
      return;
    }
    toast.success(
      `${r.data.archived} workflow${r.data.archived === 1 ? "" : "s"} archived`,
      "New verifications can no longer use them; finished ones keep them. Find them under Archived.",
    );
    setPicked(new Set());
    await refresh();
  };
  const allShownPicked = rows.length > 0 && rows.every((w) => picked.has(w.id));
  const toggleAll = () =>
    setPicked((p) => {
      const next = new Set(p);
      if (allShownPicked) rows.forEach((w) => next.delete(w.id));
      else rows.forEach((w) => next.add(w.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{copy.title}</h1>
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-micro text-crumb">
            <WorkflowGlyph className="size-3.5" strokeWidth={1.7} />
            {copy.countLabel}
            <span className="tnum font-medium text-pine">{list.length}</span>
            <span className="text-muted">
              ({published} published, {drafts} draft{drafts === 1 ? "" : "s"}, most recently used first)
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* the archived workflows open in the side panel, where they can be restored or deleted */}
          <button
            type="button"
            onClick={() => {
              setArchivedOpen(true);
              void loadArchived();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline bg-page px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel"
          >
            <Archive aria-hidden className="size-4" strokeWidth={1.8} />
            Archived
            {archived?.length ? <span className="tnum rounded-pill bg-pine/8 px-2 py-0.5 text-micro text-pine">{archived.length}</span> : null}
          </button>
          {canManage && (
            <Link
              href="/workflows/templates/"
              className="inline-flex h-10 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95"
            >
              <Plus aria-hidden className="size-4" strokeWidth={2.2} />
              {copy.newLabel}
            </Link>
          )}
        </div>
      </header>

      <FatfReview />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[240px] flex-1 items-center">
          <span className="sr-only">Search workflows</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows by name"
            className="h-full w-full rounded-pill border border-hairline bg-page pr-10 pl-4 text-body text-pine placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          />
          <Search aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-icon-soft" strokeWidth={1.8} />
        </label>
        <Select
          label="Status"
          options={STATUSES}
          value={status}
          onValueChange={setStatus}
          className="h-9 rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-body text-pine focus:border-pine/30"
        />
      </div>

      {canManage && picked.size > 0 ? (
        <div role="region" aria-label="Selected workflows" className="flex flex-wrap items-center gap-3 rounded-shell border border-hairline bg-panel px-4 py-2.5">
          <span className="text-body font-medium text-pine">
            {picked.size} selected
          </span>
          {confirmBatch ? (
            <>
              <span className="text-body text-slate">
                Archive {picked.size} workflow{picked.size === 1 ? "" : "s"}? New verifications will no longer use {picked.size === 1 ? "it" : "them"}.
              </span>
              <button
                type="button"
                disabled={batchBusy}
                onClick={archivePicked}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-pine px-3.5 text-micro font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {batchBusy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Archive aria-hidden className="size-3.5" strokeWidth={1.9} />}
                Archive
              </button>
              <button type="button" onClick={() => setConfirmBatch(false)} className="h-8 rounded-pill px-3 text-micro text-pine hover:bg-hover-panel">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmBatch(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-hairline bg-page px-3.5 text-micro font-medium text-pine transition-colors hover:bg-hover-panel"
              >
                <Archive aria-hidden className="size-3.5" strokeWidth={1.9} />
                Archive selected
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className="h-8 rounded-pill px-3 text-micro text-slate hover:bg-hover-panel">
                Clear selection
              </button>
            </>
          )}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-shell border border-hairline bg-page">
        <div className="overflow-x-auto">
          <div role="table" aria-label="Workflows" style={{ minWidth: 1080 }}>
            <div role="row" className="grid items-center gap-x-4 border-b border-edge bg-panel px-5 py-3" style={{ gridTemplateColumns: TEMPLATE }}>
              {COLUMNS.map((c) =>
                c.key === "select" ? (
                  <span key={c.key} role="columnheader" className="flex items-center">
                    {canManage && rows.length > 0 ? (
                      <Checkbox checked={allShownPicked} onCheckedChange={toggleAll} aria-label="Select every workflow shown" />
                    ) : null}
                  </span>
                ) : (
                  <span key={c.key} role="columnheader" className={cn("text-micro text-muted", "right" in c && c.right && "text-right")}>
                    {c.header}
                  </span>
                ),
              )}
            </div>

            <div role="rowgroup">
              {rows.length === 0 ? (
                <p className="m-0 px-5 py-12 text-center text-body text-slate">
                  {list.length === 0
                    ? "No workflows yet. A workflow shows here once you create one or run a verification with it."
                    : "No workflow matches your search."}
                </p>
              ) : (
                rows.map((w) => {
                  const href = `/workflows/edit/?id=${encodeURIComponent(w.id)}`;
                  const custom = !w.template || w.template === "blank";
                  const banner = custom ? null : bannerOf(w.template!);
                  return (
                    <div
                      key={w.id}
                      role="row"
                      className="relative grid items-center gap-x-4 border-b border-edge px-5 py-3 transition-colors last:border-b-0 hover:bg-hover-light"
                      style={{ gridTemplateColumns: TEMPLATE }}
                    >
                      {/* above the row's link, so ticking a row never opens it */}
                      <div role="cell" className="relative z-10 flex items-center">
                        {canManage ? (
                          <Checkbox checked={picked.has(w.id)} onCheckedChange={() => toggleOne(w.id)} aria-label={`Select ${w.name}`} />
                        ) : null}
                      </div>
                      <div role="cell" className="flex min-w-0 items-center gap-3">
                        {banner ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={banner} alt="" aria-hidden loading="lazy" className="h-10 w-16 shrink-0 rounded-[10px] object-cover ring-1 ring-pine/10" />
                        ) : (
                          <span aria-hidden className="grid h-10 w-16 shrink-0 place-items-center rounded-[10px] bg-pine text-lime">
                            <WorkflowGlyph className="size-5" />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col gap-1">
                          {/* the name's link covers the whole row, so any part of it opens the editor */}
                          <Link
                            href={href}
                            className="line-clamp-2 text-body font-medium [overflow-wrap:anywhere] text-pine after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-[6px] focus-visible:after:ring-2 focus-visible:after:ring-pine"
                          >
                            {w.name}
                          </Link>
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {w.isDefault ? (
                              <span
                                title="New verifications run this workflow when no other is picked."
                                className="rounded-pill bg-lime px-2 py-0.5 text-[11px] leading-4 font-medium text-pine"
                              >
                                Default
                              </span>
                            ) : null}
                            <span className="text-[11px] text-muted">
                              {custom ? "Custom" : `From ${templateName.get(w.template!) ?? "a template"}`}
                            </span>
                          </span>
                        </span>
                      </div>

                      <div role="cell" className="flex min-w-0 flex-col items-start gap-1">
                        <StatusChip published={w.status === "active"} />
                        {w.status === "active" && w.unpublishedChanges ? (
                          <span className="text-micro text-caution" title="Saved in the draft; publish to make verifications use them.">
                            Draft changes not published
                          </span>
                        ) : w.status === "draft" ? (
                          <span className="text-micro text-muted">Saved, not live yet</span>
                        ) : null}
                      </div>

                      <div role="cell" className="flex min-w-0 flex-wrap items-center gap-1">
                        {w.checks.slice(0, 5).map((id) => (
                          <span key={id} title={checkName.get(id) ?? id}>
                            <CheckBadge icon={id as ComponentIcon} />
                          </span>
                        ))}
                        {w.checks.length > 5 ? (
                          <span className="tnum rounded-pill bg-pine/8 px-1.5 py-0.5 text-[11px] text-pine">+{w.checks.length - 5}</span>
                        ) : null}
                      </div>

                      <div role="cell" className="tnum min-w-0 text-body whitespace-nowrap">
                        {w.version ? <span className="text-pine">v{w.version}</span> : <span className="text-muted">None yet</span>}
                      </div>

                      <div role="cell" className="tnum min-w-0 text-body text-pine">
                        {priceRange(w.priceRange ?? { min: w.price, max: w.price })}
                      </div>

                      <div role="cell" className="tnum text-right text-body text-pine">
                        {w.uses.toLocaleString()}
                      </div>

                      <div role="cell" className="min-w-0 text-body">
                        {w.lastUsedAt ? <span className="text-pine">{ago(w.lastUsedAt)}</span> : <span className="text-muted">Not used yet</span>}
                      </div>

                      <div role="cell" className="relative z-10 flex justify-end">
                        <RowMenu name={w.name} href={href} canManage={canManage} onRename={() => setRenaming(w)} onArchive={() => archive(w)} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <Drawer
        open={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        label="Archived workflows"
        header={
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-h2 font-medium tracking-[-0.3px] text-pine">Archived workflows</h2>
            <p className="m-0 text-micro text-slate">
              New verifications cannot use these. Restore one to use it again, or delete it for good. Its template stays
              available when you create a new workflow.
            </p>
          </div>
        }
      >
        <ArchivedList
          items={archived}
          canManage={canManage}
          onChanged={async (message) => {
            toast.success(message.title, message.body);
            await refresh();
          }}
        />
      </Drawer>

      {renaming ? (
        <RenameDialog
          workflow={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={async (name) => {
            setRenaming(null);
            toast.success("Workflow renamed", `It is now called ${name}.`);
            const l = await workflowsApi.list();
            if (l.ok) setLoad((s) => (s.state === "ready" ? { ...s, list: l.data.workflows } : s));
          }}
        />
      ) : null}
    </div>
  );
}

/** A new name for a workflow; its checks, rules and versions stay exactly as they are. */
function RenameDialog({ workflow, onClose, onRenamed }: { workflow: WorkflowListItem; onClose: () => void; onRenamed: (name: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(workflow.name);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="rename-title"
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-[24px] border border-edge bg-white p-0 shadow-[0_24px_48px_-16px_rgba(14,50,40,0.35)] backdrop:bg-black/25 backdrop:backdrop-blur-[6px]"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trimmed || busy || trimmed === workflow.name) return;
          setBusy(true);
          const r = await workflowsApi.rename(workflow.id, trimmed);
          setBusy(false);
          if (!r.ok) return toast.error("Couldn't rename", r.message);
          onRenamed(r.data.name);
        }}
        className="flex flex-col gap-5 p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-pill bg-pine text-lime">
              <WorkflowGlyph className="size-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <h2 id="rename-title" className="m-0 text-[20px] font-medium tracking-[-0.3px] text-pine">
                Rename workflow
              </h2>
              <span className="text-micro text-muted">Only the name changes; its checks, rules and versions stay the same.</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-hover-panel"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <label className="flex flex-col gap-1.5">
          <span className="text-micro font-medium text-pine">Workflow name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-[12px] border border-hairline bg-white px-3.5 text-body text-pine outline-none focus:border-pine/30 focus:ring-2 focus:ring-lime/40"
          />
        </label>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex h-10 items-center rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed || busy || trimmed === workflow.name}
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save name
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * Published or Draft, drawn like the verdict chips on Verifications: a published workflow runs new
 * verifications; a draft is saved and kept here, but nothing runs it until it is published.
 */
function StatusChip({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap",
        published ? "bg-pass-tint text-ramp-2" : "bg-caution-tint text-caution",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-3.5 place-items-center rounded-pill text-[8px] leading-none font-bold text-white",
          published ? "bg-ramp-3" : "bg-caution",
        )}
      >
        {published ? "✓" : "•"}
      </span>
      {published ? "Published" : "Draft"}
    </span>
  );
}

/** The ⋯ menu of a row (in a portal, so the table's scroll box never clips it). */
function RowMenu({
  name,
  href,
  canManage,
  onRename,
  onArchive,
}: {
  name: string;
  href: string;
  canManage: boolean;
  onRename: () => void;
  onArchive: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 208) });
    };
    place();
    const close = () => setOpen(false);
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item =
    "flex items-center gap-1.5 rounded-[6px] bg-[rgba(14,50,40,0.05)] py-1.5 pr-1.5 pl-2 text-left text-[13px] text-pine transition-colors hover:bg-[rgba(14,50,40,0.1)]";

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setConfirm(false);
          setOpen((o) => !o);
        }}
        className="grid size-8 place-items-center rounded-full text-pine/55 transition-colors hover:bg-pine/8 hover:text-pine"
      >
        <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
        <span className="sr-only">Actions for {name}</span>
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[60] flex w-52 flex-col gap-[9px] rounded-[14px] border border-hairline bg-white/95 px-2.5 py-[11px] text-left shadow-[0_16px_40px_-16px_rgba(14,50,40,0.35)] backdrop-blur-[27px]"
            >
              <p className="m-0 truncate text-[15px] font-medium tracking-[-0.17px] text-pine">{name}</p>
              <div aria-hidden className="h-px w-full bg-[rgba(14,50,40,0.1)]" />
              <Link href={href} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <PencilLine aria-hidden className="size-4" strokeWidth={1.7} />
                {canManage ? "Open in editor" : "View"}
              </Link>
              {canManage && (
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setOpen(false);
                  onRename();
                }}
              >
                <TextCursorInput aria-hidden className="size-4" strokeWidth={1.7} />
                Rename
              </button>
              )}
              {!canManage ? null : confirm ? (
                <div className="flex flex-col gap-2 rounded-[8px] bg-danger-tint/60 p-2">
                  <p className="m-0 text-[12px] leading-4 text-pine">New verifications will no longer use it. Archive?</p>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-pill bg-white px-2 py-1 text-[12px] text-pine">
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await onArchive();
                        setBusy(false);
                        setOpen(false);
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-pill bg-danger px-2 py-1 text-[12px] font-medium text-white disabled:opacity-60"
                    >
                      {busy ? <Loader2 aria-hidden className="size-3 animate-spin" /> : null}
                      Archive
                    </button>
                  </span>
                </div>
              ) : (
                <button type="button" role="menuitem" className={item} onClick={() => setConfirm(true)}>
                  <Archive aria-hidden className="size-4" strokeWidth={1.7} />
                  Archive
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The archived workflows in the side panel: each can be restored, or deleted for good (after a confirmation). */
function ArchivedList({
  items,
  canManage,
  onChanged,
}: {
  items: ArchivedWorkflow[] | null;
  canManage: boolean;
  onChanged: (message: { title: string; body: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (items === null)
    return (
      <p className="m-0 flex items-center gap-2 text-body text-slate">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Please wait…
      </p>
    );
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Archive aria-hidden className="size-8 text-pine/30" strokeWidth={1.5} />
        <p className="m-0 text-body font-medium text-pine">Nothing archived</p>
        <p className="m-0 max-w-[360px] text-micro text-slate">A workflow you archive from the list shows here, so you can restore or delete it.</p>
      </div>
    );

  const restore = async (w: ArchivedWorkflow) => {
    setBusy(w.id);
    const r = await workflowsApi.restore(w.id);
    setBusy(null);
    if (!r.ok) return void toast.error("Couldn't restore", r.message);
    await onChanged({
      title: `${w.name} restored`,
      body: r.data.status === "active" ? "New verifications can use it again." : "It is back as a draft: publish it to use it.",
    });
  };
  const remove = async (w: ArchivedWorkflow) => {
    setBusy(w.id);
    const r = await workflowsApi.remove(w.id);
    setBusy(null);
    setConfirmDelete(null);
    if (!r.ok) return void toast.error("Couldn't delete", r.message);
    await onChanged({ title: `${w.name} deleted`, body: "It is gone from your workflows. Verifications that already ran on it keep their record." });
  };

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((w) => (
        <li key={w.id} className="flex flex-col gap-3 rounded-tile border border-hairline bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body font-medium [overflow-wrap:anywhere] text-pine">{w.name}</span>
              <span className="text-micro text-slate">
                {w.version ? `v${w.version}` : "Never published"} · archived {ago(w.archivedAt)} · {w.verifications.toLocaleString()} verification
                {w.verifications === 1 ? "" : "s"}
              </span>
            </div>
            {canManage && confirmDelete !== w.id ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy === w.id}
                  onClick={() => restore(w)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-lime px-3.5 text-micro font-medium text-pine transition-[filter] hover:brightness-95 disabled:opacity-60"
                >
                  {busy === w.id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <ArchiveRestore aria-hidden className="size-3.5" strokeWidth={1.9} />}
                  Restore
                </button>
                <button
                  type="button"
                  disabled={busy === w.id}
                  onClick={() => setConfirmDelete(w.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-danger/30 px-3.5 text-micro font-medium text-danger transition-colors hover:bg-danger/5 disabled:opacity-60"
                >
                  <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
          {confirmDelete === w.id ? (
            <div className="flex flex-wrap items-center gap-2 rounded-well bg-danger/5 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-micro text-pine">
                Delete {w.name} for good? It leaves your workflows and can&apos;t be restored. Its template stays available.
              </span>
              <button
                type="button"
                disabled={busy === w.id}
                onClick={() => remove(w)}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-danger px-3.5 text-micro font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {busy === w.id ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />}
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="h-8 rounded-pill px-3 text-micro text-pine hover:bg-white">
                Cancel
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
