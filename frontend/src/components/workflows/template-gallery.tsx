"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronLeft,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldOff,
  Sparkles,
  X,
} from "lucide-react";

import { Card } from "@/components/verifications/live";
import { CheckBadge } from "@/components/ui/component-icon";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { CreateWorkflowDialog } from "@/components/workflows/create-workflow-dialog";
import { WorkflowGlyph } from "@/components/workflows/workflow-glyph";
import { FlowPages, pagesOf } from "@/components/workflows/flow-pages";
import type { ComponentIcon } from "@/lib/console/types";
import { bannerOf } from "@/lib/console/workflow-banners";
import {
  priceRange,
  ruleSentence,
  workflowsApi,
  type Catalogue,
  type TemplateInfo,
} from "@/lib/console/workflows-api";
import { cn } from "@/lib/utils";

const ALL = "All industries";

/**
 * Every ready-made workflow, by what it does and who uses it. A template opens into its full
 * picture (checks, rules, price and the pages the applicant will see, in order) before it is
 * used; using it creates a draft the organisation then makes its own.
 */
export function TemplateGallery() {
  const router = useRouter();
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [industry, setIndustry] = useState(ALL);
  const [open, setOpen] = useState<TemplateInfo | null>(null);
  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void workflowsApi
      .catalogue()
      .then((r) => (r.ok ? setCat(r.data) : setError(r.message)));
  }, []);

  const shown = useMemo(() => {
    if (!cat) return [];
    const q = query.trim().toLowerCase();
    return cat.templates.filter(
      (t) =>
        (category === "all" || t.category === category) &&
        (industry === ALL || t.industries.includes(industry)) &&
        (!q ||
          `${t.name} ${t.summary} ${t.industries.join(" ")}`
            .toLowerCase()
            .includes(q)),
    );
  }, [cat, query, category, industry]);

  const create = async (template: string, name?: string) => {
    if (creating) return;
    setCreating(true);
    const r = await workflowsApi.create({ template, name });
    if (!r.ok) {
      setCreating(false);
      toast.error("Couldn't create the workflow", r.message);
      return;
    }
    router.push(`/workflows/edit/?id=${encodeURIComponent(r.data.id)}`);
  };

  if (error) return <Card icon={ShieldOff} title={error} />;
  if (!cat) return <Card icon={Loader2} title="Loading templates" />;

  const filtering =
    query.trim() !== "" || category !== "all" || industry !== ALL;
  const ready = cat.templates.filter((t) => t.available).length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link
          href="/workflows/"
          className="flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine"
        >
          <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
          Workflows
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">
              Create a new workflow
            </h1>
            <p className="m-0 max-w-[640px] text-body text-muted">
              Build your own, or start from one of {ready} ready-made workflows for {cat.industries.length} industries. Preview the
              pages your applicants will see, then make it yours.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNaming(true)}
            disabled={creating}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            <Plus aria-hidden className="size-4" strokeWidth={2.2} />
            Create custom workflow
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[240px] flex-1 items-center">
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ready-made workflows by need or industry"
            className="h-full w-full rounded-pill border border-hairline bg-page pr-10 pl-4 text-body text-pine placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          />
          <Search aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-icon-soft" strokeWidth={1.8} />
        </label>
        <Select
          label="Industry"
          options={[ALL, ...cat.industries]}
          value={industry}
          onValueChange={setIndustry}
          className="h-9 min-w-[200px] rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-body text-pine focus:border-pine/30"
        />
      </div>

      <div role="tablist" aria-label="Categories" className="flex flex-wrap gap-2">
        {[{ id: "all", name: "All" }, ...cat.categories].map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "h-8 rounded-pill border px-3.5 text-micro font-medium transition-colors",
              category === c.id ? "border-pine bg-pine text-lime" : "border-hairline bg-white text-pine hover:border-pine/30",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {!filtering ? (
        <>
          <Section
            title="Recommended"
            icon={<Sparkles aria-hidden className="size-4" strokeWidth={1.8} />}
            summary="What most teams start with."
          >
            {cat.templates
              .filter((t) => t.recommended)
              .map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  cat={cat}
                  onOpen={() => setOpen(t)}
                />
              ))}
          </Section>
        </>
      ) : null}

      {cat.categories.map((c) => {
        const list = shown.filter((t) => t.category === c.id);
        if (!list.length) return null;
        return (
          <Section
            key={c.id}
            title={c.name}
            summary={c.summary}
            icon={
              <WorkflowGlyph className="size-4" />
            }
          >
            {list.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                cat={cat}
                onOpen={() => setOpen(t)}
              />
            ))}
          </Section>
        );
      })}
      {filtering && shown.length === 0 ? (
        <p className="m-0 rounded-[20px] border border-hairline bg-panel py-12 text-center text-body text-muted">
          No template matches. Try another industry, or start from scratch.
        </p>
      ) : null}

      {naming ? (
        <CreateWorkflowDialog creating={creating} onCreate={(name) => void create("blank", name)} onClose={() => setNaming(false)} />
      ) : null}
      {open ? (
        <TemplateDetail
          t={open}
          cat={cat}
          creating={creating}
          onUse={(name) => void create(open.id, name)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function Section({
  title,
  summary,
  icon,
  children,
}: {
  title: string;
  summary: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2 text-pine">
        <span className="grid size-7 place-items-center rounded-pill bg-lime">
          {icon}
        </span>
        <h2 className="m-0 text-[15px] font-medium">{title}</h2>
        <span className="text-micro text-muted">{summary}</span>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function TemplateCard({
  t,
  cat,
  onOpen,
}: {
  t: TemplateInfo;
  cat: Catalogue;
  onOpen: () => void;
}) {
  const pages = pagesOf(t.definition, cat).pages.length;
  const extra = t.definition.rules.filter((r) => r.then === "require").length;
  const added = [
    ...new Set(
      t.definition.rules
        .filter((r) => r.then === "require" && r.check)
        .map((r) => r.check!),
    ),
  ].filter((id) => !t.definition.checks.some((c) => c.id === id));
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[20px] border border-hairline bg-white text-left transition-[box-shadow,border-color,translate] duration-200",
        "hover:-translate-y-0.5 hover:border-pine/30 hover:shadow-[0_16px_32px_-18px_rgba(14,50,40,0.55)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine",
      )}
    >
      <Banner
        t={t}
        cat={cat}
        className={cn("h-[136px]", !t.available && "grayscale-[60%]")}
        zoom
      />
      <span className="flex flex-1 flex-col gap-3 p-4">
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-medium text-pine">{t.name}</span>
          <span className="line-clamp-2 text-micro text-muted">
            {t.summary}
          </span>
        </span>
        <span className="flex flex-wrap gap-1">
          {t.definition.checks.slice(0, 8).map((c) => (
            <CheckBadge key={c.id} icon={c.id as ComponentIcon} />
          ))}
          {added.slice(0, 3).map((id) => (
            <span
              key={id}
              title="Added only when a rule asks for it"
              className="rounded-pill border border-dashed border-pine/40 p-[1px]"
            >
              <CheckBadge icon={id as ComponentIcon} />
            </span>
          ))}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[11px] text-muted">
          <span>{pages} pages</span>
          <span>{t.definition.checks.length} checks</span>
          {t.rules.length ? (
            <span>
              {t.rules.length} rule{t.rules.length === 1 ? "" : "s"}
              {extra ? `, ${extra} step-up` : ""}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-pine">
            Preview
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The top of a template: a photo of the kind of company that runs it, its category, and the price
 * per verification (a range when rules can add a paid step).
 */
function Banner({
  t,
  cat,
  className,
  zoom,
  children,
}: {
  t: TemplateInfo;
  cat: Catalogue;
  className?: string;
  zoom?: boolean;
  children?: React.ReactNode;
}) {
  const src = bannerOf(t.id);
  const ranged = t.price.min !== t.price.max;
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden bg-pine",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 size-full object-cover",
            zoom &&
              "transition-transform duration-500 ease-out group-hover:scale-[1.04]",
          )}
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,var(--color-lime)_0%,transparent_45%)] opacity-40"
        />
      )}
      {/* legible over any photo: dark at the bottom where the price sits, light at the top */}
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-pine/85 via-pine/20 to-transparent"
      />

      <span className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
        <span className="rounded-pill bg-white/90 px-2.5 py-1 text-[11px] leading-none font-medium text-pine backdrop-blur-sm">
          {cat.categories.find((c) => c.id === t.category)?.name}
        </span>
        <span className="flex shrink-0 items-start gap-2">
          {!t.available ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-white px-2.5 py-1 text-[11px] leading-none font-medium text-pine/80">
              <Lock aria-hidden className="size-3" strokeWidth={2} /> Coming soon
            </span>
          ) : t.recommended ? (
            <span className="rounded-pill bg-lime px-2.5 py-1 text-[11px] leading-none font-medium text-pine">Recommended</span>
          ) : null}
          {children}
        </span>
      </span>

      <span className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-3">
        <span className="flex flex-col gap-0.5 rounded-[12px] bg-white px-3 py-1.5 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]">
          <span className="tnum text-[17px] leading-tight font-medium tracking-[-0.2px] text-pine">
            {ranged
              ? `$${t.price.min.toFixed(2)} to $${t.price.max.toFixed(2)}`
              : `$${t.price.min.toFixed(2)}`}
          </span>
          <span className="text-[10px] leading-3 text-pine/65">
            {ranged ? "per verification, by rule" : "per verification"}
          </span>
        </span>
        <span className="min-w-0 truncate pb-0.5 text-right text-[11px] font-medium text-white/90">
          {t.industries.slice(0, 2).join(", ")}
        </span>
      </span>
    </span>
  );
}

