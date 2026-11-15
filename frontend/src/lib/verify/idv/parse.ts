/**
 * The VeriSec IDV parser: orchestrator.
 *
 * Wires the three pure stages together:
 *   raw Regula response --extractFull--> FullResult (no anomalies)
 *                        --analyze-----> anomalies
 *                        --toDisplay---> client-safe slice
 *
 * `parseIdvFull` returns the complete backend picture (every container, every
 * bounding box, every authenticity check, plus anomalies). `parseIdv` returns
 * both the full picture and the ten-container display slice for the KYC review.
 */

import { extractFull, extractContainerList, CONSISTENT_CONTAINERS } from "./extractors";
import { analyze, categoryOf } from "./analyze";
import { collectErrors } from "./errors";
import { toDisplay, toneOf } from "./display";
import type { DisplayResult, FullResult, ParseOptions } from "./types";

export function parseIdvFull(resp: unknown, opts: ParseOptions): FullResult {
  const full = extractFull(resp, opts);
  full.anomalies = analyze(full, opts);
  full.errors = collectErrors(full, opts.profile);
  return full;
}

export function parseIdv(resp: unknown, opts: ParseOptions): { full: FullResult; display: DisplayResult } {
  const full = parseIdvFull(resp, opts);
  return { full, display: toDisplay(full) };
}

/**
 * The document portrait (the face printed on the ID) as a data URL, for a 1:1
 * face match against a live selfie. Prefers the cropped portrait (GraphicField
 * type 201); if the read did not isolate one, falls back to the front document
 * image, which still carries the face for the matcher to detect.
 */
export function documentPortrait(resp: unknown): string | null {
  const full = extractFull(resp, { country: "", docType: "Passport" as const });
  const graphics = full.pages.flatMap((p) => p.graphics).filter((g) => !!g.src);
  const portrait =
    graphics.find((g) => g.type === 201) ||
    graphics.find((g) => /portrait/i.test(g.name) && !/ghost/i.test(g.name)) ||
    graphics.find((g) => g.type === 207 || g.type === 208 || g.type === 1) ||
    graphics[0];
  return portrait?.src ?? null;
}

export { extractFull, extractContainerList, CONSISTENT_CONTAINERS, analyze, categoryOf, toDisplay, toneOf };
