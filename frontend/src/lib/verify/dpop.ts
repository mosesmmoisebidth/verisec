/**
 * Device-bound verification session (OAuth 2.0 DPoP, RFC 9449) for the applicant flow.
 *
 * - The device key is an ECDSA P-256 key made by WebCrypto with `extractable: false`: script
 *   can use it to sign but can never read or export the private key. It is kept in IndexedDB
 *   so a page refresh keeps the same device identity.
 * - The session token the server returns is bound to that key. Every request carries a fresh
 *   proof (method + exact URL + time + unique id + token hash) signed by the key, so a copied
 *   token or a captured request is useless elsewhere.
 */
import { exportJWK, SignJWT, type JWK } from "jose";

const API_BASE = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const DB = "verisec-dpop";
const STORE = "keys";
const TOKEN_KEY = "verisec.kyc.session";
const LINK_KEY = "verisec.kyc.link";
/**
 * This device's unfinished verification (localStorage, so it outlives the tab): the link secret
 * it was opened with. The server binds a session to the device key that opened it first, so the
 * secret is worthless on any other device; on this one it lets the applicant come back later
 * (or renew an expired token) and continue the same verification.
 */
const RESUME_KEY = "verisec.kyc.resume";

type Session = { accessToken: string; expiresAt: string };
export type Resumable = { secret: string; sessionId?: string; resumeUntil?: string; savedAt: number };

/* ---------------------------------------------------------------- device key -- */

function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

let keyPromise: Promise<{ key: CryptoKeyPair; jwk: JWK }> | null = null;

/**
 * Seconds this device's clock is behind the server's (negative: ahead). The server refuses a proof dated outside
 * a short window; a phone whose clock is off learns the server's time from that refusal and dates its proofs in it.
 */
let skew = 0;
const nowSec = () => Math.floor(Date.now() / 1000) + skew;

/** The server's time, learned from a refused proof: proofs are dated in it from now on. */
export function fixClock(serverTime: number) {
  skew = serverTime - Math.floor(Date.now() / 1000);
}

function deviceKey() {
  keyPromise ??= (async () => {
    let key = await idb<CryptoKeyPair | undefined>("readonly", (s) => s.get("device")).catch(() => undefined);
    if (!key) {
      key = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      await idb("readwrite", (s) => s.put(key, "device")).catch(() => undefined);
    }
    const { kty, crv, x, y } = await exportJWK(key.publicKey); // the public half only
    return { key, jwk: { kty, crv, x, y } };
  })();
  return keyPromise;
}

async function sha256b64url(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  let bin = "";
  for (const b of d) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A one-use proof for exactly this request. */
export async function proof(method: string, url: string, accessToken?: string): Promise<string> {
  const { key, jwk } = await deviceKey();
  // a same-origin API base gives relative URLs; resolve them against this page so the proof never throws
  const u = new URL(url, window.location.origin);
  const jti = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  return new SignJWT({
    htm: method,
    htu: `${u.origin}${u.pathname}`,
    jti,
    ...(accessToken ? { ath: await sha256b64url(accessToken) } : {}),
  })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk })
    .setIssuedAt(nowSec())
    .sign(key.privateKey);
}

/* ------------------------------------------------------------- link gate -- */

/**
 * What stands between the applicant and the flow: the link's access code (asked once, on the device that opens it
 * first), or the reason the verification cannot go on (disabled, finished, expired, opened elsewhere). The flow
 * shows it over every screen (components/verify/link-gate.tsx), instead of quietly running something else.
 */
export type LinkGate =
  | { kind: "code"; reason: string; wrong: boolean }
  | { kind: "stopped"; title: string; reason: string }
  | null;

let gate: LinkGate = null;
const gateListeners = new Set<() => void>();
let codeAnswer: ((code: string) => void) | null = null;

function setGate(next: LinkGate) {
  gate = next;
  gateListeners.forEach((l) => l());
}
export const linkGate = {
  get: () => gate,
  subscribe(l: () => void) {
    gateListeners.add(l);
    return () => void gateListeners.delete(l);
  },
  /** The applicant typed the access code. */
  answer(code: string) {
    const a = codeAnswer;
    codeAnswer = null;
    a?.(code);
  },
};

function askCode(reason: string, wrong: boolean): Promise<string> {
  setGate({ kind: "code", reason, wrong });
  return new Promise((resolve) => {
    codeAnswer = resolve;
  });
}

