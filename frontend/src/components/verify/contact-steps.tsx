"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, ShieldCheck } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import { CountrySelect } from "@/components/ui/country-select";
import type { Country } from "@/lib/countries";
import type { ScreenContext } from "@/lib/verify/types";
import { readFlow, writeFlow } from "@/lib/verify/flow-store";
import { kycApi } from "@/lib/verify/kyc-api";
import { cn } from "@/lib/utils";

/*
 * The Phone & Email Verification stage, wired to the Console API:
 *
 *   phone       check the number exists and can take a text -> send a code
 *   phone-code  enter the code (Twilio Verify)
 *   email       check the mailbox exists -> send a code
 *   email-code  enter the code
 *   findings    "Please wait while we validate your details": screening
 *
 * No code is ever sent to a number or address that failed its existence check.
 */

const INPUT =
  "h-11 w-full rounded-well border border-divider bg-white px-3.5 text-field text-pine outline-none transition-colors placeholder:text-pine/47 focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/28";

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-2 rounded-well bg-caution-tint/60 px-3.5 py-3 text-body text-caution">
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ phone -- */

export function PhoneStepClient({ ctx, countries }: { ctx: ScreenContext; countries: Country[] }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [country, setCountry] = useState("rw");
  const [restored, setRestored] = useState(0);
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default to the applicant's own country (document), or their last entry.
  useEffect(() => {
    const f = readFlow();
    const c = f.contact?.phoneCountry || f.subject?.documentCountry || f.country;
    if (c && countries.some((x) => x.code === c.toLowerCase())) {
      setCountry(c.toLowerCase());
      setRestored(1);
    }
    if (f.contact?.phone) {
      const dial = countries.find((x) => x.code === (f.contact?.phoneCountry ?? ""))?.dial;
      if (dial && f.contact.phone.startsWith(dial)) setNumber(f.contact.phone.slice(dial.length));
    }
  }, [countries]);

  const dial = countries.find((c) => c.code === country)?.dial ?? "";

  const submit = useCallback(async () => {
    if (busy) return;
    // National numbers are often typed with a trunk "0" (0788...): drop it.
    const national = number.replace(/\D/g, "").replace(/^0+/, "");
    if (national.length < 4 || national.length > 14) {
      setError("Please enter your full mobile number.");
      return;
    }
    const e164 = `${dial}${national}`;
    setBusy(true);
    setError(null);
    const check = await kycApi.phoneCheck(e164);
    if (!check.ok) {
      setError(check.reason);
      setBusy(false);
      return;
    }
    if (!check.data.exists) {
      setError(check.data.reason ?? "We couldn't confirm this number exists. Please check it.");
      setBusy(false);
      return;
    }
    const sent = await kycApi.phoneSend(e164);
    if (!sent.ok) {
      setError(sent.reason);
      setBusy(false);
      return;
    }
    const f = readFlow();
    writeFlow({
      contact: {
        ...f.contact,
        phone: e164,
        phoneCountry: country,
        phoneSentTo: sent.data.sentTo,
        phoneVerified: false,
        phoneTestCode: sent.data.testCode,
      },
    });
    if (next) router.push(`/verify/${next}`);
  }, [busy, number, dial, country, next, router]);

  return (
    <FlowShell ctx={ctx} nav={{ onNext: submit, loading: busy, nextDisabled: !number.trim() }}>
      <form
        method="post"
        className="flex max-w-[460px] flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kyc-phone" className="text-field font-medium text-pine/82">
            Mobile number
          </label>
          <div className="flex gap-2">
            <div className="w-[122px] shrink-0">
              <CountrySelect
                key={restored}
                countries={countries}
                defaultCode={country}
                onChange={setCountry}
                label="Country calling code"
                dial
                className="h-11 w-full rounded-well border border-divider bg-white pr-8 pl-3 text-field text-pine"
              />
            </div>
            <input
              id="kyc-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="788 123 456"
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setError(null);
              }}
              className={cn(INPUT, "min-w-0 flex-1")}
            />
          </div>
          <span className="text-read text-quiet">We check that the number exists before we send you a code.</span>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </form>
    </FlowShell>
  );
}

/* ------------------------------------------------------------------ email -- */

