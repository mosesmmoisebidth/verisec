"use client";

import { useEffect, useState } from "react";
import { Building2, Copy, Globe, Link2, Loader2, Lock, Mail, Save, User, type LucideIcon } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { IconField, SettingsCard } from "@/components/settings/parts";
import { PhotoTile } from "@/components/settings/photo-tile";
import { TwoFactorToggle } from "@/components/settings/two-factor-setup";
import { authApi } from "@/lib/auth-api";
import { brandingApi, type Branding } from "@/lib/console/branding-api";
import { refreshCurrentAccount, useCurrentAccount } from "@/lib/console/use-current-account";
import type { BrandingSettings, BusinessSettings, ProfileSettings } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/* A controlled, icon-led input matching parts.tsx FIELD, for the fields we actually save. */
const FIELD =
  "h-[52px] w-full rounded-[12px] border border-[#e6e6e3] bg-white pr-4 pl-11 text-[15px] text-pine " +
  "placeholder:text-[#a3a3a0] outline-none transition-colors focus-visible:border-pine/40 " +
  "focus-visible:ring-2 focus-visible:ring-lime/50";

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  span = "full",
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  span?: "half" | "full";
}) {
  const readOnly = !onChange;
  return (
    <div className={cn("flex flex-col gap-2", span === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
      <label className="text-[14px] font-medium text-pine">{label}</label>
      <div className="relative">
        <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[#a3a3a0]" strokeWidth={1.7} />
        {readOnly ? (
          <div className={cn(FIELD, "flex items-center bg-[#f2f2ef] text-pine/75")}>{value || "—"}</div>
        ) : (
          <input
            type={type}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={cn(FIELD, "disabled:opacity-60")}
          />
        )}
      </div>
    </div>
  );
}

function SaveButton({ onClick, saving, disabled, label }: { onClick: () => void; saving: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-medium text-pine transition-[filter] hover:brightness-95 active:translate-y-px disabled:opacity-50"
    >
      {saving ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} /> : <Save aria-hidden className="size-4" strokeWidth={1.8} />}
      {label}
    </button>
  );
}

/* --------------------------------------------------------------- Profile -- */

export function ProfileCard({ data }: { data: ProfileSettings }) {
  const { status, account } = useCurrentAccount();
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seeded && status === "authed" && account) {
      setName(account.name);
      setSeeded(true);
    }
  }, [seeded, status, account]);

  const save = async () => {
    const next = name.trim();
    if (!next) return;
    setSaving(true);
    try {
      await authApi.updateProfile(next);
      await refreshCurrentAccount();
      toast.success("Profile saved");
    } catch (e) {
      toast.error("Could not save your profile", msg(e));
    } finally {
      setSaving(false);
    }
  };

  const changed = seeded && name.trim() !== (account?.name ?? "").trim();

  return (
    <SettingsCard>
      <div className="flex flex-col gap-5">
        <PhotoTile
          label={data.photo.label}
          imageUrl={account?.avatar ?? null}
          max={256}
          onUpload={async (dataUrl) => {
            await authApi.setAvatar(dataUrl);
            await refreshCurrentAccount();
          }}
          onClear={async () => {
            await authApi.setAvatar("");
            await refreshCurrentAccount();
          }}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={data.name.label} icon={User} value={name} onChange={setName} span="half" placeholder={data.name.placeholder} />
          <Field label={data.email.label} icon={Mail} value={account?.email ?? data.email.value ?? ""} span="half" />
          {/* No real password is ever held; a blank field, inert as before. */}
          <IconField field={{ ...data.password, value: "" }} />
        </div>
        <TwoFactorToggle toggle={data.twoFactor} setup={data.twoFactorSetup} />
        <IconField field={data.language} />
        <SaveButton onClick={() => void save()} saving={saving} disabled={!changed} label={data.save} />
      </div>
    </SettingsCard>
  );
}

/* -------------------------------------------------------------- Business -- */

