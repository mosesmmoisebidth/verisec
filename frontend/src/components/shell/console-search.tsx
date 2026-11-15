"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft, Search } from "lucide-react";

import { useAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

/**
 * The console's search: type a page, a tab or something on it ("playground", "2fa", "invoice", "sanctions") and the
 * closest place comes up first; Enter goes there. Results are only places this person's role may open. ⌘K / Ctrl+K
 * puts the cursor in it from anywhere in the console.
 */

type Place = { label: string; where: string; href: string; words: string };

const PLACES: Place[] = [
  { label: "Dashboard", where: "Verify", href: "/dashboard", words: "overview home summary stats statistics charts analytics metrics activity insights kpi" },
  { label: "Workflows", where: "Verify", href: "/workflows", words: "flows workflow builder steps rules checks kyc flow default workflow publish versions" },
  { label: "Workflow templates", where: "Workflows", href: "/workflows/templates", words: "templates industry presets banking fintech crypto gaming starter" },
  { label: "Verifications", where: "Verify", href: "/verifications", words: "sessions applicants records results reviews checks kyc verification list new session qr link disable delete redact" },
  { label: "AML Explorer", where: "Verify", href: "/explorer", words: "aml sanctions pep watchlist watchlists screening adverse media person entity search explorer ofac un" },
  { label: "API Keys", where: "API Keys & Playground", href: "/api-keys/keys", words: "api keys key secret token credentials create key rotate revoke developer access" },
  { label: "Playground", where: "API Keys & Playground", href: "/api-keys/playground", words: "playground api try test sandbox endpoints requests run call mrz face document ocr curl" },
  { label: "API logs", where: "API Keys & Playground", href: "/api-keys/logs", words: "logs calls requests history errors latency status codes usage of keys" },
  { label: "SDKs", where: "API Keys & Playground", href: "/api-keys/sdks", words: "sdk sdks libraries packages python node java go mobile ios android" },
  { label: "Webhooks", where: "Develop", href: "/webhooks", words: "webhooks events endpoints callbacks deliveries retries signing secret notify url" },
  { label: "Usage & Billing", where: "Manage", href: "/billing", words: "billing usage credits balance top up topup buy invoice invoices payments plan pricing upgrade budget spend cost" },
  { label: "Team", where: "Manage", href: "/team", words: "team members invite people users roles permissions colleagues owner admin developer reviewer viewer" },
  { label: "Profile", where: "Settings", href: "/settings/profile", words: "profile name email photo avatar account me personal" },
  { label: "Business", where: "Settings", href: "/settings/business", words: "business company organisation organization details address country" },
  { label: "Security", where: "Settings", href: "/settings/security", words: "security password 2fa mfa two factor authenticator totp passkey devices sign in sessions" },
  { label: "Data & Retention", where: "Settings", href: "/settings/data", words: "data retention privacy storage region delete records gdpr" },
  { label: "Notifications", where: "Settings", href: "/settings/notifications", words: "notifications alerts emails preferences bell" },
  { label: "Branding", where: "Settings", href: "/settings/branding", words: "branding logo colours colors theme brand applicant flow look" },
  { label: "Danger zone", where: "Settings", href: "/settings/danger", words: "danger zone close account delete account transfer ownership" },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Edit distance, capped: how many typos apart two short words are. */
function typos(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      best = Math.min(best, v);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length] ?? cap + 1;
}

/** How well a place answers the query (0: not at all). Its own name counts most, then the words on that page. */
function score(p: Place, q: string): number {
  const label = norm(p.label);
  if (label === q) return 1000;
  let s = 0;
  if (label.startsWith(q)) s += 600;
  else if (label.includes(q)) s += 400;
  const own = label.split(" ");
  const words = norm(`${p.where} ${p.words}`).split(" ");
  const terms = q.split(" ").filter(Boolean);
  const near = (w: string, t: string) => t.length >= 4 && typos(w, t, t.length >= 7 ? 2 : 1) <= (t.length >= 7 ? 2 : 1);
  let hit = 0;
  for (const t of terms) {
    // the page's own name first (exact, the start of a word, a typo away), then what is on the page
    const gain = own.includes(t)
      ? 200
      : t.length >= 2 && own.some((w) => w.startsWith(t))
        ? 150
        : own.some((w) => near(w, t))
          ? 110
          : words.includes(t)
            ? 120
            : t.length >= 2 && words.some((w) => w.startsWith(t))
              ? 80
              : words.some((w) => near(w, t))
                ? 50
                : 0;
    if (gain) {
      s += gain;
      hit++;
    }
  }
  // every word typed must lead somewhere on this page, or it is not the place
  if (hit < terms.length && s < 400) return 0;
  return s + hit * 10;
}

export function findPlaces(query: string, canOpen: (href: string) => boolean): Place[] {
  const q = norm(query);
  if (!q) return [];
  return PLACES.filter((p) => canOpen(p.href))
    .map((p) => ({ p, s: score(p, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}

export function ConsoleSearch({ placeholder, onGo }: { placeholder: string; onGo?: () => void }) {
  const { canOpen } = useAccess();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  const listId = useId();
  const results = useMemo(() => findPlaces(q, canOpen).slice(0, 7), [q, canOpen]);

  // ⌘K / Ctrl+K from anywhere in the console (the visible field: the rail on a laptop, the menu on a phone)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && input.current && input.current.offsetParent !== null) {
        e.preventDefault();
        input.current.focus();
        input.current.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const go = (p: Place | undefined) => {
    if (!p) return;
    setOpen(false);
    setQ("");
    onGo?.();
    window.location.href = p.href;
  };

  const showList = open && q.trim().length > 0;

  return (
    <form
      ref={box}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(results[active] ?? results[0]);
      }}
      className="relative w-full shrink-0"
    >
      <div className="flex h-[56px] w-full items-center gap-2.5 rounded-pill border border-hairline bg-white px-4 transition-colors focus-within:border-pine/30 focus-within:ring-2 focus-within:ring-lime/40">
        <Search aria-hidden className="size-[24px] shrink-0 text-[#7a7a7a]" strokeWidth={1.9} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          aria-label="Search the console"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[19px] font-normal text-pine outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:appearance-none"
        />
        {/* The keycaps use a system stack, not the brand face: only the platform's own UI font is guaranteed to
            carry U+2318, and a missing glyph renders as a notdef box rather than falling back to anything sensible. */}
        <span aria-hidden className="hidden shrink-0 items-center gap-1.5 font-[system-ui,-apple-system,'Segoe_UI',sans-serif] sm:flex">
          <Keycap>
            <Command aria-hidden className="size-3.5" strokeWidth={2} />
          </Keycap>
          <Keycap>K</Keycap>
        </span>
      </div>

      {showList ? (
        <div className="absolute inset-x-0 top-[62px] z-40 overflow-hidden rounded-[18px] border border-hairline bg-white p-1.5 shadow-[0_16px_32px_-12px_rgb(14_50_40/0.25)]">
          {results.length ? (
            <ul id={listId} role="listbox" aria-label="Places in the console" className="m-0 flex list-none flex-col gap-0.5 p-0">
              {results.map((p, i) => (
                <li
                  key={p.href}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    go(p);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5",
                    i === active ? "bg-lime-tint" : "hover:bg-panel",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-pine">{p.label}</span>
                    <span className="truncate text-micro text-muted">{p.where}</span>
                  </span>
                  {i === active ? <CornerDownLeft aria-hidden className="size-4 shrink-0 text-pine/60" strokeWidth={1.8} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 px-3 py-3 text-body text-muted">Nothing in the console matches &ldquo;{q.trim()}&rdquo;.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-[27px] place-items-center rounded-[5px] border border-hairline bg-white text-[12px] font-semibold text-[#4d4d4d] shadow-[1.8px_1.8px_3.6px_rgba(0,0,0,0.07)]">
      {children}
    </span>
  );
}