export function EmailStepClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = readFlow().contact?.email;
    if (saved) setEmail(saved);
    setWalletAddress(readFlow().contact?.walletAddress ?? "");
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    const value = email.trim();
    if (walletAddress.trim() && !/^[\x21-\x7e]{1,128}$/.test(walletAddress.trim())) {
      setError("Enter one wallet address without spaces, or leave it blank.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuggestion(null);
    const check = await kycApi.emailCheck(value);
    if (!check.ok) {
      setError(check.reason);
      setBusy(false);
      return;
    }
    if (!check.data.exists) {
      setError(check.data.reason ?? "We couldn't confirm this email address exists. Please check it.");
      if (check.data.suggestion) setSuggestion(check.data.suggestion);
      setBusy(false);
      return;
    }
    const sent = await kycApi.emailSend(value);
    if (!sent.ok) {
      setError(sent.reason);
      setBusy(false);
      return;
    }
    const f = readFlow();
    writeFlow({ contact: { ...f.contact, email: value.toLowerCase(), emailSentTo: sent.data.sentTo, emailVerified: false, walletAddress: walletAddress.trim() || undefined } });
    if (next) router.push(`/verify/${next}`);
  }, [busy, email, walletAddress, next, router]);

  return (
    <FlowShell ctx={ctx} nav={{ onNext: submit, loading: busy, nextDisabled: !email.trim() }}>
      <form
        method="post"
        className="flex max-w-[460px] flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kyc-email" className="text-field font-medium text-pine/82">
            Email
          </label>
          <input
            id="kyc-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
              setSuggestion(null);
            }}
            className={INPUT}
          />
          <span className="text-read text-quiet">We check that the address exists before we send you a code.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kyc-wallet" className="text-field font-medium text-pine/82">Wallet address (optional)</label>
          <input id="kyc-wallet" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
            maxLength={128} value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Enter a wallet address" className={INPUT} />
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {suggestion ? (
          <button
            type="button"
            onClick={() => {
              setEmail(suggestion);
              setError(null);
              setSuggestion(null);
            }}
            className="self-start rounded-pill bg-pine/8 px-4 py-2 text-body font-medium text-pine transition-colors hover:bg-pine/14"
          >
            Use {suggestion}
          </button>
        ) : null}
      </form>
    </FlowShell>
  );
}

/* ------------------------------------------------------------- code entry -- */

const CODE_LEN = 6;
const RESEND_SECONDS = 30;

