"use client";

/**
 * Device & environment signals collected in the applicant's browser (schema_version 2).
 *
 * Everything is best effort: every read is guarded, a blocked or missing API yields null,
 * and collection never throws or blocks the flow. Nothing here decides anything; the server
 * combines these with what it sees itself (IP, headers) and scores them.
 *
 * Sent once per verification session, stored encrypted in the verification record.
 */
import { load as loadBotd } from "@fingerprintjs/botd";

import { camerasUsed } from "./camera-watch";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const safe = async <T>(fn: () => T | Promise<T>, fallback: T | null = null): Promise<T | null> => {
  try {
    return await Promise.race([
      Promise.resolve(fn()),
      new Promise<T | null>((r) => setTimeout(() => r(fallback), 2500)),
    ]);
  } catch {
    return fallback;
  }
};

async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------- hardware -- */

function screenInfo() {
  const s = window.screen;
  return {
    width: s.width,
    height: s.height,
    availWidth: s.availWidth,
    availHeight: s.availHeight,
    colorDepth: s.colorDepth,
    pixelDepth: s.pixelDepth,
    orientation: (s as Screen & { orientation?: { type?: string } }).orientation?.type ?? null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
  };
}

async function uaData() {
  const d = (navigator as Navigator & { userAgentData?: any }).userAgentData; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!d) return null;
  const hi = await safe(() =>
    d.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "uaFullVersion", "fullVersionList", "wow64"]),
  );
  return { brands: d.brands ?? [], mobile: !!d.mobile, platform: d.platform ?? "", ...(hi ?? {}) };
}

async function battery() {
  const b = await safe(() => (navigator as Navigator & { getBattery?: () => Promise<any> }).getBattery?.()); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!b) return null;
  return { level: b.level, charging: b.charging, chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : null, dischargingTime: Number.isFinite(b.dischargingTime) ? b.dischargingTime : null };
}

function webgl() {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch {
    return null;
  }
}

function network() {
  const c = (navigator as Navigator & { connection?: any }).connection; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!c) return null;
  return { effectiveType: c.effectiveType ?? null, type: c.type ?? null, rtt: c.rtt ?? null, downlink: c.downlink ?? null, saveData: !!c.saveData };
}

/* ------------------------------------------------------------ locale & time -- */

function locale() {
  const ro = Intl.DateTimeFormat().resolvedOptions();
  return {
    timeZone: ro.timeZone ?? null,
    timezoneOffset: -new Date().getTimezoneOffset(), // minutes east of UTC
    locale: ro.locale ?? null,
    calendar: ro.calendar ?? null,
    numberingSystem: ro.numberingSystem ?? null,
    hourCycle: (Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions() as { hourCycle?: string }).hourCycle ?? null,
  };
}

/* -------------------------------------------------------- storage & privacy -- */

async function storage() {
  const est = await safe(() => navigator.storage?.estimate?.());
  const quotaMb = est?.quota ? Math.round(est.quota / 1048576) : null;
  let ls = false;
  try {
    localStorage.setItem("__vs", "1");
    localStorage.removeItem("__vs");
    ls = true;
  } catch {}
  return {
    quotaMb,
    // Chromium incognito caps storage far below normal (roughly < 1.2 GB); a heuristic only
    incognitoSuspected: quotaMb != null ? quotaMb < 1200 : null,
    cookieEnabled: navigator.cookieEnabled,
    localStorage: ls,
    indexedDB: typeof indexedDB !== "undefined",
    doNotTrack: (navigator as Navigator & { doNotTrack?: string }).doNotTrack ?? null,
    globalPrivacyControl: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ?? null,
  };
}

async function permissions() {
  const names = ["camera", "microphone", "geolocation", "notifications"];
  const out: Record<string, string | null> = {};
  for (const n of names) out[n] = await safe(async () => (await navigator.permissions.query({ name: n as PermissionName })).state);
  return out;
}

/* --------------------------------------------------------------- WebRTC IPs -- */

