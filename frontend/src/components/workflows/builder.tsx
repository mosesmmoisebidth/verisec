import { ChevronLeft, GripVertical, Lock, Play, Save } from "lucide-react";

import { Select } from "@/components/ui/select";
import type { ReactNode } from "react";

import { CheckGlyph } from "@/components/ui/component-icon";
import type {
  BuilderFooter,
  FlowStep,
  StepSettings,
  WorkflowBuilderData,
  WorkflowComponentRow,
} from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * Figma frame Desktop-32 — the workflow builder.
 *
 * Three columns over a footer bar. The frame's widths are 330.5 / 373 / 330.5
 * with a 17px gutter, kept as `fr` so the ratio survives any container width.
 *
 * Presentational only. Toggling a component, reordering the flow and moving the
 * threshold are all real interactions that need a client component and a
 * mutation endpoint; this renders the state it is handed so the layout, copy
 * and pricing can be reviewed against the frame first. The controls are real
 * inputs (checkbox, range, select) rather than divs, so wiring them later means
 * adding handlers, not rebuilding them — and they are keyboard-operable today.
 */
export function WorkflowBuilder({ data }: { data: WorkflowBuilderData }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <a
          href={data.breadcrumb.href}
          className="flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine"
        >
          <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
          {data.breadcrumb.label}
        </a>
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.name}</h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-[17px] xl:grid-cols-[330.5fr_373fr_330.5fr]">
        <Column title={data.componentsTitle}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.components.map((c) => (
              <ComponentRow key={c.id} row={c} />
            ))}
          </ul>
        </Column>

        <Column title={data.flowTitle} trailing={<span className="tnum text-xs text-pine">{data.flowPrice}</span>}>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {data.steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i + 1} selected={i === 0} />
            ))}
          </ol>
        </Column>

        <Column title={data.settingsTitle}>
          <StepSettingsPanel settings={data.settings} />
        </Column>
      </div>

      <FooterBar footer={data.footer} />
    </>
  );
}

/* ----------------------------------------------------------------------------
   Column shell
---------------------------------------------------------------------------- */

function Column({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-hairline bg-panel p-4">
      <header className="flex min-h-4 items-center justify-between gap-3">
        <h2 className="m-0 text-xs leading-4 font-medium tracking-[0.6px] text-pine uppercase">
          {title}
        </h2>
        {trailing}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Components rail
---------------------------------------------------------------------------- */

function ComponentRow({ row }: { row: WorkflowComponentRow }) {
  const locked = row.locked === true;
  return (
    <li>
      <label
        className={cn(
          "flex min-h-12 items-center justify-between gap-3 rounded-[12px] border px-2 py-2 transition-colors",
          locked
            ? "cursor-not-allowed border-edge bg-transparent opacity-55"
            : row.enabled
              ? "cursor-pointer border-lime bg-lime/20"
              : "cursor-pointer border-hairline bg-white hover:bg-hover-panel",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] leading-tight font-medium text-pine">
            <span className="truncate">{row.name}</span>
            {locked && <Lock aria-hidden className="size-3 shrink-0" strokeWidth={2} />}
          </span>
          <span className="tnum text-[11px] leading-4 text-muted">{row.price}</span>
        </span>
        <Switch checked={row.enabled} disabled={locked} label={row.name} />
      </label>
    </li>
  );
}

/**
 * A real checkbox under the pill, so the control is focusable, announced and
 * toggled by Space before any handler exists. `peer-*` drives the visuals.
 */
function Switch({
  checked,
  disabled,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        aria-label={label}
        className="peer size-0 appearance-none opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-9 items-center rounded-pill p-0.5 transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine",
          checked ? "bg-lime" : "bg-edge",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-pill bg-white shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Applicant flow
---------------------------------------------------------------------------- */

function StepRow({ step, index, selected }: { step: FlowStep; index: number; selected: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-[12px] border p-3",
        selected ? "border-lime bg-lime/20" : "border-hairline bg-white",
      )}
    >
      {/* Reordering is a real interaction this build does not implement, so the
          handle is decorative rather than a button that does nothing. */}
      <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="tnum grid size-7 shrink-0 place-items-center rounded-pill bg-lime text-[13px] font-medium text-pine">
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] leading-tight font-medium text-pine">{step.name}</span>
        <span className="text-[11px] leading-4 text-muted">
          {step.requirement} · {step.outcome}
        </span>
      </span>
      <span className="tnum shrink-0 text-xs text-pine">{step.price}</span>
    </li>
  );
}

/* ----------------------------------------------------------------------------
   Step settings
---------------------------------------------------------------------------- */

function StepSettingsPanel({ settings }: { settings: StepSettings }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col rounded-[12px] bg-lime/20 p-3">
        <span className="text-[13px] leading-5 font-medium text-pine">{settings.stepName}</span>
        <span className="text-[11px] leading-4 text-pine/70">{settings.subtitle}</span>
      </div>

      <p className="m-0 text-xs leading-4 text-pine">{settings.note}</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs leading-4 font-medium text-pine">{settings.passRuleLabel}</span>
        <Select
          block
          label={settings.passRuleLabel}
          options={settings.passRuleOptions}
          defaultValue={settings.passRule}
          className="h-9 w-full rounded-[10px] border border-edge bg-white pr-9 pl-3 text-body text-pine"
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs leading-4 font-medium text-pine">{settings.requiredLabel}</span>
        <Switch checked={settings.required} label={settings.requiredLabel} />
      </label>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Footer bar
---------------------------------------------------------------------------- */

function FooterBar({ footer }: { footer: BuilderFooter }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-hairline bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs leading-4 font-medium text-pine">{footer.decisionModeLabel}</span>

        <Select
          label={footer.decisionModeLabel}
          options={footer.decisionModes}
          defaultValue={footer.decisionMode}
          className="h-9 w-[208px] rounded-[10px] border border-hairline pr-9 pl-3 text-body text-pine"
        />

        <span className="flex items-center gap-3">
          {/* A real range input: draggable, arrow-key operable and announced,
              before any handler is attached. */}
          <input
            type="range"
            min={0}
            max={footer.thresholdMax}
            defaultValue={footer.threshold}
            aria-label={`${footer.decisionMode} threshold`}
            className="vs-slider w-40"
          />
          <span className="tnum w-8 text-body text-pine">{footer.threshold}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel"
        >
          <Play aria-hidden className="size-4" strokeWidth={1.6} />
          {footer.testLabel}
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95"
        >
          <Save aria-hidden className="size-4" strokeWidth={1.6} />
          {footer.saveLabel}
        </button>
      </div>
    </div>
  );
}

/** Re-exported so the flow column can render a glyph beside a step if the
 *  design later asks for one. Keeps the icon map's single owner intact. */
export { CheckGlyph };
