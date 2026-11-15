"use client";

import { Fragment } from "react";

import { initialsOf, useTenantBrand, useTenantName } from "@/lib/verify/brand";

/** The token flow copy uses where the organisation's own name goes. */
export const ORG_TOKEN = "{org}";

/** A short pulse where the name will appear, so copy never shows a wrong name while loading. */
function Pending() {
  return (
    <>
      <span
        aria-hidden
        className="inline-block h-[0.85em] w-24 translate-y-[0.1em] animate-pulse rounded-pill bg-pine/10 align-baseline"
      />
      <span className="sr-only">the organisation</span>
    </>
  );
}

/** Flow copy with `{org}` filled in with the organisation that asked for this verification. */
export function TenantText({ text }: { text: string }) {
  const name = useTenantName();
  if (!text.includes(ORG_TOKEN)) return <>{text}</>;
  const parts = text.split(ORG_TOKEN);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? name ?? <Pending /> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** The organisation's initials for the avatar in the flow's header. */
export function TenantInitials() {
  const name = useTenantName();
  return <>{name ? initialsOf(name) : ""}</>;
}

/**
 * The organisation's mark in the flow header: its uploaded logo when it set one (Branding), otherwise
 * a lime badge with its initials. Keeps the same 36px footprint either way.
 */
export function TenantAvatar() {
  const brand = useTenantBrand();
  if (brand?.logoUrl) {
    return (
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-pill bg-white ring-1 ring-pine/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- org logo, a data URL from the API */}
        <img src={brand.logoUrl} alt="" className="size-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-pill bg-lime text-body font-medium text-pine"
    >
      {brand?.name ? initialsOf(brand.name) : ""}
    </span>
  );
}