/**
 * Public addresses the browser reports through STUN (server-reflexive candidates). If one
 * differs from the address our server sees, traffic is being tunnelled (VPN / proxy).
 * Only public srflx addresses are kept: local (host / mDNS) candidates are discarded.
 */
async function webrtcIps(stunUrl: string): Promise<{ publicIps: string[]; supported: boolean }> {
  if (typeof RTCPeerConnection === "undefined") return { publicIps: [], supported: false };
  const ips = new Set<string>();
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
    pc.createDataChannel("vs");
    pc.onicecandidate = (e) => {
      const c = e.candidate?.candidate;
      if (c && / typ srflx /.test(c)) {
        const ip = c.split(" ")[4];
        if (ip && !ip.endsWith(".local")) ips.add(ip);
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => setTimeout(r, 1800));
    pc.close();
  } catch {}
  return { publicIps: [...ips], supported: true };
}

/* ------------------------------------------------------------------ integrity -- */

const VIRTUAL_CAMERA = /virtual|obs|manycam|splitcam|droidcam|iriun|xsplit|snap camera|camtwist|epoccam|ndi|mmhmm|nvidia broadcast|e2esoft|vcam|fake|chromacam|youcam/i;
const VM_GPU = /swiftshader|llvmpipe|virtualbox|vmware|parallels|microsoft basic render|mesa offscreen|qemu|virgl|hyper-v/i;

async function capture() {
  const devices = await safe(() => navigator.mediaDevices?.enumerateDevices?.());
  const video = (devices ?? []).filter((d) => d.kind === "videoinput");
  const labels = video.map((d) => d.label).filter(Boolean);
  const matched = labels.filter((l) => VIRTUAL_CAMERA.test(l));
  // the cameras this flow actually opened (document and selfie), as opposed to every camera installed
  const used = camerasUsed();
  return {
    videoInputCount: video.length,
    audioInputCount: (devices ?? []).filter((d) => d.kind === "audioinput").length,
    // labels are only readable after the camera permission was granted (liveness/document steps)
    labelsVisible: labels.length > 0,
    matchedPatterns: matched,
    virtualCameraSuspected: labels.length ? matched.length > 0 : null,
    camerasUsed: used,
    virtualCameraUsed: used.length ? used.some((l) => VIRTUAL_CAMERA.test(l)) : null,
    externalDevice: labels.length ? labels.some((l) => /usb|external|hd pro|c9\d\d|brio|logitech|elgato/i.test(l)) : null,
  };
}

/** "Lies": native browser functions that have been replaced (anti-detect browsers, stealth plugins). */
function tampering(): string[] {
  const out: string[] = [];
  const isNative = (f: unknown) => typeof f === "function" && /\{\s*\[native code\]\s*\}$/.test(Function.prototype.toString.call(f));
  const probes: [string, unknown][] = [
    ["navigator.permissions.query", navigator.permissions?.query],
    ["HTMLCanvasElement.toDataURL", HTMLCanvasElement.prototype.toDataURL],
    ["CanvasRenderingContext2D.getImageData", CanvasRenderingContext2D.prototype.getImageData],
    ["WebGLRenderingContext.getParameter", typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext.prototype.getParameter : undefined],
    ["Date.prototype.getTimezoneOffset", Date.prototype.getTimezoneOffset],
    ["Intl.DateTimeFormat.resolvedOptions", Intl.DateTimeFormat.prototype.resolvedOptions],
    ["navigator.mediaDevices.enumerateDevices", navigator.mediaDevices?.enumerateDevices],
  ];
  for (const [name, f] of probes) if (f !== undefined && !isNative(f)) out.push(name);
  // property getters overridden on navigator (a common spoofing trick)
  for (const p of ["webdriver", "languages", "platform", "hardwareConcurrency", "deviceMemory", "userAgent"]) {
    const own = Object.getOwnPropertyDescriptor(navigator, p);
    if (own) out.push(`navigator.${p} overridden`);
  }
  return out;
}