export function BusinessCard({ data }: { data: BusinessSettings }) {
  const { status, account } = useCurrentAccount();
  const canEdit = account?.role === "owner" || account?.role === "admin";
  const [org, setOrg] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seeded && status === "authed" && account?.org) {
      setOrg(account.org);
      setSeeded(true);
    }
  }, [seeded, status, account]);

  const save = async () => {
    const next = org.trim();
    if (next.length < 2) return;
    setSaving(true);
    try {
      await authApi.renameOrg(next);
      await refreshCurrentAccount();
      toast.success("Business info saved");
    } catch (e) {
      toast.error("Could not save the business info", msg(e));
    } finally {
      setSaving(false);
    }
  };

  const changed = seeded && org.trim() !== (account?.org ?? "").trim();

  return (
    <SettingsCard>
      <div className="flex flex-col gap-5">
        <OrgLogoTile label={data.photo.label} canEdit={canEdit} />
        <Field
          label={data.name.label}
          icon={Building2}
          value={org}
          onChange={canEdit ? setOrg : undefined}
          placeholder={data.name.placeholder}
        />
        {/* Industry: a cosmetic control for now (not persisted). */}
        <IconField field={data.industry} />
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-pine">Tenant ID</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Tenant ID"
              readOnly
              value={account?.tenantId ?? (status === "loading" ? "Loading…" : "Unavailable")}
              className="h-[52px] min-w-0 flex-1 rounded-[12px] border border-[#e6e6e3] bg-[#f2f2ef] px-4 font-mono text-[14px] text-pine/75 outline-none"
            />
            <button
              type="button"
              disabled={!account?.tenantId}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(account?.tenantId ?? "");
                  toast.success("Tenant ID copied");
                } catch {
                  toast.error("Could not copy the Tenant ID", "Select and copy the ID from the field.");
                }
              }}
              className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-full bg-[#ececeb] px-5 text-[14px] font-medium text-pine transition-colors hover:bg-[#e2e2e0] disabled:opacity-50"
            >
              <Copy aria-hidden className="size-4" /> Copy
            </button>
          </div>
          <p className="m-0 text-[12px] text-pine/55">Permanent Zitadel organization ID. It cannot be edited because your team data is keyed to it.</p>
        </div>
        {canEdit ? (
          <SaveButton onClick={() => void save()} saving={saving} disabled={!changed} label="Save changes" />
        ) : (
          <p className="m-0 text-[13px] text-pine/55">Only an owner or admin can change the business name.</p>
        )}
      </div>
    </SettingsCard>
  );
}

/* --------------------------------------------------------------- Branding -- */

/** The org logo tile, shared by the Business tab and the Branding tab (one logo, shown to applicants). */
export function OrgLogoTile({ label, canEdit }: { label: string; canEdit: boolean }) {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    brandingApi.get().then((b) => live && setLogo(b.logo)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <PhotoTile
      label={label}
      imageUrl={logo}
      max={420}
      editable={canEdit}
      placeholder={<Building2 aria-hidden className="size-10 text-[#adada8]" strokeWidth={1.5} />}
      onUpload={async (dataUrl) => {
        const r = await brandingApi.setLogo(dataUrl);
        setLogo(r.logo ?? dataUrl);
      }}
      onClear={async () => {
        await brandingApi.clearLogo();
        setLogo(null);
      }}
    />
  );
}

export function BrandingCard({ data }: { data: BrandingSettings }) {
  const { account } = useCurrentAccount();
  const canEdit = account?.role === "owner" || account?.role === "admin";
  const [b, setB] = useState<Branding | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [returnUrl, setReturnUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    brandingApi
      .get()
      .then((v) => {
        if (!live) return;
        setB(v);
        setCompanyName(v.companyName ?? "");
        setReturnUrl(v.returnUrl ?? "");
      })
      .catch(() => live && setB({ companyName: null, returnUrl: null, logo: null, hasLogo: false }));
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await brandingApi.update({ companyName: companyName.trim() || null, returnUrl: returnUrl.trim() || null });
      setB((prev) => (prev ? { ...prev, companyName: r.companyName, returnUrl: r.returnUrl } : prev));
      toast.success("Branding saved", "Your applicants will see this on the verification screens.");
    } catch (e) {
      toast.error("Could not save branding", msg(e));
    } finally {
      setSaving(false);
    }
  };

  const changed =
    b != null && (companyName.trim() !== (b.companyName ?? "").trim() || returnUrl.trim() !== (b.returnUrl ?? "").trim());

  return (
    <SettingsCard>
      <div className="flex flex-col gap-5">
        <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed text-pine/65">
          Branding is what the people you verify see on the hosted verification screens — your name and logo at the
          top, and where they go when they finish. It does not change your account details on the Business tab.
        </p>

        <OrgLogoTile label="Logo" canEdit={canEdit} />

        <Field
          label={data.companyName.label}
          icon={Building2}
          value={companyName}
          onChange={canEdit ? setCompanyName : undefined}
          placeholder={data.companyName.placeholder ?? "Shown to applicants, e.g. Acme Inc."}
        />
        <Field
          label={data.returnUrl.label}
          icon={Link2}
          value={returnUrl}
          onChange={canEdit ? setReturnUrl : undefined}
          type="url"
          placeholder={data.returnUrl.placeholder ?? "https://your-site.com/thanks"}
        />
        <div className="flex flex-col gap-2">
          <Field
            label={data.customDomain.label}
            icon={Globe}
            value={data.customDomain.value ?? ""}
            placeholder="verify.your-domain.com"
          />
          <span className="flex items-center gap-1.5 text-[13px] text-pine/55">
            <Lock aria-hidden className="size-3.5" strokeWidth={1.8} />
            Custom domain is coming soon — talk to us to set it up.
          </span>
        </div>

        {canEdit ? (
          <SaveButton onClick={() => void save()} saving={saving} disabled={!changed || b == null} label={data.save} />
        ) : (
          <p className="m-0 text-[13px] text-pine/55">Only an owner or admin can change branding.</p>
        )}
      </div>
    </SettingsCard>
  );
}

function msg(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 403) return "Only an owner or admin can change this.";
  const m = (e as { message?: string })?.message;
  return m && m.length < 120 ? m : "Please try again.";
}
