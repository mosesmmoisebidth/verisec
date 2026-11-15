"use client";

import { AvatarTile, IconField } from "@/components/settings/parts";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { SettingAvatar, SettingField } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * Settings fields that show the SIGNED-IN user, not the page's demo data.
 *
 * The Settings screen is a static export shipped with specimen values; these
 * client wrappers swap in the real identity from `/api/auth/me` once it loads.
 * `IconField` sets the input's value with `defaultValue` (fixed at mount), so we
 * hold a skeleton until the account resolves and then mount the field with the
 * real value — never a flash of the specimen, never a stale default.
 */

function FieldSkeleton({ field }: { field: SettingField }) {
  return (
    <div className={cn("flex flex-col gap-2", field.span === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
      <span className="text-[14px] font-medium text-pine">{field.label}</span>
      <div className="h-[52px] w-full animate-pulse rounded-[12px] border border-[#e6e6e3] bg-[#f2f2ef]" />
    </div>
  );
}

/** Profile tab: Name + Email, from the signed-in user. */
export function ProfileIdentityFields({ name, email }: { name: SettingField; email: SettingField }) {
  const { status, account } = useCurrentAccount();
  if (status === "loading") {
    return (
      <>
        <FieldSkeleton field={name} />
        <FieldSkeleton field={email} />
      </>
    );
  }
  if (status === "authed" && account) {
    return (
      <>
        <IconField key={`n-${account.email}`} field={{ ...name, value: account.name }} />
        <IconField key={`e-${account.email}`} field={{ ...email, value: account.email }} />
      </>
    );
  }
  return (
    <>
      <IconField field={name} />
      <IconField field={email} />
    </>
  );
}

/** Profile tab: the photo tile, showing the signed-in user's avatar. */
export function ProfilePhotoTile({ avatar }: { avatar: SettingAvatar }) {
  const { account } = useCurrentAccount();
  return <AvatarTile avatar={avatar} imageUrl={account?.avatar ?? null} />;
}

/** Business tab: the tenant/org name, from the signed-in user's org. */
export function LiveOrgNameField({ field }: { field: SettingField }) {
  const { status, account } = useCurrentAccount();
  if (status === "loading") return <FieldSkeleton field={field} />;
  if (status === "authed" && account?.org) {
    return <IconField key={account.org} field={{ ...field, value: account.org }} />;
  }
  return <IconField field={field} />;
}
