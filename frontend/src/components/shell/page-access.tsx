"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { firstAllowedPage, landingLabel, useAccess } from "@/lib/access";

/**
 * A page the signed-in person's role does not include shows this instead of its content (the console refuses the
 * data anyway). A home page they cannot use (the Billing role on the dashboard) sends them to their first page.
 */
export function PageAccess({ portal, children }: { portal: "kyc" | "fin"; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { ready, can, canOpen, roleName } = useAccess();
  const allowed = canOpen(pathname);
  const home = firstAllowedPage(can, portal);
  const isHome = /^\/(fin\/?)?(dashboard\/?)?$/.test(pathname);

  useEffect(() => {
    if (ready && !allowed && isHome) window.location.replace(home);
  }, [ready, allowed, isHome, home]);

  if (!ready || allowed) return <>{children}</>;
  if (isHome) return null;
  return (
    <section className="grid place-items-center rounded-shell border border-hairline bg-panel px-6 py-16">
      <div className="flex max-w-[440px] flex-col items-center gap-4 text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-pill bg-pine text-lime">
          <LockKeyhole className="size-6" strokeWidth={1.8} />
        </span>
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">This page is not part of your role</h1>
        <p className="m-0 text-body text-slate">
          You are signed in with the {roleName ?? "member"} role. If you need this page, ask an Owner or Admin of your team to
          change your role.
        </p>
        <a
          href={home}
          className="mt-1 inline-flex h-[35px] items-center rounded-pill bg-lime px-4 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
        >
          Go to {landingLabel(home)}
        </a>
      </div>
    </section>
  );
}
