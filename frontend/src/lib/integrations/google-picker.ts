/**
 * Google Picker for the Integrations connect flow. Lets a person choose the exact Google Sheet (or
 * Drive folder) that VeriSec should write to, using only the non-sensitive `drive.file` scope: a file
 * the user picks here is "opened with the app", so our backend can write to just that file without the
 * broad `spreadsheets` scope (which would otherwise force Google's sensitive-scope verification and its
 * demo-video review).
 *
 * Config is read at runtime from window.__RECOG_CONFIG__ (no rebuild needed to change it):
 *   googleIntegrationsClientId - the integrations OAuth client id (the same one the backend uses)
 *   googlePickerApiKey         - a browser API key with the Google Picker API enabled
 */

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
// The integrations OAuth client (public value; also baked into the backend's authorize URL).
const FALLBACK_CLIENT_ID = "32813504347-qk19colfcuetrc1321qg2hd0c543fuv4.apps.googleusercontent.com";

type Cfg = { googleIntegrationsClientId?: string; googlePickerApiKey?: string };
const cfg = (): Cfg =>
  typeof window !== "undefined"
    ? ((window as unknown as { __RECOG_CONFIG__?: Cfg }).__RECOG_CONFIG__ ?? {})
    : {};

const clientId = () => cfg().googleIntegrationsClientId || FALLBACK_CLIENT_ID;

/** True once a browser API key is set, so the UI can show the picker instead of a plain text field. */
export function pickerConfigured(): boolean {
  return !!cfg().googlePickerApiKey;
}

/* ---- the slivers of the Google globals we touch, typed so the strict build stays happy ---- */
interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
interface PickerView {
  setMimeTypes(mimeTypes: string): PickerView;
  setSelectFolderEnabled(enabled: boolean): PickerView;
}
interface PickerDoc {
  id: string;
  name?: string;
}
interface PickerData {
  action: string;
  docs?: PickerDoc[];
}
interface PickerInstance {
  setVisible(visible: boolean): void;
}
interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin?: string): PickerBuilder;
  addView(view: PickerView): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (data: PickerData) => void): PickerBuilder;
  build(): PickerInstance;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string }) => void;
      }): TokenClient;
    };
  };
  picker: {
    DocsView: new (viewId?: unknown) => PickerView;
    ViewId: { SPREADSHEETS: unknown; FOLDERS: unknown };
    PickerBuilder: new () => PickerBuilder;
    Action: { PICKED: string; CANCEL: string };
  };
}
interface GapiGlobal {
  load(name: string, callback: { callback: () => void }): void;
}
const w = () => window as unknown as { gapi?: GapiGlobal; google?: GoogleGlobal };

/* ---- load each external script once, memoised by URL ---- */
const loading = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(el);
  });
  loading.set(src, p);
  return p;
}

let pickerReady: Promise<void> | null = null;
async function ensurePicker(): Promise<void> {
  await loadScript("https://apis.google.com/js/api.js");
  if (!pickerReady) {
    pickerReady = new Promise<void>((resolve) => {
      const gapi = w().gapi;
      if (!gapi) throw new Error("Google API script did not load.");
      gapi.load("picker", { callback: () => resolve() });
    });
  }
  return pickerReady;
}