const STOPPED_TITLE: Record<string, string> = {
  session_disabled: "This verification has been disabled",
  session_complete: "This verification is already complete",
  other_device: "This verification is open on another device",
  access_locked: "This link is locked",
  invalid_grant: "This link can no longer be used",
};

/** A verification that cannot go on: the screen says why, once, over the flow. */
export function stopped(error: string | undefined, reason: string) {
  const title = (error && STOPPED_TITLE[error]) || "This verification cannot be opened";
  setGate({ kind: "stopped", title, reason });
}

/* ------------------------------------------------------------ phone hand-off -- */

/**
 * This tab is a phone doing one face step of a verification another device holds (handoff.ts): every call uses that
 * step's own token, and nothing else (no link, no kept verification, no demo) ever opens here.
 */
let handoffSession: Session | null = null;
// the phone page asks for its token before the code is opened (the organisation name, for one): it waits for it
let handoffWait: { promise: Promise<Session>; done: (s: Session | null, reason?: string) => void } | null = null;
export function setHandoffSession(s: Session | null, reason?: string) {
  handoffSession = s;
  handoffWait?.done(s, reason);
  handoffWait = null;
}
export function isHandoffTab(): boolean {
  return handoffSession !== null || onHandoffPage();
}
function onHandoffPage(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/verify/handoff");
}
function handoffToken(): Promise<Session> {
  if (!handoffWait) {
    let done: (s: Session | null, reason?: string) => void = () => {};
    const promise = new Promise<Session>((ok, fail) => {
      done = (s, reason) => (s ? ok(s) : fail(new Error(reason ?? "Open this page by scanning the code on your computer screen.")));
    });
    handoffWait = { promise, done };
  }
  return handoffWait.promise;
}

/* ------------------------------------------------------------------ session -- */

/** The verification link carries `?session=<secret>`: keep it for this tab, drop it from the URL. */
export function captureLinkSecret() {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  const s = u.searchParams.get("session");
  if (!s) return;
  try {
    sessionStorage.setItem(LINK_KEY, s);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  u.searchParams.delete("session");
  window.history.replaceState(null, "", u.toString());
}

function stored(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as Session | null;
    return s && Date.parse(s.expiresAt) - Date.now() > 30_000 ? s : null;
  } catch {
    return null;
  }
}

export function dropSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/* ------------------------------------------------------------------ resuming -- */

/** The verification this device can come back to, if any. */
export function resumable(): Resumable | null {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as Resumable | null;
    return r && typeof r.secret === "string" ? r : null;
  } catch {
    return null;
  }
}

/** Forget this device's verification (the applicant starts a new one). */
export function forgetResumable() {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {}
}

/** A verification this device finished, kept without its link secret until its window would have ended. */
type Finished = { finished: true; sessionId?: string; until: number };
const FINISHED_FOR = 7 * 24 * 60 * 60_000;
const COMPLETE_REASON = "This verification can't be opened again. You can close this page.";

/**
 * This device finished its verification: coming back says so and never opens anything else (no other verification
 * starts in its place). The link secret is dropped; the server refuses a finished verification anyway.
 */
export function markFinished() {
  try {
    const r = resumable();
    const until = Math.max(Date.parse(r?.resumeUntil ?? "") || 0, Date.now() + FINISHED_FOR);
    localStorage.setItem(RESUME_KEY, JSON.stringify({ finished: true, sessionId: r?.sessionId, until } satisfies Finished));
  } catch {}
}

function finishedHere(): boolean {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null") as Partial<Finished> | null;
    if (!r?.finished) return false;
    if (typeof r.until !== "number" || Date.now() > r.until) {
      localStorage.removeItem(RESUME_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** True when there is a verification to open: a link just opened, or one this device started. */
export function hasVerificationToOpen(): boolean {
  captureLinkSecret();
  try {
    if (sessionStorage.getItem(LINK_KEY)) return true;
  } catch {}
  return !!resumable();
}

type Exchanged =
  | { ok: true; accessToken: string; expiresAt: string; sessionId?: string; resumeUntil?: string }
  | { ok: false; error?: string; reason: string; status: number };

/** Link secret (+ its access code) + proof of this device's key -> a token bound to the key. */
async function exchange(secret: string, accessCode?: string, clockFixed = false): Promise<Exchanged> {
  const url = `${API_BASE}/api/kyc/sessions/exchange`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: await proof("POST", url) },
      body: JSON.stringify({ clientSecret: secret, ...(accessCode ? { accessCode } : {}) }),
    });
    const j = (await r.json().catch(() => ({}))) as Partial<Session> & {
      reason?: string;
      error?: string;
      sessionId?: string;
      resumeUntil?: string;
      server_time?: number;
    };
    // this device's clock is off: date the proof in the server's time and ask once more
    if (r.status === 401 && j.error === "invalid_dpop_proof" && typeof j.server_time === "number" && !clockFixed) {
      skew = j.server_time - Math.floor(Date.now() / 1000);
      return exchange(secret, accessCode, true);
    }
    if (r.ok && j.accessToken && j.expiresAt) {
      return { ok: true, accessToken: j.accessToken, expiresAt: j.expiresAt, sessionId: j.sessionId, resumeUntil: j.resumeUntil };
    }
    return { ok: false, error: j.error, reason: j.reason ?? "Your verification link has expired.", status: r.status };
  } catch {
    return { ok: false, reason: "We couldn't reach the verification service. Check your connection and try again.", status: 0 };
  }
}

