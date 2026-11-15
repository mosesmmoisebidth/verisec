"use client";

/**
 * Which cameras the flow actually opened.
 *
 * Every camera request on this page (the document capture and the liveness component alike) is
 * observed, and the name of each video track it returned is kept for the session. The device
 * report then tells a virtual camera that was USED for a capture apart from one that is merely
 * installed (OBS, for example, adds "OBS Virtual Camera" to every camera list). Only names are
 * kept, never images.
 */
const KEY = "verisec.kyc.cameras";
let installed = false;

export function watchCameras(): void {
  if (installed || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
  installed = true;
  const md = navigator.mediaDevices;
  const original = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = await original(constraints);
    try {
      remember(stream.getVideoTracks().map((t) => t.label).filter(Boolean));
    } catch {
      /* a closed stream has no labels to keep */
    }
    return stream;
  };
}

function remember(labels: string[]): void {
  if (!labels.length) return;
  try {
    const seen = new Set<string>(camerasUsed());
    for (const l of labels) seen.add(l.slice(0, 120));
    sessionStorage.setItem(KEY, JSON.stringify([...seen].slice(0, 8)));
  } catch {
    /* storage unavailable: the report says the camera is unknown */
  }
}

/** The names of the cameras this session opened, oldest first. */
export function camerasUsed(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
