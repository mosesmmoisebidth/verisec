"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Car, Check, CheckCircle2, Loader2, X } from "lucide-react";

import {
  humanCheckProblem,
  useHumanCheck,
} from "@/components/security/human-check";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/** What the plate engine can pick out of an image; these ride along to the team as the interest list. */
const DETECT = [
  "License plate (ANPR)",
  "Vehicle make & model",
  "Vehicle colour",
  "Body style",
  "Country / region of plate",
  "Vehicle counting",
] as const;

const DEPLOY = [
  "On-premise / offline SDK",
  "Edge / embedded device",
  "Cloud API",
] as const;

type Picked = Record<string, boolean>;

/**
 * "Get access" for the ALPR / ANPR SDK. A button that opens a popup on the page it sits on (never a
 * jump to the contact page): the visitor says what they want to read from a vehicle image (plate,
 * make and model, colour, body style, counting), how they want to run it (offline SDK, edge, cloud),
 * and how to reach them. It goes to the sales inbox through the same security check the contact form
 * uses, tagged as an ALPR request, and a person replies by email.
 */
export function AlprAccessButton({
  className,
  variant = "lime",
  children = "Get access",
}: {
  className?: string;
  variant?: "lime" | "pine" | "outline";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 h-11 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-pine/40";
  const look =
    variant === "pine"
      ? "bg-pine text-lime hover:bg-pine/90"
      : variant === "outline"
        ? "border border-pine/20 bg-white text-pine hover:border-pine/40"
        : "bg-lime text-pine hover:brightness-95";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(base, look, className)}>
        {children}
        <ArrowRight aria-hidden className="size-4" />
      </button>
      <AlprAccessModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AlprAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const uid = useId();
  const human = useHumanCheck("sales_chat");
  const firstRef = useRef<HTMLInputElement>(null);

  const [detect, setDetect] = useState<Picked>({ "License plate (ANPR)": true, "Vehicle make & model": true });
  const [deploy, setDeploy] = useState<Picked>({ "On-premise / offline SDK": true });
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [company, setCompany] = useState("");
  const [volume, setVolume] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<"fullName" | "workEmail" | "human" | null>(null);

  // close on Escape, lock the page scroll, and focus the first field while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => firstRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const toggle = useCallback((set: (f: (p: Picked) => Picked) => void, key: string) => {
    set((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const submit = useCallback(async () => {
    if (sending) return;
    setError(null);
    setBadField(null);
    const name = fullName.trim();
    const email = workEmail.trim().toLowerCase();
    if (name.length < 2) return setBadField("fullName");
    if (!EMAIL.test(email)) return setBadField("workEmail");
    if (human.enabled && !human.ready) return setBadField("human");
    setSending(true);
    try {
      const captcha = human.take();
      const products = [
        "ALPR / ANPR offline SDK",
        ...DETECT.filter((d) => detect[d]),
        ...DEPLOY.filter((d) => deploy[d]).map((d) => `Deployment: ${d}`),
      ];
      const r = await fetch(`${API}/api/contact/sales-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(captcha ? { "X-Captcha-Token": captcha } : {}) },
        body: JSON.stringify({
          products,
          volume: volume.trim(),
          message: message.trim(),
          fullName: name,
          workEmail: email,
          company: company.trim(),
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const data = (await r.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
      if (!r.ok) {
        const fixable = data?.code === "invalid" && typeof data.message === "string" ? data.message : null;
        setError(humanCheckProblem(r.status, data) ?? fixable ?? "Could not send your request. Please try again in a moment.");
        return;
      }
      setDone(true);
    } catch {
      setError("You appear to be offline. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, [sending, fullName, workEmail, company, volume, message, detect, deploy, human]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-pine/45 backdrop-blur-[2px]"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.16 } }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"
          >
            {/* header */}
            <div className="flex items-start justify-between gap-4 border-b border-site-line bg-gradient-to-b from-lime/30 to-white px-6 py-5 sm:px-7">
              <div className="flex items-start gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-pine text-lime">
                  <Car aria-hidden className="size-[22px]" strokeWidth={1.8} />
                </span>
                <div>
                  <h2 id={`${uid}-title`} className="text-[21px] leading-tight font-semibold text-pine">
                    Get the ALPR / ANPR SDK
                  </h2>
                  <p className="mt-1 text-[14px] leading-snug text-pine/70">
                    Runs fully offline, on your own servers or at the edge. Tell us what you need and our team will set you up.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-full text-pine/55 transition-colors hover:bg-surface hover:text-pine"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center sm:px-7">
                <span className="grid size-14 place-items-center rounded-full bg-pass-tint text-ramp-2">
                  <CheckCircle2 aria-hidden className="size-7" />
                </span>
                <p className="m-0 text-[18px] font-semibold text-pine">Request sent</p>
                <p className="m-0 max-w-sm text-[14.5px] leading-relaxed text-slate">
                  Thanks. Our team will reach out to <span className="font-medium text-pine">{workEmail.trim().toLowerCase()}</span> about the ALPR / ANPR SDK, usually within one business day.
                </p>
                <button type="button" onClick={onClose} className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-pine px-6 text-[15px] font-medium text-lime hover:bg-pine/90">
                  Done
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6 sm:px-7">
                <Group label="What do you need to detect?">
                  <Chips options={DETECT} picked={detect} onToggle={(k) => toggle(setDetect, k)} />
                </Group>
                <Group label="How will you run it?">
                  <Chips options={DEPLOY} picked={deploy} onToggle={(k) => toggle(setDeploy, k)} />
                </Group>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input ref={firstRef} id={`${uid}-name`} label="Full name" value={fullName} onChange={setFullName} placeholder="Your name" bad={badField === "fullName"} badText="Enter your name." autoComplete="name" />
                  <Input id={`${uid}-email`} label="Work email" value={workEmail} onChange={setWorkEmail} placeholder="you@company.com" bad={badField === "workEmail"} badText="Enter a valid work email." type="email" autoComplete="email" />
                  <Input id={`${uid}-company`} label="Company" value={company} onChange={setCompany} placeholder="Company (optional)" autoComplete="organization" />
                  <Input id={`${uid}-volume`} label="Expected volume" value={volume} onChange={setVolume} placeholder="e.g. 20 cameras, 1M plates / mo" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${uid}-msg`} className="text-xs font-bold text-pine">Anything else? (optional)</label>
                  <textarea
                    id={`${uid}-msg`}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Your use case, countries, timeline, questions about vehicle or plate detection."
                    className="w-full resize-none rounded-2xl border border-pine/13 bg-white/30 px-4 py-3 text-base leading-relaxed text-pine outline-none transition-colors placeholder:text-pine/55 focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60 lg:text-sm"
                  />
                </div>

                {human.enabled ? (
                  <div className={cn(badField === "human" && "rounded-xl ring-2 ring-danger/50")}>{human.widget}</div>
                ) : null}

                {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}

                <button
                  type="button"
                  onClick={submit}
                  disabled={sending}
                  className={cn(
                    "mt-1 inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-pine/50",
                    sending ? "cursor-not-allowed bg-pine/40 text-white/70" : "bg-pine text-lime hover:bg-pine/90",
                  )}
                >
                  {sending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
                  {sending ? "Sending" : "Request access"}
                  {!sending ? <ArrowRight aria-hidden className="size-[18px]" /> : null}
                </button>
                <p className="m-0 text-center text-[12.5px] leading-relaxed text-slate">
                  Protected by a security check. We only use your details to answer this request.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-bold text-pine">{label}</span>
      {children}
    </div>
  );
}

function Chips({ options, picked, onToggle }: { options: readonly string[]; picked: Picked; onToggle: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = !!picked[o];
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-pine/40",
              on ? "border-pine bg-pine text-lime" : "border-pine/15 bg-white text-pine hover:border-pine/35",
            )}
          >
            {on ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
            {o}
          </button>
        );
      })}
    </div>
  );
}

const Input = function Input({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  bad,
  badText,
  ref,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  bad?: boolean;
  badText?: string;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-pine">{label}</label>
      <input
        ref={ref}
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-3xl border bg-white/30 px-4 text-base text-pine outline-none transition-colors placeholder:text-pine/55 focus-visible:ring-2 focus-visible:ring-lime/60 lg:text-sm",
          bad ? "border-danger/60 focus-visible:border-danger" : "border-pine/13 focus-visible:border-pine/40",
        )}
      />
      {bad && badText ? <span className="text-[12.5px] text-danger">{badText}</span> : null}
    </div>
  );
};
