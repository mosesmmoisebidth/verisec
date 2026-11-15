"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * The human check on public forms (Cloudflare Turnstile): sign-up, sign-in, password reset, the invitation's
 * sign-in and the contact form. The visitor's browser solves it (usually without a click); its one-time token goes
 * with the form to the console, which asks Cloudflare whether it is genuine and for this very form.
 *
 * Switched on by `turnstileSiteKey` in /config.js (no rebuild). Without a key nothing renders and every form works
 * as before; the console skips the check too until its secret is set.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("blocked"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const readKey = () => {
  const cfg = (window as unknown as { __RECOG_CONFIG__?: { turnstileSiteKey?: unknown } }).__RECOG_CONFIG__;
  return typeof cfg?.turnstileSiteKey === "string" && cfg.turnstileSiteKey ? cfg.turnstileSiteKey : null;
};

/** The configured site key (read after the page loads; the static export has no server config). */
function useSiteKey(): string | null {
  return useSyncExternalStore(
    () => () => {},
    readKey,
    () => null,
  );
}

function Widget({ siteKey, action, theme, onToken }: { siteKey: string; action: string; theme: "light" | "dark"; onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme,
          size: "flexible",
          "refresh-expired": "auto",
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, action, theme, onToken]);

  // Cloudflare's box is 300 px wide whatever the page: on a narrow phone card it is scaled down to fit, so the page
  // never scrolls sideways (the check itself is unchanged)
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e?.contentRect.width ?? 300) / 300)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={frame} className="w-full overflow-hidden" style={{ height: scale < 1 ? Math.ceil(65 * scale) : undefined }}>
        <div
          ref={box}
          className="min-h-[65px] w-full origin-top-left"
          style={scale < 1 ? { width: 300, transform: `scale(${scale})` } : undefined}
        />
      </div>
      {failed ? (
        <p role="alert" className="m-0 text-[13px] leading-snug text-[#b3261e]">
          The security check could not load. Check your connection, or allow challenges.cloudflare.com if a blocker is
          on, then reload the page.
        </p>
      ) : null}
    </div>
  );
}

export type HumanCheck = {
  /** A site key is configured: the form shows the check and must send its token. */
  enabled: boolean;
  /** The check is solved (or switched off): the form may be sent. */
  ready: boolean;
  widget: ReactNode;
  /** The token for one request. The check starts again afterwards: each token works once. */
  take: () => string | undefined;
};

/** `theme`: "dark" for a check that sits on a dark panel (the public demo); every form keeps the light one. */
export function useHumanCheck(action: string, theme: "light" | "dark" = "light"): HumanCheck {
  const siteKey = useSiteKey();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  return {
    enabled: !!siteKey,
    ready: !siteKey || !!token,
    widget: siteKey ? <Widget key={round} siteKey={siteKey} action={action} theme={theme} onToken={setToken} /> : null,
    take: () => {
      const t = token ?? undefined;
      setToken(null);
      setRound((r) => r + 1);
      return t;
    },
  };
}

/** The console's answer to a failed check or too many attempts, in words for the person. */
export function humanCheckProblem(status: number, data: unknown): string | null {
  const code = (data as { code?: unknown } | null)?.code;
  if (code === "captcha_failed") return "The security check didn't go through. Please complete it again.";
  if (status === 429 || code === "too_many") return "Too many attempts. Please wait a few minutes and try again.";
  return null;
}