function TemplateDetail({
  t,
  cat,
  creating,
  onUse,
  onClose,
}: {
  t: TemplateInfo;
  cat: Catalogue;
  creating: boolean;
  onUse: (name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(t.name);
  const info = new Map(cat.checks.map((c) => [c.id, c]));
  const d = t.definition;

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={t.name}
      className="m-auto w-[min(1160px,calc(100vw-2rem))] rounded-[24px] border border-edge bg-white p-0 shadow-[0_24px_48px_-16px_rgba(14,50,40,0.35)] backdrop:bg-black/25 backdrop:backdrop-blur-[6px]"
    >
      <div className="flex max-h-[92dvh] flex-col overflow-y-auto">
        <Banner t={t} cat={cat} className="h-[168px]">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-pill bg-white text-pine shadow-sm transition-colors hover:bg-lime"
          >
            <X aria-hidden className="size-4" />
          </button>
        </Banner>
        <div className="flex flex-col gap-5 p-6">
          <header className="flex min-w-0 flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-medium tracking-[-0.3px] text-pine">
              {t.name}
            </h2>
            <p className="m-0 max-w-[720px] text-body text-muted">
              {t.summary}
            </p>
            <span className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted">
              {t.industries.map((i) => (
                <span
                  key={i}
                  className="rounded-pill border border-hairline px-2 py-0.5"
                >
                  {i}
                </span>
              ))}
            </span>
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-[18px] border border-hairline bg-panel p-4">
              <h3 className="m-0 text-xs font-medium tracking-[0.6px] text-pine uppercase">
                Checks
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {d.checks.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 text-[13px] text-pine"
                  >
                    <CheckBadge icon={c.id as ComponentIcon} />
                    <span className="flex-1 truncate">
                      {info.get(c.id)?.name ?? c.id}
                    </span>
                    <span className="text-[11px] text-muted">
                      {c.required ? "Required" : "Optional"}
                    </span>
                  </li>
                ))}
                {[
                  ...new Set(
                    d.rules
                      .filter((r) => r.then === "require" && r.check)
                      .map((r) => r.check!),
                  ),
                ].map((id) => (
                  <li
                    key={`r-${id}`}
                    className="flex items-center gap-2 text-[13px] text-pine"
                  >
                    <span className="rounded-pill border border-dashed border-pine/40 p-[1px]">
                      <CheckBadge icon={id as ComponentIcon} />
                    </span>
                    <span className="flex-1 truncate">
                      {info.get(id)?.name ?? id}
                    </span>
                    <span className="text-[11px] text-muted">
                      When a rule adds it
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2 rounded-[18px] border border-hairline bg-panel p-4">
              <h3 className="m-0 text-xs font-medium tracking-[0.6px] text-pine uppercase">
                Rules
              </h3>
              {d.rules.length ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {d.rules.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-[10px] bg-white px-3 py-2 text-[12px] leading-4 text-pine"
                    >
                      {ruleSentence(r, cat)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[12px] text-muted">
                  No rules: every applicant goes through the same checks.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-[18px] border border-hairline bg-panel p-4">
              <h3 className="m-0 text-xs font-medium tracking-[0.6px] text-pine uppercase">
                Decision and price
              </h3>
              <p className="m-0 text-[13px] text-pine">
                {d.decision.mode === "manual"
                  ? "A person reviews every result. Failed checks still decline."
                  : `Approved automatically when every check is clear and the Trust Score reaches ${d.decision.approveAt}.`}
              </p>
              <p className="m-0 text-[13px] text-pine">
                <span className="tnum font-medium">{priceRange(t.price)}</span>
                {t.price.min !== t.price.max ? (
                  <span className="text-muted">
                    {" "}
                    (more only when a rule adds a step)
                  </span>
                ) : null}
              </p>
              {d.checks.some((c) => c.id === "age") ? (
                <p className="m-0 text-[13px] text-pine">
                  Minimum age {d.settings.minimumAge}.
                </p>
              ) : null}
              {d.settings.documentTypes.length < 4 ? (
                <p className="m-0 text-[13px] text-pine">
                  Accepts:{" "}
                  {d.settings.documentTypes.join(", ").replace(/-/g, " ")}.
                </p>
              ) : null}
            </div>
          </div>

          <FlowPages definition={d} catalogue={cat} />

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            {t.available ? (
              <>
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 text-micro font-medium text-pine">
                    Name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="h-10 w-full max-w-[420px] rounded-[12px] border border-hairline bg-white px-3 text-body text-pine outline-none focus:border-pine/30 focus:ring-2 focus:ring-lime/40"
                  />
                </label>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => onUse(name.trim() || t.name)}
                  className="inline-flex h-10 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight aria-hidden className="size-4" />
                  )}
                  Use this template
                </button>
              </>
            ) : (
              <p className="m-0 flex items-center gap-2 text-body text-muted">
                <Lock aria-hidden className="size-4" /> Coming soon: this
                workflow needs a check that is not available yet.
              </p>
            )}
          </footer>
        </div>
      </div>
    </dialog>
  );
}
