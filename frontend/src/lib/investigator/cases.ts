/**
 * VeriSec Investigator: client-facing case data and shared types.
 *
 * The agentic reasoning and the tools that read these folders run in the
 * standalone agent server (`scripts/investigator-server.mjs`), so the model key
 * never reaches the browser. Both sides read the SAME specimen data from
 * `specimen.json`, so the picker here and the run there can never drift.
 *
 * The cases are SPECIMEN fixtures (fictional people), safe to demo.
 */

import specimen from "./specimen.json";

export type Doc = Record<string, string | number>;

export interface CaseFolder {
  id: string;
  kind: string;
  applicant: string;
  summary: string;
  documents: Record<string, Doc>;
}

export const CASES: CaseFolder[] = specimen.cases as CaseFolder[];

export function getCase(id: string): CaseFolder | undefined {
  return CASES.find((c) => c.id === id);
}

/** One evidence-backed flag the agent raises. The server produces these. */
export interface Finding {
  claim: string;
  evidence: string;
  severity: "low" | "medium" | "high" | "critical";
}

/** Where the browser reaches the agent server. Inlined at build time. */
export const INVESTIGATOR_URL =
  process.env.NEXT_PUBLIC_INVESTIGATOR_URL || "http://localhost:8799";
