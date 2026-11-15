"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import {
  humanCheckProblem,
  useHumanCheck,
} from "@/components/security/human-check";
import { PillButton } from "@/components/ui/pill-button";
import { salesChat as c } from "@/config/contact";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * "Chat With Sales": the contact page's button, and the small chat it opens at the lower right (a bottom sheet on a
 * phone). It is a side chat, not a modal: the page stays in view and usable. One question at a time, chat style:
 * what the visitor would like to use, a rough volume and a note (both optional), then how to reach them. It goes to
 * the console the way the contact form does (same security check, same limits, same mailbox), labelled as a sales
 * chat, and a person replies by email.
 *
 * The draft is kept for this browser tab (sessionStorage), so a reload or closing the chat does not lose it; a sent
 * chat starts fresh once it is closed. Esc closes it, focus goes back to the button, and every step works from the
 * keyboard.
 */

/* ---- the draft, kept for this browser tab -------------------------------- */

type Step = "products" | "details" | "contact" | "done";
type Draft = {
  open: boolean;
  step: Step;
  /** Option ids from the config. */
  products: string[];
  volume: string;
  message: string;
  fullName: string;
  workEmail: string;
  company: string;
};
/** The places a problem can point at (`data-field` on the control that takes focus). */
type Field = "products" | "fullName" | "workEmail" | "human";

type Option = { id: string; label: string };

const KEY = "vs_sales_chat";
const STEPS: readonly Step[] = ["products", "details", "contact", "done"];
const GROUPS: readonly {
  id: string;
  label: string;
  options: readonly Option[];
}[] = c.products.groups;
const OPTIONS: readonly Option[] = [
  ...GROUPS.flatMap((g) => g.options),
  c.products.other,
];
const VOLUMES: readonly string[] = c.details.volumes;
const MAX = {
  message: 2000,
  fullName: 80,
  workEmail: 254,
  company: 120,
} as const;
const EMPTY: Draft = {
  open: false,
  step: "products",
  products: [],
  volume: "",
  message: "",
  fullName: "",
  workEmail: "",
  company: "",
};

let draft = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** The tab's saved draft, checked field by field: anything unexpected starts a fresh chat. */
function restore(): Draft {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<
      Record<keyof Draft, unknown>
    > | null;
    if (!v || typeof v !== "object") return EMPTY;
    const str = (x: unknown, max: number) =>
      typeof x === "string" ? x.slice(0, max) : "";
    const ids: unknown[] = Array.isArray(v.products) ? v.products : [];
    const d: Draft = {
      // Restore the visitor's draft, but never reopen the panel without a fresh click.
      open: false,
      step: STEPS.find((s) => s === v.step) ?? "products",
      products: OPTIONS.filter((o) => ids.includes(o.id)).map((o) => o.id),
      volume: VOLUMES.find((x) => x === v.volume) ?? "",
      message: str(v.message, MAX.message),
      fullName: str(v.fullName, MAX.fullName),
      workEmail: str(v.workEmail, MAX.workEmail),
      company: str(v.company, MAX.company),
    };
    // a later step needs what came before it
    if (!d.products.length) d.step = "products";
    if (d.step === "done" && (!d.fullName || !d.workEmail)) d.step = "contact";
    return d;
  } catch {
    return EMPTY;
  }
}

function snapshot(): Draft {
  if (!loaded) {
    loaded = true;
    draft = restore();
  }
  return draft;
}