export function CodeStepClient({ ctx, channel }: { ctx: ScreenContext; channel: "phone" | "email" }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [target, setTarget] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [missing, setMissing] = useState(false);
  const [testCode, setTestCode] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const c = readFlow().contact;
    const t = channel === "phone" ? c?.phone : c?.email;
    if (!t) {
      setMissing(true);
      return;
    }
    setTarget(t);
    setSentTo((channel === "phone" ? c?.phoneSentTo : c?.emailSentTo) ?? t);
    if (channel === "phone" && c?.phoneTestCode) setTestCode(c.phoneTestCode);
    boxes.current[0]?.focus();
  }, [channel]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const code = digits.join("");

  const verify = useCallback(
    async (value: string) => {
      if (!target || busy || value.length !== CODE_LEN) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      const res = channel === "phone" ? await kycApi.phoneVerify(target, value) : await kycApi.emailVerify(target, value);
      if (res.ok && res.data.verified) {
        const f = readFlow();
        writeFlow({
          contact: {
            ...f.contact,
            ...(channel === "phone"
              ? { phoneVerified: true, phoneTestCode: undefined, phoneToken: res.data.token }
              : { emailVerified: true, emailToken: res.data.token }),
          },
        });
        if (next) router.push(`/verify/${next}`);
        return;
      }
      setError(res.ok ? (res.data.reason ?? "That code isn't right.") : res.reason);
      setDigits(Array(CODE_LEN).fill(""));
      setBusy(false);
      boxes.current[0]?.focus();
    },
    [target, busy, channel, next, router],
  );

  const setAt = (i: number, raw: string) => {
    const only = raw.replace(/\D/g, "");
    if (only.length > 1) {
      // A pasted or autofilled code fills every box from here on.
      const nextDigits = [...digits];
      for (let k = 0; k < only.length && i + k < CODE_LEN; k++) nextDigits[i + k] = only[k]!;
      setDigits(nextDigits);
      const joined = nextDigits.join("");
      boxes.current[Math.min(i + only.length, CODE_LEN - 1)]?.focus();
      if (joined.length === CODE_LEN) void verify(joined);
      return;
    }
    const nextDigits = [...digits];
    nextDigits[i] = only;
    setDigits(nextDigits);
    setError(null);
    if (only && i < CODE_LEN - 1) boxes.current[i + 1]?.focus();
    const joined = nextDigits.join("");
    if (joined.length === CODE_LEN) void verify(joined);
  };

  const resend = async () => {
    if (!target || cooldown > 0) return;
    setError(null);
    setNotice(null);
    const res = channel === "phone" ? await kycApi.phoneSend(target) : await kycApi.emailSend(target);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    if (channel === "phone" && res.data.testCode) {
      setTestCode(res.data.testCode);
      const f = readFlow();
      writeFlow({ contact: { ...f.contact, phoneTestCode: res.data.testCode } });
    }
    setCooldown(RESEND_SECONDS);
    setDigits(Array(CODE_LEN).fill(""));
    setNotice("A new code is on its way.");
    boxes.current[0]?.focus();
  };

  if (missing) {
    return (
      <FlowShell ctx={ctx} nav={{ nextDisabled: true }}>
        <ErrorNote>
          {channel === "phone" ? "Please enter your mobile number first." : "Please enter your email address first."}{" "}
          <Link href={`/verify/${channel}`} className="font-medium underline underline-offset-2">
            Go back
          </Link>
        </ErrorNote>
      </FlowShell>
    );
  }

  return (
    <FlowShell ctx={ctx} nav={{ onNext: () => void verify(code), loading: busy, nextDisabled: code.length !== CODE_LEN }}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="flex max-w-[330px] flex-col gap-3">
          <p className="m-0 text-read text-quiet">
            We sent a code to <span className="font-medium text-pine">{sentTo}</span>. It expires in 10 minutes.
          </p>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={cooldown > 0}
            className="self-start text-body text-pine underline underline-offset-4 transition-colors hover:text-pine/70 disabled:cursor-not-allowed disabled:text-quiet disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          {testCode ? (
            // Dev placeholder while SMS is not connected: nothing was texted.
            <p className="m-0 rounded-well border border-dashed border-pine/30 bg-lime/15 px-3.5 py-3 text-body text-pine">
              <span className="font-medium">Test mode:</span> text messages are not connected yet, so no SMS was sent. Your
              code is <span className="tnum font-medium tracking-[0.2em]">{testCode}</span>.
            </p>
          ) : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {notice ? <p className="m-0 text-body text-ramp-2">{notice}</p> : null}
        </div>

        <div
          className="grid w-full max-w-otp shrink-0 gap-2.5"
          style={{ gridTemplateColumns: `repeat(${CODE_LEN}, minmax(0, 1fr))` }}
        >
          {digits.map((d, i) => (
            <div key={i}>
              <label htmlFor={`otp-${i}`} className="sr-only">
                Digit {i + 1} of {CODE_LEN}
              </label>
              <input
                id={`otp-${i}`}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                value={d}
                disabled={busy}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="tnum aspect-square h-[52px] w-full rounded-box border border-divider bg-tile text-center text-[22px] text-pine transition-[border-color,background-color,box-shadow] focus:border-pine focus:bg-white focus-visible:ring-4 focus-visible:ring-lime/50 focus-visible:outline-none disabled:opacity-60"
              />
            </div>
          ))}
        </div>
      </div>
    </FlowShell>
  );
}

/* ------------------------------------------------------------- validation -- */

