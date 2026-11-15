"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ExternalLink, Loader2, Lock, PencilLine, Plus, Rocket, Save, ShieldOff, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/verifications/live";
import { CheckBadge } from "@/components/ui/component-icon";
import { FlowPages } from "@/components/workflows/flow-pages";
import { RulesPanel, ruleProblem, withRuleNeeds } from "@/components/workflows/rules-panel";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { ComponentIcon } from "@/lib/console/types";
import type { Country } from "@/lib/countries";
import { useAccess } from "@/lib/access";
import {
  conditionClause,
  NEEDS_DOCUMENT,
  priceRange,
  sortChecks,
  updatedAgo,
  workflowsApi,
  type Catalogue,
  type Definition,
  type WorkflowCheck,
  type WorkflowDetail,
} from "@/lib/console/workflows-api";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

const DOC_LABEL: Record<string, string> = {
  passport: "Passport",
  "national-id": "National ID",
  licence: "Driver's licence",
  "residence-permit": "Residence permit",
};
const MODES = { auto: "Trust Score threshold", manual: "Manual review only" } as const;
const ON_FAIL = { decline: "Decline the verification", review: "Send to a person" } as const;

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; catalogue: Catalogue };

/** Turning the document off takes everything that reads it along. */
const dropping = (cid: string) => (cid === "document" ? new Set([cid, ...NEEDS_DOCUMENT]) : new Set([cid]));

/**
 * The workflow builder, live (Figma frame Desktop-32): checks on the left, the applicant flow they
 * make in the middle, the selected step's settings on the right, the decision underneath.
 * Rules sit under the three columns, then the pages the applicant will see.
 * Changes are saved as a draft; publishing makes a new version that new verifications run
 * (verifications already under way keep the version they started with).
 */