/** Answers that mean the kept verification is over for good (not a network hiccup). */
const FINAL = new Set(["session_complete", "invalid_grant", "other_device"]);

let opening: Promise<Session> | null = null;

/**
 * A valid session token for this device. In order: the token this tab already holds; a link
 * just opened (it replaces anything older); the verification this device started earlier (the
 * same session continues, see RESUME_KEY); else, in development only, a new demo session.
 */
export async function session(): Promise<Session> {
  // a phone doing one face step uses that step's own token and never opens anything else
  if (handoffSession) return handoffSession;
  if (onHandoffPage()) return handoffToken();
  captureLinkSecret(); // a newly opened link replaces any older session in this tab
  const have = stored();
  if (have) return have;
  opening ??= (async () => {
    let link: string | null = null;
    try {
      link = sessionStorage.getItem(LINK_KEY);
    } catch {}
    const kept = link ? null : resumable();
    if (!link && !kept && finishedHere()) {
      // this device finished its verification: it says so, and nothing else opens in its place
      stopped("session_complete", COMPLETE_REASON);
      throw new Error(COMPLETE_REASON);
    }
    let secret = link ?? kept?.secret ?? null;
    let res = secret ? await exchange(secret) : null;
    // the link asks for its access code (given with the link, apart from it): asked over the flow, tried, asked again
    while (res && !res.ok && (res.error === "access_code_required" || res.error === "access_code_wrong")) {
      const code = await askCode(res.reason, res.error === "access_code_wrong");
      res = await exchange(secret!, code);
    }
    if (gate?.kind === "code") setGate(null);
    if (link && res && !res.ok && res.error && res.error !== "rate_limited" && res.status !== 0) {
      // a link that cannot open says why; it never turns into a different (demo) verification
      try {
        sessionStorage.removeItem(LINK_KEY);
      } catch {}
      stopped(res.error, res.reason);
      throw new Error(res.reason);
    }
    if (res && !res.ok && kept && res.error === "session_disabled") {
      // the verification this device kept was disabled by the organisation: say so, never start another
      stopped(res.error, res.reason);
      throw new Error(res.reason);
    }
    if (res && !res.ok && kept && res.error && FINAL.has(res.error)) {
      // the verification this device kept is over (finished, past its window, or held by another device): the screen
      // says why. It never turns into a different (demo) verification, and a finished one is remembered as finished.
      if (res.error === "session_complete") markFinished();
      else forgetResumable();
      stopped(res.error, res.reason);
      throw new Error(res.reason);
    }
    if (!secret) {
      // Development only: the server allows this when KYC_DEV_SESSIONS=true.
      const r = await fetch(`${API_BASE}/api/kyc/sessions/dev`, { method: "POST" });
      if (!r.ok) throw new Error("Please open the verification link you were sent.");
      secret = ((await r.json()) as { clientSecret: string }).clientSecret;
      res = await exchange(secret);
    }
    try {
      sessionStorage.removeItem(LINK_KEY); // moved to RESUME_KEY below, or dead
    } catch {}
    if (!res || !res.ok) throw new Error(res?.reason ?? "Your verification link has expired.");
    try {
      localStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ secret, sessionId: res.sessionId, resumeUntil: res.resumeUntil, savedAt: Date.now() } satisfies Resumable),
      );
    } catch {}
    const s = { accessToken: res.accessToken, expiresAt: res.expiresAt };
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    } catch {}
    return s;
  })().finally(() => {
    opening = null;
  });
  return opening;
}