function save(next: Partial<Draft>) {
  draft = { ...snapshot(), ...next };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage off (private mode, blocked): the chat still works, it only won't outlive a reload */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const serverDraft = () => EMPTY;
const noopSubscribe = () => () => {};
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- opening and closing, shared by the button and the floating launcher --- */

// Focus moves into the chat only when a person opens it (a click), never when a reload brings it back open.
let wantFocus = false;
function openChat() {
  wantFocus = true;
  save({ open: true });
}
function closeChat() {
  // a sent chat starts fresh next time; an unsent one keeps its draft
  save(snapshot().step === "done" ? EMPTY : { open: false });
}

/**
 * The "Chat With Sales" button in the contact hero. It only opens (or closes) the chat; the chat panel itself is
 * rendered by the always-present widget below, so the button and the floating icon open the one same chat.
 */
export function SalesChat({ label }: { label: string }) {
  const d = useSyncExternalStore(subscribe, snapshot, serverDraft);
  return (
    <PillButton
      type="button"
      variant="white"
      aria-haspopup="dialog"
      aria-expanded={d.open}
      onClick={openChat}
    >
      {label}
    </PillButton>
  );
}

/**
 * The chat that is always on the contact page: a small animated icon at the lower right (an avatar with the VeriSec
 * mark), the way other sites keep a chat within reach. It is there the moment the page loads, not conjured only when
 * a button is pressed. Clicking it opens the chat; the "Chat With Sales" button opens the same one. Place it once.
 */
export function SalesChatWidget() {
  const d = useSyncExternalStore(subscribe, snapshot, serverDraft);
  // Hydration-safe client check (as in toast.tsx): the chat is a portal, so it renders only after hydration.
  const onClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    closeChat();
    // focus returns to the launcher once it comes back into view
    requestAnimationFrame(() =>
      launcher.current?.focus({ preventScroll: true }),
    );
  }, []);

  if (!onClient) return null;
  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={d.open}
        aria-controls={d.open ? panelId : undefined}
        aria-label={c.title}
        title={c.title}
        onClick={openChat}
        className={cn(
          "group fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[80] grid size-14 place-items-center rounded-full bg-pine text-lime transition-[transform,opacity] duration-300 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 sm:right-6 sm:bottom-6",
          "shadow-[0_18px_44px_-12px_rgb(14_50_40/0.55),0_6px_16px_-10px_rgb(14_50_40/0.4)]",
          d.open ? "pointer-events-none scale-90 opacity-0" : "opacity-100",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-lime/30 [animation-duration:2.6s] motion-safe:animate-ping"
        />
        <LogoMark className="relative h-6" />
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-positive"
        />
      </button>
      {d.open
        ? createPortal(
            <ChatPanel
              id={panelId}
              d={d}
              takeFocus={wantFocus}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ChatPanel({
  id,
  d,
  takeFocus,
  onClose,
}: {
  id: string;
  d: Draft;
  takeFocus: boolean;
  onClose: () => void;
}) {
  const human = useHumanCheck("sales_chat");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [hint, setHint] = useState<{ field: Field; text: string } | null>(null);
  // bumped by "Start over", so the first question takes focus again although the step may not change
  const [round, setRound] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  // the current step's question: brought into view on each step, and focused when the visitor moved on
  const question = useRef<HTMLDivElement>(null);
  const focusNext = useRef(takeFocus);
  const settled = useRef(false);

  const ids = {
    title: `${id}-title`,
    greeting: `${id}-greeting`,
    productsHint: `${id}-products-hint`,
    volume: `${id}-volume`,
    message: `${id}-message`,
    name: `${id}-name`,
    email: `${id}-email`,
    company: `${id}-company`,
  };
  const picked = OPTIONS.filter((o) => d.products.includes(o.id));
  const somethingElse = d.products.includes(c.products.other.id);
  const started = d.step !== "products" || d.products.length > 0;
  const problem = (field: Field) => (hint?.field === field ? hint.text : null);

  // Esc closes the chat while focus is in it; the draft stays
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [onClose]);

  // each step: its question comes into view (the first step from the top), and takes focus when the visitor moved
  // on, so a screen reader reads it and Tab carries on from there
  useEffect(() => {
    const box = log.current;
    const q = question.current;
    if (box && q) {
      const top = d.step === "products" ? 0 : Math.max(0, q.offsetTop - 12);
      box.scrollTo({
        top,
        behavior: settled.current && !reducedMotion() ? "smooth" : "auto",
      });
    }
    settled.current = true;
    if (focusNext.current) {
      focusNext.current = false;
      q?.focus({ preventScroll: true });
    }
  }, [d.step, round]);

  // sending, and a send that failed, show at the end of the chat: keep them in view
  useEffect(() => {
    if (!sending && !failure) return;
    const box = log.current;
    box?.scrollTo({
      top: box.scrollHeight,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [sending, failure]);

  function goTo(step: Step) {
    focusNext.current = true;
    setHint(null);
    setFailure(null);
    save({ step });
  }

  function flag(field: Field, text: string) {
    setHint({ field, text });
    if (field !== "human")
      panel.current
        ?.querySelector<HTMLElement>(`[data-field="${field}"]`)
        ?.focus();
  }

  function edit(patch: Partial<Draft>, field?: Field) {
    if (field && hint?.field === field) setHint(null);
    save(patch);
  }

  function toggle(option: string) {
    const now = snapshot().products;
    edit(
      {
        products: now.includes(option)
          ? now.filter((p) => p !== option)
          : [...now, option],
      },
      "products",
    );
  }

  function startOver() {
    if (sending) return;
    focusNext.current = true;
    setHint(null);
    setFailure(null);
    setRound((r) => r + 1);
    save({ ...EMPTY, open: true });
  }

  async function send() {
    const fullName = d.fullName.trim().replace(/\s+/g, " ");
    const workEmail = d.workEmail.trim().toLowerCase();
    const company = d.company.trim();
    if (fullName.length < 2) {
      flag("fullName", c.contact.nameMissing);
      return;
    }
    if (!EMAIL.test(workEmail)) {
      flag("workEmail", c.contact.emailInvalid);
      return;
    }
    if (!human.ready) {
      flag("human", c.contact.humanMissing);
      return;
    }
    setHint(null);
    setFailure(null);
    setSending(true);
    try {
      const captcha = human.take();
      const r = await fetch(`${API}/api/contact/sales-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(captcha ? { "X-Captcha-Token": captcha } : {}),
        },
        body: JSON.stringify({
          products: picked.map((o) => o.label),
          volume: d.volume,
          message: d.message.trim(),
          fullName,
          workEmail,
          company,
          page: window.location.pathname,
        }),
      });
      const data = (await r.json().catch(() => null)) as {
        code?: unknown;
        message?: unknown;
      } | null;
      if (!r.ok) {
        // the console's own words only for a detail the visitor can fix; anything else gets the plain line
        const fixable =
          data?.code === "invalid" && typeof data.message === "string"
            ? data.message
            : null;
        setFailure(
          humanCheckProblem(r.status, data) ?? fixable ?? c.failed.later,
        );
        return;
      }
      focusNext.current = true;
      // the answer shows what was sent, even if a field was edited while it was on its way
      save({ step: "done", fullName, workEmail, company });
    } catch {
      setFailure(c.failed.offline);
    } finally {
      setSending(false);
    }
  }

  function next() {
    if (sending) return;
    if (d.step === "products") {
      if (picked.length) goTo("details");
      else flag("products", c.products.none);
    } else if (d.step === "details") {
      goTo("contact");
    } else if (d.step === "contact") {
      void send();
    }
  }

  const note =
    d.step === "products"
      ? picked.length
        ? c.products.picked(picked.length)
        : c.products.prompt
      : d.step === "details"
        ? c.details.note
        : null;
  const action =
    d.step === "products"
      ? c.next
      : d.step === "details"
        ? d.volume || d.message.trim()
          ? c.next
          : c.details.skip
        : sending
          ? c.contact.sending
          : failure
            ? c.failed.retry
            : c.contact.send;
  const pastDetails = d.step === "contact" || d.step === "done";

  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-labelledby={ids.title}
      aria-describedby={ids.greeting}
      tabIndex={-1}
      className={cn(
        "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] flex h-[min(620px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-[24px] border border-pine/10 bg-white text-pine outline-none",
        "shadow-[0_32px_80px_-28px_rgb(14_50_40/0.5),0_12px_28px_-16px_rgb(14_50_40/0.28)]",
        "sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(640px,calc(100dvh-3rem))] sm:w-[376px]",
        // grows out of the lower-right corner (where the launcher sits) with a soft spring settle
        "origin-bottom-right animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none motion-reduce:duration-150",
      )}
    >
      <header className="relative flex shrink-0 items-center gap-3 overflow-hidden bg-pine py-3.5 pr-2.5 pl-4 text-white">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_150%_at_100%_0%,rgb(191_235_88/0.24),transparent_58%)]"
        />
        <span
          aria-hidden
          className="relative grid size-10 shrink-0 place-items-center rounded-full bg-lime text-pine"
        >
          <LogoMark className="h-[19px]" />
        </span>
        <div className="relative min-w-0 flex-1">
          <h2
            id={ids.title}
            className="m-0 truncate text-[15.5px] leading-tight font-semibold tracking-[-0.2px]"
          >
            {c.title}
          </h2>
          <p className="m-0 mt-1 text-[12.5px] leading-tight text-white/70">
            {c.subtitle}
          </p>
        </div>
        {started && !sending ? (
          <HeaderButton label={c.startOver} onClick={startOver}>
            <RotateCcw aria-hidden className="size-4" strokeWidth={1.9} />
          </HeaderButton>
        ) : null}
        <HeaderButton label={c.closeLabel} onClick={onClose}>
          <X aria-hidden className="size-[18px]" strokeWidth={1.9} />
        </HeaderButton>
      </header>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={log}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6"
        >
          <div className="flex flex-col gap-4">
            {/* 1. what they would like to use */}
            <BotTurn>
              <Bubble id={ids.greeting}>{c.greeting}</Bubble>
              <Bubble
                ref={d.step === "products" ? question : undefined}
                focusable
              >
                {c.products.question}
              </Bubble>
              {d.step === "products" ? (
                <div className="flex flex-col gap-3 self-stretch pt-0.5">
                  {GROUPS.map((g, gi) => (
                    <fieldset key={g.id} className="m-0 min-w-0 border-0 p-0">
                      <legend className="mb-1.5 p-0 text-[11px] font-bold tracking-wide text-quiet uppercase">
                        {g.label}
                      </legend>
                      <div className="flex flex-wrap gap-1.5">
                        {g.options.map((o, oi) => (
                          <Choice
                            key={o.id}
                            type="checkbox"
                            name={`${id}-products`}
                            label={o.label}
                            checked={d.products.includes(o.id)}
                            onChange={() => toggle(o.id)}
                            field={
                              gi === 0 && oi === 0 ? "products" : undefined
                            }
                            describedBy={
                              problem("products") ? ids.productsHint : undefined
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <div className="flex flex-wrap gap-1.5">
                    <Choice
                      type="checkbox"
                      name={`${id}-products`}
                      label={c.products.other.label}
                      checked={somethingElse}
                      onChange={() => toggle(c.products.other.id)}
                    />
                  </div>
                  {problem("products") ? (
                    <p
                      id={ids.productsHint}
                      role="alert"
                      className="m-0 text-[12.5px] leading-snug text-danger"
                    >
                      {problem("products")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </BotTurn>
            {d.step !== "products" ? (
              <UserTurn
                change={
                  d.step === "done"
                    ? null
                    : {
                        label: c.products.change,
                        onClick: () => goTo("products"),
                      }
                }
              >
                {picked.map((o) => o.label).join(", ")}
              </UserTurn>
            ) : null}

            {/* 2. a rough volume and a note, both optional */}
            {d.step !== "products" ? (
              <BotTurn>
                <Bubble
                  id={ids.volume}
                  ref={d.step === "details" ? question : undefined}
                  focusable
                >
                  {c.details.question}
                </Bubble>
                {d.step === "details" ? (
                  <>
                    <fieldset
                      aria-labelledby={ids.volume}
                      className="m-0 flex min-w-0 flex-wrap gap-1.5 self-stretch border-0 p-0"
                    >
                      {VOLUMES.map((v) => (
                        <Choice
                          key={v}
                          type="radio"
                          name={`${id}-volume-choice`}
                          label={v}
                          checked={d.volume === v}
                          onChange={() => edit({ volume: v })}
                        />
                      ))}
                    </fieldset>
                    <Bubble id={ids.message}>
                      {somethingElse
                        ? c.details.messageOther
                        : c.details.message}
                    </Bubble>
                    <textarea
                      aria-labelledby={ids.message}
                      rows={3}
                      maxLength={MAX.message}
                      value={d.message}
                      onChange={(e) => edit({ message: e.target.value })}
                      placeholder={
                        somethingElse
                          ? c.details.messageOtherPlaceholder
                          : c.details.messagePlaceholder
                      }
                      className="w-full resize-none self-stretch rounded-[16px] border border-pine/15 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-pine transition-colors outline-none placeholder:text-pine/60 focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60"
                    />
                  </>
                ) : null}
              </BotTurn>
            ) : null}
            {pastDetails ? (
              <UserTurn
                change={
                  d.step === "done"
                    ? null
                    : {
                        label: c.details.change,
                        onClick: () => goTo("details"),
                      }
                }
              >
                {d.volume || d.message.trim() ? (
                  <span className="flex flex-col gap-1">
                    {d.volume ? (
                      <span>
                        <span className="text-white/65">
                          {c.details.volumeLabel}:
                        </span>{" "}
                        {d.volume}
                      </span>
                    ) : null}
                    {d.message.trim() ? (
                      <span className="line-clamp-6 whitespace-pre-line">
                        {d.message.trim()}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  c.details.none
                )}
              </UserTurn>
            ) : null}

            {/* 3. how to reach them */}
            {pastDetails ? (
              <BotTurn>
                <Bubble
                  ref={d.step === "contact" ? question : undefined}
                  focusable
                >
                  {c.contact.question}
                </Bubble>
                {d.step === "contact" ? (
                  <div className="flex flex-col gap-3 self-stretch rounded-[18px] border border-pine/10 bg-white p-3.5 shadow-[0_1px_2px_rgb(14_50_40/0.05)]">
                    <TextInput
                      id={ids.name}
                      name="name"
                      field="fullName"
                      label={c.contact.name.label}
                      placeholder={c.contact.name.placeholder}
                      autoComplete="name"
                      maxLength={MAX.fullName}
                      value={d.fullName}
                      onChange={(v) => edit({ fullName: v }, "fullName")}
                      error={problem("fullName")}
                    />
                    <TextInput
                      id={ids.email}
                      name="email"
                      field="workEmail"
                      type="email"
                      inputMode="email"
                      label={c.contact.email.label}
                      placeholder={c.contact.email.placeholder}
                      autoComplete="email"
                      maxLength={MAX.workEmail}
                      value={d.workEmail}
                      onChange={(v) => edit({ workEmail: v }, "workEmail")}
                      error={problem("workEmail")}
                    />
                    <TextInput
                      id={ids.company}
                      name="organization"
                      label={
                        <>
                          {c.contact.company.label}{" "}
                          <span className="font-normal text-quiet">
                            ({c.contact.company.optional})
                          </span>
                        </>
                      }
                      placeholder={c.contact.company.placeholder}
                      autoComplete="organization"
                      maxLength={MAX.company}
                      value={d.company}
                      onChange={(v) => edit({ company: v })}
                    />
                    {human.widget}
                    {problem("human") ? (
                      <p
                        role="alert"
                        className="m-0 text-[12.5px] leading-snug text-danger"
                      >
                        {problem("human")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </BotTurn>
            ) : null}

            {d.step === "done" ? (
              <>
                <UserTurn>
                  <span className="flex flex-col">
                    <span className="font-medium">{d.fullName}</span>
                    <span className="text-white/80">{d.workEmail}</span>
                    {d.company ? (
                      <span className="text-white/80">{d.company}</span>
                    ) : null}
                  </span>
                </UserTurn>
                <BotTurn>
                  <Bubble ref={question} focusable>
                    <span className="flex items-start gap-2">
                      <CheckCircle2
                        aria-hidden
                        className="mt-0.5 size-[18px] shrink-0 text-positive"
                        strokeWidth={2}
                      />
                      <span>
                        {c.done.thanks(d.fullName)} {c.done.body}{" "}
                        <span className="font-medium wrap-anywhere">
                          {d.workEmail}
                        </span>
                        .
                      </span>
                    </span>
                  </Bubble>
                </BotTurn>
              </>
            ) : null}

            {sending ? (
              <BotTurn>
                <Bubble>
                  <span className="inline-flex items-center gap-2.5 text-pine/75">
                    <span
                      aria-hidden
                      className="inline-flex items-center gap-1"
                    >
                      {[0, 160, 320].map((ms) => (
                        <span
                          key={ms}
                          className="vs-pulse size-1.5 rounded-full bg-pine"
                          style={{ "--vs-d": `${ms}ms` } as CSSProperties}
                        />
                      ))}
                    </span>
                    {c.sending}
                  </span>
                </Bubble>
              </BotTurn>
            ) : failure ? (
              <BotTurn>
                <div
                  role="alert"
                  className="max-w-full animate-in rounded-[18px] rounded-tl-[6px] bg-danger-tint px-3.5 py-2.5 text-[14px] leading-[1.45] text-pine ring-1 ring-danger/10 duration-300 fade-in ring-inset motion-reduce:animate-none"
                >
                  <p className="m-0 font-medium">{c.failed.title}</p>
                  <p className="m-0 mt-0.5">{failure}</p>
                  <p className="m-0 mt-1.5">
                    {c.failed.email}{" "}
                    <a
                      href={`mailto:${c.email}`}
                      className="font-medium wrap-anywhere underline underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      {c.email}
                    </a>
                    .
                  </p>
                </div>
              </BotTurn>
            ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-pine/[0.07] bg-white px-4 py-3">
          <p className="m-0 min-w-0 text-[12.5px] leading-snug text-quiet">
            {note}
          </p>
          {d.step === "done" ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 shrink-0 items-center rounded-full border border-pine/15 bg-white px-5 text-[14px] font-medium text-pine transition-colors hover:border-pine/30 hover:bg-hover-light"
            >
              {c.close}
            </button>
          ) : (
            <button
              type="submit"
              aria-disabled={sending || undefined}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-pine px-5 text-[14px] font-medium text-white transition-colors hover:bg-pine/90 aria-disabled:cursor-wait aria-disabled:opacity-75"
            >
              {sending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              {action}
              {sending ? null : <ArrowRight aria-hidden className="size-4" />}
            </button>
          )}
        </footer>
      </form>
      <p aria-live="polite" className="sr-only">
        {sending ? c.sending : ""}
      </p>
    </div>
  );
}

/* ---- pieces --------------------------------------------------------------- */

/** One turn from VeriSec Sales: the monogram, then its bubbles and anything to answer them with. */
function BotTurn({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-2">
      <span
        aria-hidden
        className="mt-px grid size-7 place-items-center rounded-full bg-pine text-lime"
      >
        <LogoMark className="h-3.5" />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">{children}</div>
    </div>
  );
}

function Bubble({
  ref,
  id,
  focusable = false,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  id?: string;
  /** A question the chat moves focus to (focus only, never in the Tab order). */
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={focusable ? -1 : undefined}
      className="max-w-full animate-in rounded-[18px] bg-cream px-3.5 py-2.5 text-[14px] leading-[1.45] text-pine ring-1 ring-pine/[0.06] duration-300 fade-in ring-inset slide-in-from-bottom-1 first:rounded-tl-[6px] motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}

/** The visitor's answer, on the right, with a way back to change it until the chat is sent. */
function UserTurn({
  children,
  change,
}: {
  children: ReactNode;
  change?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-col items-end gap-1 pl-10">
      <div className="max-w-full animate-in rounded-[18px] rounded-br-[6px] bg-pine px-3.5 py-2.5 text-[14px] leading-[1.45] wrap-anywhere text-white duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
        {children}
      </div>
      {change ? (
        <button
          type="button"
          onClick={change.onClick}
          aria-label={change.label}
          className="rounded-full px-1.5 py-0.5 text-[12px] text-pine/70 underline decoration-pine/30 underline-offset-2 transition-colors hover:text-pine hover:decoration-pine"
        >
          {c.change}
        </button>
      ) : null}
    </div>
  );
}

/** An option chip: a real checkbox or radio (keyboard and screen readers for free), drawn as a pill. */
function Choice({
  type,
  name,
  label,
  checked,
  onChange,
  field,
  describedBy,
}: {
  type: "checkbox" | "radio";
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  field?: Field;
  describedBy?: string;
}) {
  return (
    <label className="relative inline-flex max-w-full cursor-pointer">
      <input
        type={type}
        name={name}
        value={label}
        checked={checked}
        onChange={onChange}
        data-field={field}
        aria-describedby={describedBy}
        className="peer sr-only"
      />
      <span
        className={cn(
          "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13.5px] leading-snug transition-colors select-none",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2",
          checked
            ? "border-pine bg-pine text-white"
            : "border-pine/15 bg-white text-pine hover:border-pine/35 hover:bg-lime-tint",
        )}
      >
        {checked ? (
          <Check
            aria-hidden
            className="-ml-1 size-3.5 shrink-0 text-lime"
            strokeWidth={2.75}
          />
        ) : null}
        {label}
      </span>
    </label>
  );
}

function TextInput({
  id,
  name,
  field,
  label,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  maxLength,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  field?: Field;
  label: ReactNode;
  type?: "text" | "email";
  inputMode?: "text" | "email";
  autoComplete: string;
  placeholder: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-pine">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-field={field}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-10 w-full rounded-full border bg-white px-4 text-[14px] text-pine transition-colors outline-none placeholder:text-pine/60 focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60",
          error ? "border-danger" : "border-pine/15",
        )}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="m-0 text-[12.5px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Start over and Close, on the pine header: a lime ring shows keyboard focus there. */
function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative grid size-9 shrink-0 place-items-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-lime"
    >
      {children}
    </button>
  );
}
