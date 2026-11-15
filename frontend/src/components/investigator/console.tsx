"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  FileSearch,
  Gavel,
  Loader2,
  Play,
  ScanSearch,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, Eyebrow } from "@/components/ui/panel";
import { VerdictChip, Tag } from "@/components/ui/chip";
import type { Verdict } from "@/lib/console/types";
import { CASES, INVESTIGATOR_URL } from "@/lib/investigator/cases";
import { cn } from "@/lib/utils";

/* ── event shapes from /api/investigator ─────────────────────────────────── */

type Finding = { claim: string; evidence: string; severity: "low" | "medium" | "high" | "critical" };

type Ev =
  | { type: "start"; case: { id: string; applicant: string; kind: string; summary: string }; model: string }
  | { type: "plan"; step: number; thought: string; action: string; args: Record<string, unknown> }
  | { type: "observe"; step: number; action: string; observation: Record<string, unknown> }
  | { type: "decision"; step: number; decision: string; reason: string; findings: Finding[] }
  | { type: "error"; message: string }
  | { type: "done" };

type Row = {
  step: number;
  action: string;
  thought: string;
  args: Record<string, unknown>;
  observation?: Record<string, unknown>;
};

const DECISION_VERDICT: Record<string, Verdict> = {
  approve: "Approved",
  decline: "Declined",
  review: "Needs review",
};

const SEV_TONE: Record<Finding["severity"], "neutral" | "caution" | "danger"> = {
  low: "neutral",
  medium: "caution",
  high: "danger",
  critical: "danger",
};

const ACTION_ICON: Record<string, typeof ScanSearch> = {
  list_documents: FileSearch,
  extract_fields: FileSearch,
  screen_sanctions: ShieldAlert,
  check_income: ScanSearch,
  compare_names: ScanSearch,
  score_risk: Gavel,
};

const ACTION_LABEL: Record<string, string> = {
  list_documents: "Listing the case folder",
  extract_fields: "Reading a document",
  screen_sanctions: "Screening against sanctions lists",
  check_income: "Checking income consistency",
  compare_names: "Comparing names across documents",
  score_risk: "Scoring overall risk",
};

