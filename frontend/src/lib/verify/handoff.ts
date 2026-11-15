"use client";

/**
 * A face step done on the applicant's phone, for a browser with no usable camera (Tor Browser switches camera access
 * off for every website, and some computers have no camera at all).
 *
 *   computer: asks the server for a one-time code (only it can: the request carries its own device-bound token),
 *             shows the phone link as a QR code, and checks every few seconds how the phone is doing;
 *   phone:    opens the link and proves its OWN key for a token that works for that one face step only, does the
 *             step (recorded on the verification like any other), then hands the result back;
 *   computer: takes the result and moves on by itself.
 *
 * What travels between the two (the document photo a selfie is compared with, and the result) is sealed with an
 * AES-GCM key made on the computer. The key is only in the link fragment (after #), which browsers never send to a
 * server, so the server passes these on without being able to read them.
 */
import { fixClock, proof, setHandoffSession } from "./dpop";
import { kycApi } from "./kyc-api";

const API_BASE = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type HandoffStep = "liveness" | "face-match";
/** What a step running on the phone calls with its passed result; true once the computer can pick it up. */
export type PhoneDone = (result: Record<string, unknown>) => Promise<boolean>;
export type Waiting = { step: HandoffStep; key: string; link: string; expiresAt: string };
type Phone = { step: HandoffStep; key: string; accessToken: string; expiresAt: string; payload: unknown };
type Opened = { ok: true; step: HandoffStep; payload: unknown } | { ok: false; reason: string };

/** The computer tab: the code it shows and its key, so a reload keeps waiting for the same phone. */
const WAIT_KEY = "verisec.kyc.handoff.wait";
/** The phone tab: its token and the key, so a reload goes on with the same step. */
const PHONE_KEY = "verisec.kyc.handoff.phone";
const PHONE_DONE = "verisec.kyc.handoff.done";
const GONE = "This code no longer works. Make a new one on your computer and scan it again.";

function b64u(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keyOf = (k: string) => crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(k: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(k), new TextEncoder().encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64u(out);
}

async function unseal(k: string, sealed: string): Promise<unknown> {
  const b = unb64u(sealed);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await keyOf(k), b.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as unknown;
}

function read<T>(name: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(name) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function write(name: string, v: unknown) {
  try {
    if (v == null) sessionStorage.removeItem(name);
    else sessionStorage.setItem(name, JSON.stringify(v));
  } catch {
    /* storage unavailable: it lasts for this page only */
  }
}

/* ------------------------------------------------------------------ the computer -- */

/** A new code for one face step (an earlier one stops working), and the phone link the QR code shows. */
export async function startHandoff(step: HandoffStep, payload?: unknown): Promise<{ ok: true; wait: Waiting } | { ok: false; reason: string }> {
  // AES-128: a shorter link keeps the QR code easy to scan
  const key = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const sealed = payload === undefined ? undefined : await seal(key, payload);
  const r = await kycApi.handoff({ step, ...(sealed ? { payload: sealed } : {}) });
  if (!r.ok) return { ok: false, reason: r.reason };
  const wait: Waiting = { step, key, link: `${window.location.origin}/verify/handoff/#c=${r.data.code}&k=${key}`, expiresAt: r.data.expiresAt };
  write(WAIT_KEY, wait);
  return { ok: true, wait };
}

/** The code this tab already shows for this step (kept across a reload), if any. */
export function waitingHandoff(step: HandoffStep): Waiting | null {
  const w = typeof window === "undefined" ? null : read<Waiting>(WAIT_KEY);
  return w && w.step === step ? w : null;
}

export type PhoneState = "none" | "waiting" | "opened" | "expired" | "done";

/** How the phone is doing. A finished step comes back with its result, opened with the key only this tab has. */
export async function checkHandoff(wait: Waiting): Promise<{ state: PhoneState; result?: Record<string, unknown> } | null> {
  const r = await kycApi.handoffStatus();
  if (!r.ok) return null;
  if (r.data.state !== "done") return { state: r.data.state };
  try {
    return { state: "done", result: ((await unseal(wait.key, r.data.result ?? "")) ?? {}) as Record<string, unknown> };
  } catch {
    return { state: "expired" };
  }
}

/** The computer stops waiting (the phone finished, or the applicant tries here): the code stops working. */
export function endHandoff(cancel = true) {
  write(WAIT_KEY, null);
  if (cancel) void kycApi.handoffCancel();
}

/* --------------------------------------------------------------------- the phone -- */

let opening: Promise<Opened> | null = null;

/** Opens the link once (the code and key leave the address bar at once), or goes on after a reload. */
export function openHandoff(): Promise<Opened> {
  // calls made while it opened wait for its token; a code that cannot open ends them with the same reason
  opening ??= openOnce().then((r) => {
    if (!r.ok) setHandoffSession(null, r.reason);
    return r;
  });
  return opening;
}

async function openOnce(): Promise<Opened> {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const code = h.get("c");
  const key = h.get("k");
  if (code || key) window.history.replaceState(null, "", window.location.pathname);
  if (!code || !key) {
    const kept = read<Phone>(PHONE_KEY);
    if (kept && Date.parse(kept.expiresAt) > Date.now()) {
      setHandoffSession({ accessToken: kept.accessToken, expiresAt: kept.expiresAt });
      return { ok: true, step: kept.step, payload: kept.payload };
    }
    if (read<boolean>(PHONE_DONE)) return { ok: false, reason: "This face check is done. Go back to your computer to continue." };
    return { ok: false, reason: "Open this page by scanning the code on your computer screen." };
  }
  const url = `${API_BASE}/api/kyc/handoff/exchange`;
  const ask = async () =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json", DPoP: await proof("POST", url) }, body: JSON.stringify({ code }) });
  type Answer = { accessToken?: string; expiresAt?: string; step?: HandoffStep; payload?: string | null; reason?: string; error?: string; server_time?: number };
  try {
    let r = await ask();
    let j = (await r.json().catch(() => ({}))) as Answer;
    // this phone's clock is off: date the proof in the server's time and ask once more
    if (r.status === 401 && j.error === "invalid_dpop_proof" && typeof j.server_time === "number") {
      fixClock(j.server_time);
      r = await ask();
      j = (await r.json().catch(() => ({}))) as Answer;
    }
    if (!r.ok || !j.accessToken || !j.expiresAt || !j.step) return { ok: false, reason: j.reason ?? GONE };
    const payload = j.payload ? await unseal(key, j.payload) : null;
    const s: Phone = { step: j.step, key, accessToken: j.accessToken, expiresAt: j.expiresAt, payload };
    write(PHONE_KEY, s);
    setHandoffSession({ accessToken: s.accessToken, expiresAt: s.expiresAt });
    return { ok: true, step: s.step, payload };
  } catch {
    return { ok: false, reason: "We could not reach the verification service. Check your connection and try again." };
  }
}

/** The phone finished its step: the result goes back sealed with the link key, and this page is done. */
export async function finishHandoff(result: unknown): Promise<boolean> {
  const s = read<Phone>(PHONE_KEY);
  if (!s) return false;
  const r = await kycApi.handoffDone({ result: await seal(s.key, result) });
  if (r.ok) {
    write(PHONE_KEY, null);
    write(PHONE_DONE, true);
  }
  return r.ok;
}