export function WorkflowEditor({ countries }: { countries: readonly Country[] }) {
  const id = useSearchParams().get("id") ?? "";
  // Reviewer and Viewer read a workflow here; only a role that manages workflows saves or publishes
  const access = useAccess();
  const canManage = access.can("workflows.manage");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [name, setName] = useState("");
  const [def, setDef] = useState<Definition | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "test" | null>(null);

  const adopt = useCallback((w: WorkflowDetail) => {
    setWf(w);
    setName(w.name);
    setDef(w.draft);
    setSelected((s) => s ?? w.draft.checks[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!id) return;
    void Promise.all([workflowsApi.get(id), workflowsApi.catalogue()]).then(([w, c]) => {
      if (!w.ok) return setLoad({ state: "error", message: w.status === 404 ? "This workflow was not found." : w.message });
      if (!c.ok) return setLoad({ state: "error", message: c.message });
      adopt(w.data);
      setLoad({ state: "ready", catalogue: c.data });
    });
  }, [id, adopt]);

  const dirty = useMemo(
    () => !!wf && !!def && (name.trim() !== wf.name || JSON.stringify(def) !== JSON.stringify(wf.draft)),
    [wf, def, name],
  );

  // leaving with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!id) return <Card icon={ShieldOff} title="No workflow selected." />;
  if (load.state === "loading") return <Card icon={Loader2} title="Loading workflow" />;
  if (load.state === "error" || !wf || !def) return <Card icon={ShieldOff} title={load.state === "error" ? load.message : "This workflow was not found."} />;

  const { catalogue } = load;
  const info = new Map(catalogue.checks.map((c) => [c.id, c]));
  // a template built for some document kinds only (ID + Liveness + Face Match: national ID cards) shows just those
  const fixedDocs = catalogue.templates.find((t) => t.id === wf?.template)?.fixedDocumentTypes ?? null;
  const on = new Map(def.checks.map((c) => [c.id, c]));
  const price = def.checks.reduce((s, c) => s + (info.get(c.id)?.price ?? 0), 0);
  // checks only a rule brings in, with the conditions that do
  const conditional = [...new Set(def.rules.filter((r) => r.then === "require" && r.check && !on.has(r.check)).map((r) => r.check!))];
  const whenOf = (cid: string) =>
    [...new Set(def.rules.filter((r) => r.then === "require" && r.check === cid).map((r) => conditionClause(r.when, catalogue)))].join(" or ");
  const flow = sortChecks([...def.checks.map((c) => ({ id: c.id, always: true })), ...conditional.map((cid) => ({ id: cid, always: false }))]);
  const maxPrice = price + conditional.reduce((s, cid) => s + (info.get(cid)?.price ?? 0), 0);
  const problems = def.rules.filter((r) => ruleProblem(r, def, catalogue)).length;
  // a check a rule needs stays on until the rule goes
  const neededByRules = (cid: string) => {
    if (!on.has(cid) || !def.rules.length) return false;
    const drop = dropping(cid);
    return withRuleNeeds({ ...def, checks: def.checks.filter((c) => !drop.has(c.id)) }, catalogue).checks.some((c) => c.id === cid);
  };

  const update = (next: Partial<Definition>) => setDef({ ...def, ...next });
  const setCheck = (cid: string, patch: Partial<WorkflowCheck>) =>
    update({ checks: def.checks.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });

  const toggle = (cid: string) => {
    if (on.has(cid)) {
      // the document goes with everything that reads it
      const drop = dropping(cid);
      const checks = def.checks.filter((c) => !drop.has(c.id));
      update({ checks });
      if (selected && drop.has(selected)) setSelected(checks[0]?.id ?? null);
      return;
    }
    const add: WorkflowCheck[] = [{ id: cid, required: true, onFail: "decline" }];
    if (NEEDS_DOCUMENT.has(cid) && !on.has("document")) add.push({ id: "document", required: true, onFail: "decline" });
    update({ checks: sortChecks([...def.checks, ...add]) });
    setSelected(cid);
  };

  const save = async (): Promise<WorkflowDetail | null> => {
    const r = await workflowsApi.save(wf.id, { name: name.trim() || wf.name, definition: def });
    if (!r.ok) {
      toast.error("Couldn't save", r.message);
      return null;
    }
    adopt(r.data);
    return r.data;
  };

  const onSave = async () => {
    setBusy("save");
    if (await save()) toast.success("Draft saved", "Publish it when you want new verifications to use it.");
    setBusy(null);
  };

  const onPublish = async () => {
    setBusy("publish");
    if (dirty && !(await save())) return setBusy(null);
    const r = await workflowsApi.publish(wf.id);
    setBusy(null);
    if (!r.ok) return toast.error("Couldn't publish", r.message);
    adopt(r.data);
    toast.success(`Published version ${r.data.version}`, "New verifications run it; ones under way keep their version.");
  };

  // a real session on the published version, opened like an applicant would
  const onTest = async () => {
    if (!wf.version) return;
    setBusy("test");
    try {
      const r = await fetch(`${API}/api/verifications/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: wf.id, reference: `test-${wf.name}`.slice(0, 40) }),
      });
      const j = (await r.json().catch(() => null)) as { link?: string; message?: string } | null;
      if (!r.ok || !j?.link) throw new Error(typeof j?.message === "string" ? j.message : "");
      window.open(j.link, "_blank", "noopener");
    } catch (e) {
      toast.error("Couldn't start a test", (e as Error).message || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const sel = selected ? on.get(selected) : undefined;
  const selInfo = selected ? info.get(selected) : undefined;
  const lastPublished = wf.versions[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href="/workflows/" className="flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine">
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            Workflows
          </Link>
          {/* the name is edited in place; the pencil says so, and Save draft keeps it */}
          <label className="group flex min-w-0 items-center gap-2" title="Click to rename">
            <span className="sr-only">Workflow name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-[min(560px,80vw)] rounded-[10px] border border-transparent bg-transparent px-1 -mx-1 text-h1 font-medium tracking-[-0.45px] text-pine outline-none hover:border-hairline focus:border-pine/30 focus:bg-white"
            />
            <PencilLine aria-hidden className="size-4 shrink-0 text-muted transition-colors group-hover:text-pine" strokeWidth={1.8} />
          </label>
          <p className="m-0 flex flex-wrap items-center gap-2 text-micro text-muted">
            <span
              className={cn(
                "rounded-pill px-2 py-0.5 text-[11px] leading-4",
                wf.status === "active" ? "bg-pine text-lime" : "bg-inert-tint text-inert",
              )}
            >
              {wf.status === "active" ? "active" : "draft"}
            </span>
            {lastPublished ? (
              <span>
                Version {lastPublished.version} published {updatedAgo(lastPublished.published_at).replace("Updated ", "")}
              </span>
            ) : (
              <span>Not published yet: new verifications cannot use it until you publish</span>
            )}
            {dirty ? (
              <span className="font-medium text-pine">· Unsaved changes</span>
            ) : wf.unpublishedChanges ? (
              <span className="font-medium text-pine">· Saved changes not published</span>
            ) : null}
            <span>· {wf.uses} verification{wf.uses === 1 ? "" : "s"}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[17px] xl:grid-cols-[330.5fr_373fr_330.5fr]">
        <Column title="Components">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {catalogue.checks.map((c) => {
              const enabled = on.has(c.id);
              const locked = !c.available;
              const pinned = neededByRules(c.id);
              return (
                <li key={c.id}>
                  {/* the control is the Toggle's checkbox, nested inside */}
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-[12px] border px-2 py-2 transition-colors",
                      locked
                        ? "cursor-not-allowed border-edge bg-transparent opacity-55"
                        : enabled
                          ? "cursor-pointer border-lime bg-lime/20"
                          : "cursor-pointer border-hairline bg-white hover:bg-hover-panel",
                    )}
                    title={locked ? c.note : pinned ? "A rule needs this check. Remove the rule to turn it off." : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <CheckBadge icon={c.id as ComponentIcon} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 text-[13px] leading-tight font-medium text-pine">
                          <span className="truncate">{c.name}</span>
                          {locked && <Lock aria-hidden className="size-3 shrink-0" strokeWidth={2} />}
                        </span>
                        <span className="tnum text-[11px] leading-4 text-muted">
                          {locked ? "Coming soon" : `$${c.price.toFixed(2)}/verif`}
                          {pinned ? " · used by a rule" : ""}
                        </span>
                      </span>
                    </span>
                    <Toggle checked={enabled} disabled={locked || pinned} label={c.name} onChange={() => toggle(c.id)} />
                  </label>
                </li>
              );
            })}
          </ul>
        </Column>

        <Column
          title="Applicant flow"
          trailing={
            <span className="tnum text-xs text-pine" title={maxPrice > price ? "The higher price is when every rule that adds a check fires." : undefined}>
              {priceRange({ min: price, max: maxPrice })}
            </span>
          }
        >
          {def.checks.length === 0 ? (
            <p className="m-0 py-6 text-center text-micro text-muted">Turn on a check to start the flow.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {flow.map((step) => {
                if (!step.always)
                  return (
                    <li key={`if-${step.id}`}>
                      <div className="flex w-full items-center gap-2 rounded-[12px] border border-dashed border-pine/35 bg-white/70 p-3">
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill border border-dashed border-pine/40 bg-lime-tint text-pine">
                          <Plus className="size-3.5" strokeWidth={2.2} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[13px] leading-tight font-medium text-pine">{info.get(step.id)?.name ?? step.id}</span>
                          <span className="text-[11px] leading-4 text-muted">Only when {whenOf(step.id)}</span>
                        </span>
                        <span className="tnum shrink-0 text-xs text-pine/60">+${(info.get(step.id)?.price ?? 0).toFixed(2)}</span>
                      </div>
                    </li>
                  );
                const c = on.get(step.id)!;
                const i = def.checks.findIndex((x) => x.id === c.id);
                return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-pressed={selected === c.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[12px] border p-3 text-left transition-colors",
                      selected === c.id ? "border-lime bg-lime/20" : "border-hairline bg-white hover:bg-hover-panel",
                    )}
                  >
                    <span className="tnum grid size-7 shrink-0 place-items-center rounded-pill bg-lime text-[13px] font-medium text-pine">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] leading-tight font-medium text-pine">{info.get(c.id)?.name ?? c.id}</span>
                      <span className="text-[11px] leading-4 text-muted">
                        {c.required ? "Required" : "Optional"} · {c.onFail === "review" ? "review on fail" : "decline on fail"}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-xs text-pine">${(info.get(c.id)?.price ?? 0).toFixed(2)}</span>
                  </button>
                </li>
                );
              })}
            </ol>
          )}
        </Column>

        <Column title="Step settings">
          {sel && selInfo ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col rounded-[12px] bg-lime/20 p-3">
                <span className="text-[13px] leading-5 font-medium text-pine">{selInfo.name}</span>
                <span className="text-[11px] leading-4 text-pine/70">{selInfo.note}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs leading-4 font-medium text-pine">If this check fails</span>
                <Select
                  block
                  label="If this check fails"
                  options={Object.values(ON_FAIL)}
                  value={ON_FAIL[sel.onFail]}
                  onValueChange={(v) => setCheck(sel.id, { onFail: v === ON_FAIL.review ? "review" : "decline" })}
                  className="h-9 w-full rounded-[10px] border border-edge bg-white pr-9 pl-3 text-body text-pine"
                />
              </div>

              <label className="flex items-center justify-between gap-3">
                <span className="flex flex-col">
                  <span className="text-xs leading-4 font-medium text-pine">Required</span>
                  <span className="text-[11px] leading-4 text-muted">
                    {sel.required ? "Not approved without it." : "Counts only when the applicant completes it."}
                  </span>
                </span>
                <Toggle checked={sel.required} label="Required" onChange={() => setCheck(sel.id, { required: !sel.required })} />
              </label>

              {sel.id === "face-match" ? (
                <Slider
                  label="Review below this similarity"
                  min={65}
                  max={90}
                  value={Math.round(def.settings.faceMatchThreshold * 100)}
                  suffix="%"
                  onChange={(v) => update({ settings: { ...def.settings, faceMatchThreshold: v / 100 } })}
                />
              ) : null}

              {sel.id === "age" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs leading-4 font-medium text-pine">Minimum age</span>
                  <Select
                    block
                    label="Minimum age"
                    options={Array.from({ length: 13 }, (_, i) => `${13 + i} years`)}
                    value={`${def.settings.minimumAge} years`}
                    onValueChange={(v) => update({ settings: { ...def.settings, minimumAge: Number.parseInt(v, 10) } })}
                    className="h-9 w-full rounded-[10px] border border-edge bg-white pr-9 pl-3 text-body text-pine"
                  />
                </div>
              ) : null}

              {sel.id === "document" ? (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1.5 text-xs leading-4 font-medium text-pine">Accepted documents</legend>
                  {fixedDocs ? (
                    <p className="m-0 mb-1 text-micro text-slate">
                      This workflow accepts {fixedDocs.map((t) => DOC_LABEL[t] ?? t).join(" or ")} only. Any other document is refused.
                    </p>
                  ) : null}
                  {(fixedDocs ?? catalogue.documentTypes).map((t) => {
                    const checked = def.settings.documentTypes.includes(t);
                    const last = (checked && def.settings.documentTypes.length === 1) || !!fixedDocs;
                    return (
                      <label key={t} className={cn("flex items-center justify-between gap-3 text-[13px] text-pine", last && "opacity-60")}>
                        {DOC_LABEL[t] ?? t}
                        <Toggle
                          checked={checked}
                          disabled={last}
                          label={DOC_LABEL[t] ?? t}
                          onChange={() =>
                            update({
                              settings: {
                                ...def.settings,
                                documentTypes: checked ? def.settings.documentTypes.filter((x) => x !== t) : [...def.settings.documentTypes, t],
                              },
                            })
                          }
                        />
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
            </div>
          ) : (
            <p className="m-0 py-6 text-center text-micro text-muted">Select a step in the flow to change its settings.</p>
          )}
        </Column>
      </div>

      <RulesPanel definition={def} catalogue={catalogue} countries={countries} onChange={setDef} />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-hairline bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs leading-4 font-medium text-pine">Decision mode</span>
          <Select
            label="Decision mode"
            options={Object.values(MODES)}
            value={MODES[def.decision.mode]}
            onValueChange={(v) => update({ decision: { ...def.decision, mode: v === MODES.manual ? "manual" : "auto" } })}
            className="h-9 w-[208px] rounded-[10px] border border-hairline pr-9 pl-3 text-body text-pine"
          />
          {def.decision.mode === "auto" ? (
            <span className="flex items-center gap-3">
              <span className="text-[11px] text-muted">Approve at</span>
              <input
                type="range"
                min={50}
                max={100}
                value={def.decision.approveAt}
                onChange={(e) => update({ decision: { ...def.decision, approveAt: Number(e.target.value) } })}
                aria-label="Trust Score needed for automatic approval"
                className="vs-slider w-40"
              />
              <span className="tnum w-8 text-body text-pine">{def.decision.approveAt}</span>
            </span>
          ) : (
            <span className="text-[11px] text-muted">Clear results wait for a person; failures still decline.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {problems ? (
            <span className="flex items-center gap-1.5 text-[12px] text-caution">
              <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2} />
              Fix {problems} rule{problems === 1 ? "" : "s"} to save
            </span>
          ) : null}
          {!canManage && (
            <span className="flex items-center gap-1.5 text-[12px] text-slate">
              <Lock aria-hidden className="size-3.5" strokeWidth={2} />
              View only: your role cannot change workflows
            </span>
          )}
          {access.can("run") && (
          <FooterButton onClick={onTest} disabled={!wf.version || busy !== null} busy={busy === "test"} icon={<ExternalLink aria-hidden className="size-4" strokeWidth={1.6} />}>
            {wf.version ? "Test the flow" : "Publish to test"}
          </FooterButton>
          )}
          {canManage && (
          <>
          <FooterButton onClick={onSave} disabled={!dirty || busy !== null || problems > 0} busy={busy === "save"} icon={<Save aria-hidden className="size-4" strokeWidth={1.6} />}>
            Save draft
          </FooterButton>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy !== null || def.checks.length === 0 || problems > 0 || (!dirty && !wf.unpublishedChanges && !!wf.version)}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "publish" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Rocket aria-hidden className="size-4" strokeWidth={1.6} />}
            Publish
          </button>
          </>
          )}
        </div>
      </div>

      <div className="rounded-[20px] border border-hairline bg-panel p-4">
        <FlowPages definition={def} catalogue={catalogue} />
      </div>
    </>
  );
}

function Column({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-hairline bg-panel p-4">
      <header className="flex min-h-4 items-center justify-between gap-3">
        <h2 className="m-0 text-xs leading-4 font-medium tracking-[0.6px] text-pine uppercase">{title}</h2>
        {trailing}
      </header>
      {children}
    </section>
  );
}

/** A real checkbox under the pill: focusable, announced, toggled by Space. */
function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} className="peer size-0 appearance-none opacity-0" />
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-9 items-center rounded-pill p-0.5 transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine",
          checked ? "bg-lime" : "bg-edge",
        )}
      >
        <span className={cn("size-4 rounded-pill bg-white shadow-sm transition-transform", checked && "translate-x-4")} />
      </span>
    </span>
  );
}

function Slider({ label, min, max, value, suffix, onChange }: { label: string; min: number; max: number; value: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs leading-4 font-medium text-pine">{label}</span>
      <span className="flex items-center gap-3">
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="vs-slider flex-1" />
        <span className="tnum w-10 text-right text-body text-pine">
          {value}
          {suffix}
        </span>
      </span>
    </label>
  );
}

function FooterButton({ onClick, disabled, busy, icon, children }: { onClick: () => void; disabled?: boolean; busy?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