export function InvestigatorConsole() {
  const [caseId, setCaseId] = useState(CASES[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [decision, setDecision] = useState<Ev & { type: "decision" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<null | "upheld" | "overridden">(null);
  const logRef = useRef<HTMLDivElement>(null);

  async function run() {
    setRunning(true);
    setRows([]);
    setDecision(null);
    setError(null);
    setSigned(null);

    try {
      const res = await fetch(`${INVESTIGATOR_URL}/investigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim()) as Ev;
          apply(ev);
          logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function apply(ev: Ev) {
    if (ev.type === "plan") {
      setRows((r) => [...r, { step: ev.step, action: ev.action, thought: ev.thought, args: ev.args }]);
    } else if (ev.type === "observe") {
      setRows((r) =>
        r.map((row) => (row.step === ev.step && row.action === ev.action ? { ...row, observation: ev.observation } : row)),
      );
    } else if (ev.type === "decision") {
      setDecision(ev);
    } else if (ev.type === "error") {
      setError(ev.message);
    }
  }

  const activeCase = CASES.find((c) => c.id === caseId) ?? CASES[0];

  return (
    <div className="flex flex-col gap-row">
      {/* header */}
      <div className="flex flex-col gap-1">
        <Eyebrow className="text-pine/60">Agentic review</Eyebrow>
        <h1 className="text-xl font-medium tracking-[-0.3px] text-pine">Investigator</h1>
        <p className="max-w-2xl text-sm text-inert">
          Drop a case folder and the agent plans its own checks, reads the documents, screens the applicant and
          recommends an outcome with evidence. The AI flags. A human decides.
        </p>
      </div>

      <div className="grid gap-row lg:grid-cols-[320px_1fr]">
        {/* case picker */}
        <Panel title="Case folder">
          <div className="flex flex-col gap-2">
            {CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={running}
                onClick={() => setCaseId(c.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-site-card border p-3 text-left transition-colors disabled:opacity-60",
                  c.id === caseId ? "border-pine/30 bg-lime-tint" : "border-site-line bg-site-panel hover:bg-well",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-medium text-pine">{c.applicant}</span>
                  <span className="text-micro text-inert">{c.id}</span>
                </span>
                <span className="text-micro uppercase tracking-[0.5px] text-inert">{c.kind}</span>
                <span className="text-xs text-inert">{c.summary}</span>
                <span className="mt-1 text-micro text-inert">
                  {Object.keys(c.documents).length} document{Object.keys(c.documents).length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>

          <Button className="mt-3 w-full" size="lg" onClick={run} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Investigating…" : "Run investigation"}
          </Button>
          <p className="mt-2 text-micro text-inert">
            Specimen cases. Fictional people, safe to demo.
          </p>
        </Panel>

        {/* live run */}
        <div className="flex flex-col gap-row">
          <Panel
            title="Live investigation"
            action={
              <span className="flex items-center gap-1.5 text-micro text-inert">
                <CircleDot className={cn("size-3.5", running ? "animate-pulse text-caution" : "text-inert")} />
                {running ? "running" : rows.length ? "complete" : "idle"}
              </span>
            }
          >
            <div ref={logRef} className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
              {rows.length === 0 && !running && (
                <p className="py-8 text-center text-sm text-inert">
                  Pick a case and run the investigation. The agent&rsquo;s steps appear here as it works.
                </p>
              )}

              {rows.map((row) => {
                const Icon = ACTION_ICON[row.action] ?? ScanSearch;
                return (
                  <div key={`${row.step}-${row.action}`} className="rounded-site-card border border-site-line bg-well/50 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-lime-tint text-pine">
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-pine">
                            {ACTION_LABEL[row.action] ?? row.action}
                          </span>
                          <span className="text-micro text-inert">step {row.step}</span>
                        </div>
                        {row.thought && <p className="mt-0.5 text-xs text-inert">{row.thought}</p>}
                        {row.observation && (
                          <pre className="mt-2 overflow-x-auto rounded-md bg-pine/[0.04] p-2 text-micro leading-relaxed text-pine/80">
                            {summarise(row.action, row.observation)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {running && (
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-inert">
                  <Loader2 className="size-3.5 animate-spin" /> the agent is thinking…
                </div>
              )}
            </div>
          </Panel>

          {error && (
            <Panel title="Could not complete">
              <p className="text-sm text-danger">{error}</p>
              <p className="mt-1 text-micro text-inert">
                Check that OPENROUTER_API_KEY is set in the server environment.
              </p>
            </Panel>
          )}

          {decision && (
            <Panel
              title="Recommendation"
              action={<VerdictChip verdict={DECISION_VERDICT[decision.decision] ?? "Needs review"} />}
            >
              <p className="text-sm text-pine">{decision.reason}</p>

              {decision.findings.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  <Eyebrow className="text-pine/60">Findings · evidence attached</Eyebrow>
                  {decision.findings.map((f, i) => (
                    <div key={i} className="rounded-site-card border border-site-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-pine">{f.claim}</span>
                        <Tag tone={SEV_TONE[f.severity]}>{f.severity}</Tag>
                      </div>
                      <p className="mt-1 text-xs text-inert">
                        <span className="font-medium text-pine/70">Evidence: </span>
                        {f.evidence}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* human in the loop */}
              <div className="mt-4 border-t border-site-line pt-3">
                {signed ? (
                  <p className="flex items-center gap-1.5 text-sm text-pine">
                    <CheckCircle2 className="size-4 text-ramp-3" />
                    {signed === "upheld"
                      ? `Reviewer upheld the recommendation (${decision.decision}).`
                      : "Reviewer overrode the recommendation."}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs text-inert">A human makes the final call:</span>
                    <Button size="sm" onClick={() => setSigned("upheld")}>
                      <CheckCircle2 /> Uphold {decision.decision}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSigned("overridden")}>
                      <XCircle /> Override
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <p className="text-micro text-inert">
        Reviewing <span className="font-medium text-pine/70">{activeCase?.applicant}</span> · {activeCase?.kind}
      </p>
    </div>
  );
}

/* Render a tool observation as one readable line, not raw JSON noise. */
function summarise(action: string, obs: Record<string, unknown>): string {
  if (obs.error) return `could not complete: ${String(obs.error)}`;
  switch (action) {
    case "list_documents":
      return `folder contains: ${(obs.documents as string[])?.join(", ")}`;
    case "extract_fields":
      return `${String(obs.doc)}: ${JSON.stringify(obs.fields)}`;
    case "screen_sanctions":
      return obs.match
        ? `MATCH on ${obs.list} (${obs.program}) · confidence ${obs.score}`
        : obs.possible
          ? `possible match on ${obs.list} · ${obs.score} (for a human to judge)`
          : "no sanctions match";
    case "check_income":
      return `stated ${obs.stated} vs verified ${obs.verified} · ratio ${obs.ratio} · ${obs.flag}`;
    case "compare_names":
      return `"${obs.a}" vs "${obs.b}" · ${obs.verdict} (overlap ${obs.overlap})`;
    case "score_risk":
      return `risk ${String(obs.risk).toUpperCase()} · ${(obs.signals as string[])?.join("; ")}`;
    default:
      return JSON.stringify(obs);
  }
}
