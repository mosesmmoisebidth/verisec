"use client";

import { useEffect, useState } from "react";

import { signIn } from "@/config/auth";
import { googleSignInUrl } from "@/lib/auth-api";

/**
 * "Continue with Google", under the sign-in and sign-up forms. It goes to the console, which runs the sign-in with
 * Google and brings the person back: a new account to onboarding, a returning one straight to its portal (or the
 * page `next` names). Shown once public/config.js says `googleSignIn: true`, so a site whose address Google does not
 * know yet never offers a button that fails.
 */
export function GoogleButton({ next }: { next: string | null }) {
  const [on, setOn] = useState(false);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    const cfg = (window as unknown as { __RECOG_CONFIG__?: { googleSignIn?: boolean } }).__RECOG_CONFIG__;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(cfg?.googleSignIn === true);
  }, []);
  if (!on) return null;
  return (
    <>
      <div className="flex items-center gap-4 pt-1">
        <span className="h-px flex-1 bg-card-line" />
        <span className="text-body text-quiet">{signIn.dividerLabel}</span>
        <span className="h-px flex-1 bg-card-line" />
      </div>
      <button
        type="button"
        disabled={going}
        onClick={() => {
          setGoing(true);
          window.location.href = next ? `${googleSignInUrl}?next=${encodeURIComponent(next)}` : googleSignInUrl;
        }}
        className="inline-flex h-13 w-full items-center justify-center gap-3 rounded-box border border-card-line bg-tile text-field text-pine transition-colors hover:bg-hover-light disabled:opacity-70"
      >
        <GoogleMark />
        {signIn.google}
      </button>
    </>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
