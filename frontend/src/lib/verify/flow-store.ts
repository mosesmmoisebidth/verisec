"use client";

/**
 * Client-side KYC flow state.
 *
 * The applicant flow is a sequence of routes (one URL per screen) that runs in
 * the static export with no server session. The captured/uploaded document
 * images and the Regula IDV read result must survive those per-step navigations,
 * so they live in `sessionStorage` under one key. Cleared when the flow ends or
 * the tab closes. Never contains anything the applicant did not just provide.
 */

export type DocSide = "front" | "back";

export interface FlowState {
  docType?: string; // "national-id" | "passport" | "licence" | "residence-permit"
  country?: string;
  documents: { front?: string; back?: string }; // base64 data URLs (passport uses `front` only)
  captureMode?: "capture" | "upload";
  idvResult?: unknown; // the read response
  /** false while a read made before Confirm Details (the upload step reads two-sided documents
   *  early) has not been handled there yet: recorded on the verification and counted. */
  idvProcessed?: boolean;
  idvError?: string;
  /** What the parser resolved the document to (self-corrected from what Regula
   *  detected), so later steps can use the corrected country and type. */
  resolved?: { outcome: string; country: string; docType: string | null };
  /** How many captures of this document have failed on quality alone. Used to
   *  allow a second attempt through, flagged, instead of looping forever. */
  qualityAttempts?: number;
  /** Recorded when the applicant was allowed through despite unresolved quality
   *  errors, so the outcome is auditable. */
  qualityRecord?: { attempts: number; errors: string[]; at: number };
  /** The selfie-to-document face match (Document stage, after Confirm Details).
   *  The live selfie is matched 1:1 against the document portrait. */
  faceMatch?: {
    matched: boolean; // similarity >= threshold
    similarity: number; // 0..1
    score: number;
    threshold: number;
    selfie?: string; // the captured live selfie (data URL)
    at: number;
  };
  /** Which liveness scenario was run ("passive" | "blink" | "active"). */
  faceMode?: string;
  /** The liveness check that actually ran on the last attempt (may differ from
   *  faceMode through the retry ladder), and how many attempts it took. */
  faceEngine?: string;
  faceAttempts?: number;
  /** The Regula face-liveness result (from the face-liveness component event). */
  faceResult?: {
    code: number; // 0 = liveness passed
    status: number; // FaceLivenessResultStatus: 0 confirmed, 1 not confirmed, 2 unknown
    tag?: string;
    transactionId?: string;
    estimatedAge?: number | null;
    type?: number;
    image?: string; // response.images[0] (the captured selfie)
  };
  /** Who the document says the applicant is, as confirmed on Confirm Details.
   *  Used only for watchlist screening. */
  subject?: { name?: string; dob?: string; nationality?: string; documentCountry?: string; address?: string };
  /** Contact details and whether each was confirmed with a one-time code. */
  contact?: {
    phone?: string;
    phoneCountry?: string;
    phoneSentTo?: string;
    phoneVerified?: boolean;
    /** Signed proof of each verification (the server trusts these, not the flags). */
    phoneToken?: string;
    emailToken?: string;
    /** Dev only: the code shown on screen while SMS runs in placeholder mode. */
    phoneTestCode?: string;
    email?: string;
    emailSentTo?: string;
    emailVerified?: boolean;
    walletAddress?: string;
  };
  /** The screening outcome for this session (applicant-safe: no reasons). */
  screening?: { reference: string; outcome: "approved" | "review"; at: number; findings?: import("./kyc-api").Findings };
  /** Proof of address: what the applicant typed, the document check, and the address they confirmed. */
  poa?: {
    typed?: string;
    fileName?: string;
    result?: import("./kyc-api").PoaResult;
    confirmed?: Partial<Record<keyof import("./kyc-api").PoaAddress, string>>;
    edited?: string[];
    at?: number;
  };
  /** Set when this tab continued a verification started earlier (the answers came from the server). */
  resumedAt?: number;
  updatedAt?: number;
  /** The photos (and the read) did not fit this browser's session storage: they are in IndexedDB (see writeFlow). */
  heavy?: boolean;
}

/** A passport is one image (the whole page); cards have a front and a back. */
export function isSingleImageDoc(docType?: string): boolean {
  return (docType ?? "").toLowerCase().includes("passport");
}

const KEY = "verisec.kyc.flow";

/**
 * This tab's flow, as last written. Session storage holds about 5 MB in Safari and Chrome, and a phone camera's
 * full-size photo is several MB as a data URL: such a write fails. The flow then lives here for the tab, and the
 * photos and the read go to IndexedDB (no such limit) so a reload finds them; session storage keeps the rest. The
 * photos are never resized: the read gets exactly what the applicant took.
 */
let memory: FlowState | null = null;

const IDB = "verisec-flow";
const IDB_STORE = "flow";

function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(IDB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction(IDB_STORE, mode);
          const req = op(tx.objectStore(IDB_STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
          tx.oncomplete = () => open.result.close();
        } catch {
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

type Heavy = { documents?: FlowState["documents"]; idvResult?: unknown };

export function readFlow(): FlowState {
  if (typeof window === "undefined") return { documents: {} };
  if (memory) return memory;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { documents: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { documents: {}, ...parsed } : { documents: {} };
  } catch {
    return { documents: {} };
  }
}

/**
 * The flow with its photos, after a reload too: what readFlow gives, plus the photos and the read from IndexedDB
 * when they were too large for session storage. The steps that need the photos call this once when they open.
 */
export async function hydrateFlow(): Promise<FlowState> {
  const f = readFlow();
  if (typeof window === "undefined" || !f.heavy || f.documents?.front) return f;
  const h = await idb<Heavy>("readonly", (s) => s.get("heavy"));
  if (h) memory = { ...f, documents: h.documents ?? {}, ...(h.idvResult !== undefined && f.idvResult === undefined ? { idvResult: h.idvResult } : {}) };
  return readFlow();
}

export function writeFlow(patch: Partial<FlowState>): FlowState {
  const next: FlowState = { ...readFlow(), ...patch, updatedAt: Date.now() };
  delete next.heavy;
  memory = next;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // too large for session storage (full-size phone photos): the photos and the read go to IndexedDB, the rest
      // stays in session storage, and this tab keeps all of it in memory
      const { documents, idvResult, ...light } = next;
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ ...light, documents: {}, heavy: true }));
      } catch {
        /* storage unavailable: this tab still holds the flow in memory */
      }
      void idb("readwrite", (s) => s.put({ documents, idvResult } satisfies Heavy, "heavy"));
    }
  }
  return next;
}

export function setDocument(side: DocSide, dataUrl: string): FlowState {
  const f = readFlow();
  return writeFlow({ documents: { ...f.documents, [side]: dataUrl } });
}

export function clearFlow(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  memory = null;
  void idb("readwrite", (s) => s.delete("heavy"));
}
