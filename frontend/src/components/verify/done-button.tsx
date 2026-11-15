"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { dropSession, markFinished } from "@/lib/verify/dpop";
import { clearFlow } from "@/lib/verify/flow-store";
import { useTenantBrand } from "@/lib/verify/brand";

/**
 * The final button of a verification. It clears everything the flow kept on this device (the photos and answers held
 * during the flow, and the session). When the organisation set a return URL in its Branding, the applicant is sent
 * back there; otherwise the button asks the browser to close the tab. A page may only close a tab a script opened,
 * and phones usually refuse, so when the tab stays open the button is replaced by a short line saying it is safe to close.
 */
export function DoneButton({ label, className }: { label: string; className: string }) {
  const brand = useTenantBrand();
  const [closed, setClosed] = useState(false);
  const returnUrl = brand?.returnUrl && /^https?:\/\//i.test(brand.returnUrl) ? brand.returnUrl : null;

  if (closed) {
    return (
      <span className="inline-flex h-9 items-center gap-2 text-body text-pine">
        <span aria-hidden className="grid size-5 place-items-center rounded-pill bg-pine text-white">
          <Check className="size-3" strokeWidth={2.4} />
        </span>
        All done. You can close this tab.
      </span>
    );
  }

  const finish = () => {
    try {
      clearFlow();
      // kept as finished (not forgotten): coming back says it is complete, never opens another verification
      markFinished();
      dropSession();
    } catch {
      /* storage blocked: nothing kept to clear */
    }
    if (returnUrl) {
      // Back to the organisation's own site, where they sent the applicant from.
      window.location.assign(returnUrl);
      return;
    }
    window.close();
    // a tab the browser will not let a script close stays open: say so instead
    setClosed(true);
  };

  return (
    <button type="button" onClick={finish} className={className}>
      {returnUrl && brand?.name ? `Return to ${brand.name}` : label}
      <Check aria-hidden className="size-3.5" strokeWidth={2} />
    </button>
  );
}