/** A random id for this browser (no personal data), for device-reuse checks. */
function deviceId(): string | undefined {
  try {
    let id = window.localStorage.getItem("verisec.device");
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem("verisec.device", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

const STAGES = [
  "Confirming your phone number",
  "Confirming your email address",
  "Checking your identity against global watchlists",
  "Reviewing your connection",
];

type ScreenPhase = "running" | "approved" | "review" | "error";

export function ScreeningStepClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const [phase, setPhase] = useState<ScreenPhase>("running");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState({ phone: false, email: false });
  const started = useRef(false);

  const run = useCallback(async () => {
    // A tab that did not walk the flow here (or continue it) has nothing to screen: send it to the
    // start, where a saved verification is offered to continue.
    const fresh = readFlow();
    if (!fresh.subject?.name && !fresh.contact?.phoneVerified && !fresh.contact?.emailVerified) {
      router.replace("/verify/start");
      return;
    }
    setPhase("running");
    setError(null);
    setStage(0);
    const f = readFlow();
    setVerified({ phone: !!f.contact?.phoneVerified, email: !!f.contact?.emailVerified });
    const res = await kycApi.screen({
      ...f.subject,
      declaredCountry: f.country,
      phone: f.contact?.phone,
      phoneToken: f.contact?.phoneToken,
      emailToken: f.contact?.emailToken,
      deviceId: deviceId(),
      email: f.contact?.email,
      walletAddress: f.contact?.walletAddress,
      livenessAttempts: f.faceAttempts,
      faceMatched: f.faceMatch ? f.faceMatch.matched : undefined,
      documentQualityOverride: !!f.qualityRecord,
    });
    if (!res.ok) {
      setError(res.reason);
      setPhase("error");
      return;
    }
    writeFlow({
      screening: { reference: res.data.reference, outcome: res.data.outcome, at: Date.now(), findings: res.data.findings },
    });
    setStage(STAGES.length);
    setPhase(res.data.outcome);
    // Let the completed checklist register for a beat, then show the report.
    window.setTimeout(() => {
      if (next) router.replace(`/verify/${next}`);
    }, 700);
  }, [next, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  // The checks run together on the server; the list advances so the wait reads
  // as progress, and completes the moment the answer arrives.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1100);
    return () => window.clearInterval(id);
  }, [phase]);

  const done = phase === "approved" || phase === "review";

  return (
    <FlowShell
      ctx={ctx}
      nav={{ onNext: () => next && router.push(`/verify/${next}`), nextDisabled: !done, loading: phase === "running" }}
    >
      <div className="flex max-w-[520px] flex-col gap-5">
        {phase === "running" || phase === "error" ? (
          <div className="flex flex-col gap-4 rounded-well border border-divider bg-pine/[0.03] p-5">
            <p className="m-0 flex items-center gap-2.5 text-read font-medium text-pine">
              {phase === "running" ? <Loader2 aria-hidden className="size-5 shrink-0 animate-spin" strokeWidth={1.8} /> : null}
              {phase === "running" ? "Please wait while we validate your details." : "We couldn't finish checking your details."}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-live="polite">
              {STAGES.map((label, i) => {
                const state = i < stage ? "done" : i === stage && phase === "running" ? "active" : "todo";
                return (
                  <li key={label} className={cn("flex items-center gap-2.5 text-body", state === "todo" ? "text-quiet" : "text-pine")}>
                    <span
                      className={cn(
                        "grid size-[18px] shrink-0 place-items-center rounded-full",
                        state === "done" ? "bg-lime text-pine" : "border border-divider bg-white",
                      )}
                    >
                      {state === "done" ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
                      {state === "active" ? <Loader2 aria-hidden className="size-3 animate-spin text-pine" strokeWidth={2.2} /> : null}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
            {phase === "error" ? (
              <>
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <button
                  type="button"
                  onClick={() => void run()}
                  className="inline-flex h-9 w-fit items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
                >
                  Try again
                </button>
              </>
            ) : null}
          </div>
        ) : phase === "approved" ? (
          <div className="flex flex-col gap-3 rounded-well bg-pass-tint/70 px-4 py-4">
            <span className="flex items-center gap-2.5 text-read font-medium text-ramp-2">
              <ShieldCheck aria-hidden className="size-5 shrink-0" strokeWidth={1.8} /> Your details have been checked.
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {[
                verified.phone ? "Phone number confirmed" : null,
                verified.email ? "Email address confirmed" : null,
                "Identity checks complete",
              ]
                .filter(Boolean)
                .map((r) => (
                  <li key={r} className="flex items-center gap-2.5 text-body text-pine">
                    <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-lime text-pine">
                      <Check aria-hidden className="size-3" strokeWidth={3} />
                    </span>
                    {r}
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-well border border-divider bg-pine/[0.03] px-4 py-4">
            <span className="flex items-center gap-2.5 text-read font-medium text-pine">
              <ShieldCheck aria-hidden className="size-5 shrink-0" strokeWidth={1.8} /> Thanks, we have everything we need.
            </span>
            <p className="m-0 text-body text-quiet">
              Your details need a quick manual review before your verification is complete. You can continue, and we will
              be in touch if we need anything else.
            </p>
          </div>
        )}
      </div>
    </FlowShell>
  );
}