/** A short-lived browser access token (drive.file) just to open the Picker. */
async function getAccessToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  const google = w().google;
  if (!google) throw new Error("Google sign-in script did not load.");
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: DRIVE_FILE_SCOPE,
      callback: (resp) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject(new Error(resp.error_description || resp.error || "Google sign-in was cancelled."));
      },
      error_callback: (err) => reject(new Error(err.type || "Google sign-in was cancelled.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export type PickedFile = { id: string; name: string };

/**
 * Open the Google Picker and resolve with the chosen file (or null if the person closed it).
 * `kind` picks the view: a spreadsheet to append rows to, or a folder to drop summary files in.
 */
export async function pickGoogleFile(kind: "spreadsheet" | "folder"): Promise<PickedFile | null> {
  const apiKey = cfg().googlePickerApiKey;
  if (!apiKey) throw new Error("Google Picker isn't set up yet. Ask an admin to add the Picker API key to the site config.");
  // A native <dialog> opened with showModal() sits in the browser's TOP LAYER, which is painted above the
  // Picker (ordinary DOM), so the Picker would appear behind it and be unclickable. Hide the host dialog while
  // the Picker is open — it stays mounted, so its React state and selections are kept — and restore it after.
  // The host "What … receives" box is a native modal (showModal → top layer), and an open modal makes
  // EVERYTHING outside it inert — so the Picker would show but be frozen (unclickable). Just hiding it isn't
  // enough; we must actually close it while the Picker is open. We swallow the close event so React's onClose
  // doesn't unmount it, keeping its state (selected events etc.), then reopen it as a modal afterwards.
  const hostDialog = typeof document !== "undefined" ? (document.querySelector("dialog[open]") as HTMLDialogElement | null) : null;
  const wasModal = !!hostDialog && hostDialog.open;
  const closeHost = () => {
    if (!wasModal || !hostDialog) return;
    // close() fires the `close` event asynchronously, and React's onClose (which would UNMOUNT the box) is
    // registered on the element before ours — so a listener on the dialog itself runs too late. Register on
    // document in the CAPTURE phase so we intercept first, swallow the event (React never sees it, so it keeps
    // the box mounted with its state), and remove ourselves once it fires.
    const swallow = (e: Event) => {
      if (e.target !== hostDialog) return;
      e.stopImmediatePropagation();
      document.removeEventListener("close", swallow, true);
    };
    document.addEventListener("close", swallow, true);
    try {
      hostDialog.close();
    } catch {
      document.removeEventListener("close", swallow, true);
    }
    // Safety net: never leak the listener if the close event somehow doesn't arrive.
    setTimeout(() => document.removeEventListener("close", swallow, true), 3000);
  };
  const restoreHost = () => {
    if (!wasModal || !hostDialog) return;
    try {
      if (!hostDialog.open) hostDialog.showModal();
    } catch {
      /* ignore */
    }
  };
  try {
    await ensurePicker();
    const token = await getAccessToken();
    const google = w().google;
    if (!google) throw new Error("Google Picker did not load.");
    const g = google.picker;
    closeHost();
    return await new Promise<PickedFile | null>((resolve) => {
      const view =
        kind === "folder"
          ? new g.DocsView(g.ViewId.FOLDERS).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder")
          : new g.DocsView(g.ViewId.SPREADSHEETS).setMimeTypes("application/vnd.google-apps.spreadsheet");
      const picker = new g.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setAppId(clientId().split("-")[0] ?? "")
        .setOrigin(typeof window !== "undefined" ? window.location.origin : undefined)
        .addView(view)
        .setTitle(kind === "folder" ? "Choose a Drive folder" : "Choose a spreadsheet")
        .setCallback((data) => {
          if (data.action === g.Action.PICKED) {
            restoreHost();
            const doc = data.docs?.[0];
            resolve(doc ? { id: String(doc.id), name: String(doc.name ?? doc.id) } : null);
          } else if (data.action === g.Action.CANCEL) {
            restoreHost();
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  } catch (e) {
    restoreHost();
    throw e;
  }
}

/**
 * Create a brand-new spreadsheet in the person's Google Drive and return it. `drive.file` covers files the app
 * itself creates, so no Picker (and no broad scope) is needed; our backend, the same OAuth app, can then append
 * rows to it. Used by the "Create a new sheet" option so people don't have to make one by hand first.
 */
export async function createGoogleSheet(title: string): Promise<PickedFile> {
  const token = await getAccessToken();
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!res.ok) throw new Error(`Couldn't create the spreadsheet (HTTP ${res.status}).`);
  const data = (await res.json()) as { spreadsheetId?: string };
  if (!data.spreadsheetId) throw new Error("Google didn't return the new spreadsheet id.");
  return { id: String(data.spreadsheetId), name: title };
}
