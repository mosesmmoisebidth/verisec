import type { ReactNode } from "react";
import {
  Building2,
  Clock,
  Eye,
  Globe,
  Info,
  Link2,
  List,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PersonPlaceholder } from "@/components/shell/account-avatar";
import { Select } from "@/components/ui/select";
import { CountrySelect } from "@/components/ui/country-select";
import { Switch } from "@/components/ui/switch";
import { COUNTRIES, findCountry } from "@/lib/countries";
import type { SettingAvatar, SettingField, SettingFieldIcon } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   The pieces the Settings tabs are built from, matched to the Figma frames:
   one light card per tab, icon-led white fields, lime Save/Connect/Export.

   A server module rendering client islands (Select / CountrySelect / Switch)
   only where interactivity is needed. Every control is a real form element and
   every one is UNWIRED, there is no settings endpoint yet, so Save and the rest
   are present and inert rather than linked to a handler that doesn't exist.
---------------------------------------------------------------------------- */

const ICONS: Record<SettingFieldIcon, LucideIcon> = {
  user: User,
  mail: Mail,
  lock: Lock,
  globe: Globe,
  building: Building2,
  info: Info,
  clock: Clock,
  link: Link2,
  list: List,
};

/** The frame's card: a soft grey panel with a hairline and a 20px radius. */
export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-[20px] border border-[#ececea] bg-[#f7f7f5] p-6", className)}>
      {children}
    </section>
  );
}

/* ---- Fields ----------------------------------------------------------- */

const FIELD =
  "h-[52px] w-full rounded-[12px] border border-[#e6e6e3] bg-white pr-4 pl-11 text-[15px] text-pine " +
  "placeholder:text-[#a3a3a0] outline-none transition-colors focus-visible:border-pine/40 " +
  "focus-visible:ring-2 focus-visible:ring-lime/50";

/** A labelled, icon-led control. */
export function IconField({ field }: { field: SettingField }) {
  const id = `set-${field.key}`;
  const Icon = ICONS[field.icon];

  const leadingIcon = (
    <Icon
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-[18px] -translate-y-1/2 text-[#a3a3a0]"
      strokeWidth={1.7}
    />
  );

  let control: ReactNode;
  if (field.kind === "select") {
    // The leading icon is rendered here as an element (not passed as a prop) so
    // this stays a server component — a lucide component cannot cross the RSC
    // boundary into the client <Select>.
    control = (
      <div className="relative">
        {leadingIcon}
        <Select
          block
          id={id}
          name={field.key}
          label={field.label}
          options={field.options ?? []}
          defaultValue={field.value}
          className={cn(FIELD, "pr-10")}
        />
      </div>
    );
  } else if (field.kind === "country") {
    control = (
      <CountrySelect
        id={id}
        countries={COUNTRIES}
        name={field.key}
        label={field.label}
        defaultCode={findCountry(field.value)?.code}
        className={cn(FIELD, "pr-10")}
      />
    );
  } else if (field.kind === "readonly") {
    control = (
      <div className="relative">
        <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[#a3a3a0]" strokeWidth={1.7} />
        <div className={cn(FIELD, "flex items-center bg-[#f2f2ef] text-pine/75")}>{field.value}</div>
      </div>
    );
  } else {
    control = (
      <div className="relative">
        <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[#a3a3a0]" strokeWidth={1.7} />
        <input
          id={id}
          name={field.key}
          type={field.kind}
          defaultValue={field.value}
          placeholder={field.placeholder}
          autoComplete={field.kind === "password" ? "off" : undefined}
          className={FIELD}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", field.span === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
      <label htmlFor={id} className="text-[14px] font-medium text-pine">
        {field.label}
      </label>
      {control}
    </div>
  );
}

/* ---- A label + switch row (inline, no border) ------------------------- */

export function ToggleRow({ label, on, name }: { label: string; on: boolean; name: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[14px] font-medium text-pine">{label}</span>
      <Switch on={on} name={name} label={label} />
    </div>
  );
}

/* ---- Buttons (all unwired) ------------------------------------------- */

export function LimeButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-medium text-pine transition-[filter] hover:brightness-95 active:translate-y-px"
    >
      {children}
    </button>
  );
}

export function GreyButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-[#ececeb] px-5 text-[14px] font-medium text-pine transition-colors hover:bg-[#e2e2e0] active:translate-y-px"
    >
      {children}
    </button>
  );
}

export function RedButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-[#ef4444] px-5 text-[14px] font-medium text-white transition-[filter] hover:brightness-95 active:translate-y-px"
    >
      {children}
    </button>
  );
}

/* ---- Photo / logo tile with its ⋯ Actions menu ----------------------- */

export function AvatarTile({ avatar, imageUrl }: { avatar: SettingAvatar; imageUrl?: string | null }) {
  const actionIcon: Record<string, LucideIcon> = { View: Eye, Edit: Pencil, Delete: Trash2 };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-medium text-pine">{avatar.label}</span>
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-[#e4e4e1]"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar
            <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <PersonPlaceholder className="size-full text-[#adada8]" />
          )}
        </span>
        {/* The ⋯ menu, as a no-JS <details> popover — the console's own pattern. */}
        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-full bg-[#ececeb] text-pine/70 transition-colors hover:bg-[#e2e2e0] [&::-webkit-details-marker]:hidden">
            <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
          </summary>
          {/* The frosted-glass "Actions" menu, matched to the Figma exactly:
              a 3%-pine tint over a 27px backdrop-blur (waterly-transparent, the
              blurred content shows through), faint pine item pills, no shadow. */}
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 flex w-44 flex-col gap-[9px] rounded-[14px] bg-[rgba(14,50,40,0.03)] px-2.5 py-[11px] backdrop-blur-[27px]">
            <p className="m-0 text-[16px] font-medium tracking-[-0.17px] text-pine">Actions</p>
            <div aria-hidden className="h-px w-full bg-[rgba(14,50,40,0.1)]" />
            {avatar.actions.map((a) => {
              const Icon = actionIcon[a] ?? Eye;
              return (
                <button
                  key={a}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-[6px] bg-[rgba(14,50,40,0.05)] py-1.5 pr-1.5 pl-2 text-left text-[13px] text-pine transition-colors hover:bg-[rgba(14,50,40,0.1)]"
                >
                  <Icon aria-hidden className="size-4" strokeWidth={1.7} />
                  {a}
                </button>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}