async function environment(gpuRenderer: string | null) {
  const botd = await safe(async () => (await (await loadBotd()).detect()) as { bot: boolean; botKind?: string });
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  const claimsMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const emulatorSignatures: string[] = [];
  if (claimsMobile && !touch) emulatorSignatures.push("mobile UA without touch");
  if (/Android/i.test(ua) && gpuRenderer && /swiftshader|llvmpipe|mesa/i.test(gpuRenderer)) emulatorSignatures.push("Android on software GPU");
  if (/Android/i.test(ua) && navigator.platform && /Win|Mac|Linux x86/i.test(navigator.platform) && !/arm|aarch/i.test(navigator.platform))
    emulatorSignatures.push(`Android UA on ${navigator.platform}`);
  const headless: string[] = [];
  if (navigator.webdriver) headless.push("navigator.webdriver");
  if (/HeadlessChrome/.test(ua)) headless.push("HeadlessChrome UA");
  if (window.outerWidth === 0 && window.outerHeight === 0) headless.push("zero outer window");
  if (/Chrome/.test(ua) && !(window as Window & { chrome?: unknown }).chrome) headless.push("Chrome UA without window.chrome");
  if (navigator.plugins?.length === 0 && /Chrome/.test(ua) && !claimsMobile) headless.push("no plugins on desktop Chrome");
  return {
    automationDetected: !!botd?.bot || headless.length > 0,
    botKind: botd?.bot ? botd.botKind ?? "unknown" : null,
    headlessSignals: headless,
    emulator: emulatorSignatures.length > 0,
    emulatorSignatures,
    virtualMachine: gpuRenderer ? VM_GPU.test(gpuRenderer) : false,
    tampering: tampering(),
    // Chromium hides the page when screen-shared from the same tab; not generally detectable
    screenCaptureActive: null,
    devtoolsSuspected: window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 250,
  };
}

/* -------------------------------------------------------------- fingerprint -- */

async function fingerprint() {
  const agent = await safe(() => FingerprintJS.load());
  const r = await safe(async () => (agent ? await agent.get() : null));
  if (!r) return null;
  const c = r.components as Record<string, { value?: unknown }>;
  const pick = (k: string) => (c[k] && "value" in c[k] ? (c[k].value as Json) : null);
  const fontList = pick("fonts");
  return {
    visitorId: r.visitorId,
    confidence: r.confidence?.score ?? null,
    canvasHash: pick("canvas") ? await sha256Hex(JSON.stringify(pick("canvas"))).then((h) => h.slice(0, 16)) : null,
    audio: pick("audio"),
    fontsCount: Array.isArray(fontList) ? fontList.length : null,
    fontsHash: Array.isArray(fontList) ? (await sha256Hex(fontList.join(","))).slice(0, 16) : null,
    vendorFlavors: pick("vendorFlavors"),
    architecture: pick("architecture"),
  };
}

/* ------------------------------------------------------------------ collect -- */

export type DeviceSignals = Record<string, Json>;

export async function collectDeviceSignals(opts: { stunUrl?: string } = {}): Promise<DeviceSignals> {
  const gl = webgl();
  const [ua, bat, fp, env, cap, sto, perm, rtc] = await Promise.all([
    uaData(),
    battery(),
    fingerprint(),
    environment(gl?.renderer ?? null),
    capture(),
    storage(),
    permissions(),
    webrtcIps(opts.stunUrl ?? "stun:stun.cloudflare.com:3478"),
  ]);
  return {
    schema_version: 2,
    collected_at: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? null,
    vendor: navigator.vendor ?? null,
    language: navigator.language ?? null,
    languages: [...(navigator.languages ?? [])],
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    touchSupport: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    devicePixelRatio: window.devicePixelRatio ?? null,
    pdfViewerEnabled: (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled ?? null,
    screen: screenInfo(),
    uaData: ua as Json,
    battery: bat as Json,
    gpu: gl as Json,
    network: network() as Json,
    locale: locale() as Json,
    storage: sto as Json,
    permissions: perm as Json,
    webrtc: rtc as Json,
    fingerprint: fp as Json,
    integrity: {
      platform: "web",
      capture: cap as Json,
      environment: env as Json,
    },
  };
}
