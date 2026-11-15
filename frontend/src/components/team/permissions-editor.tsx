"use client";

import { Check, RotateCcw } from "lucide-react";

import type { CapabilityInfo } from "@/lib/console/team-api";
import { cn } from "@/lib/utils";

/**
 * A role's permissions, as switches: what the chosen role includes is on, and an Owner or Admin can turn any of them
 * off or turn others on for this one person (the console stores only what differs from the role, and refuses a
 * permission the person making the change does not have). Each row says whether it is the role's or changed here.
 */
export function PermissionsEditor({
  catalogue,
  roleName,
  roleDefaults,
  value,
  onChange,
  grantable,
}: {
  catalogue: CapabilityInfo[];
  roleName: string;
  /** What the role gives on its own. */
  roleDefaults: string[];
  /** What this person will have. */
  value: string[];
  onChange: (next: string[]) => void;
  /** What the person making the change may hand out (their own permissions). */
  grantable: (id: string) => boolean;
}) {
  const editable = catalogue.filter((c) => c.editable);
  const groups = [...new Set(editable.map((c) => c.group))];
  const has = new Set(value);
  const base = new Set(roleDefaults);
  const changed = editable.filter((c) => has.has(c.id) !== base.has(c.id)).length;

  const toggle = (id: string) => onChange(has.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <section aria-label={`Permissions for ${roleName}`} className="flex flex-col gap-2.5 rounded-[14px] border border-hairline bg-panel p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-body font-medium text-pine">
          What a {roleName} can do
          <span className="tnum ml-2 text-micro font-normal text-slate">
            {editable.filter((c) => has.has(c.id)).length} of {editable.length}
          </span>
        </p>
        {changed ? (
          <span className="flex items-center gap-2">
            <span className="rounded-pill bg-lime px-2 py-0.5 text-[11px] font-semibold text-pine">Custom: {changed} changed</span>
            <button
              type="button"
              onClick={() => onChange(roleDefaults.filter((d) => editable.some((c) => c.id === d)))}
              className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-micro text-pine underline-offset-4 hover:underline"
            >
              <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.8} />
              Reset to role
            </button>
          </span>
        ) : (
          <span className="rounded-pill bg-white px-2 py-0.5 text-[11px] font-medium text-slate">The role&apos;s permissions</span>
        )}
      </header>

      <div className="flex max-h-[min(300px,42dvh)] flex-col gap-3 overflow-y-auto pr-1">
        {groups.map((g) => (
          <fieldset key={g} className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 text-[11px] font-semibold tracking-[0.02em] text-slate">{g}</legend>
            {editable
              .filter((c) => c.group === g)
              .map((c) => {
                const on = has.has(c.id);
                const differs = on !== base.has(c.id);
                const locked = !on && !grantable(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors",
                      locked ? "cursor-not-allowed opacity-55" : "hover:bg-white",
                      differs && "bg-lime-tint",
                    )}
                    title={locked ? "You can only give permissions you have yourself." : undefined}
                  >
                    <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked}
                        onChange={() => toggle(c.id)}
                        className="peer size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-card-line bg-white transition-colors checked:border-pine checked:bg-pine focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-1 disabled:cursor-not-allowed"
                      />
                      <Check
                        aria-hidden
                        className="pointer-events-none absolute inset-0 m-auto size-3 text-lime opacity-0 peer-checked:opacity-100"
                        strokeWidth={3.5}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] leading-snug text-pine">{c.label}</span>
                      {differs ? (
                        <span className="text-[11px] font-medium text-pine/70">{on ? "Added for this person" : "Taken away for this person"}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
