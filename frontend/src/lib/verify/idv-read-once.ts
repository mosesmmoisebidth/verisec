"use client";

import { idvRead } from "./idv-client";

/**
 * One document read per set of images, shared by the screens that need it.
 *
 * The upload step starts the read as soon as the images it needs are accepted, so the read runs
 * while the applicant looks at their photos; Continue and Confirm Details then pick up that same
 * read instead of sending the images and paying for a second one. It also absorbs React's double
 * run of effects in development and any remount. A failed read is forgotten so Try again reads
 * anew; a read for images that were replaced (retake) is simply dropped.
 */
let inflight: { key: string; read: Promise<unknown> } | null = null;

/** Cheap and collision-safe enough for two data URLs held by one browser tab. */
function keyOf(front: string, back?: string): string {
  const part = (s: string) => `${s.length}:${s.slice(64, 160)}:${s.slice(s.length >> 1, (s.length >> 1) + 96)}:${s.slice(-96)}`;
  return `${part(front)}|${back ? part(back) : ""}`;
}

export function readDocumentOnce(front: string, back?: string): Promise<unknown> {
  const key = keyOf(front, back);
  if (inflight?.key !== key) {
    const read: Promise<unknown> = idvRead(front, back).catch((e: unknown) => {
      if (inflight?.read === read) inflight = null;
      throw e;
    });
    inflight = { key, read };
  }
  return inflight.read;
}
