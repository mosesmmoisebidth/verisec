/**
 * ════════════════════════════════════════════════════════════════════════════
 *  VeriSec Investigator: standalone agent server
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The static UI (output: "export") cannot host a Node route, so the agent lives
 * here, as one more backend the client talks to, the same pattern the rest of
 * VeriSec uses. The key stays on this server and never reaches the browser.
 *
 *   node scripts/investigator-server.mjs          # listens on :8799
 *
 * Needs OPENROUTER_API_KEY in the environment (or in frontend/.env.local, which
 * this file reads on start). POST /investigate {caseId} streams the agent's
 * steps back as Server-Sent Events. The reasoning is real: each turn the model
 * picks the next tool, the tool runs real logic over the case, and the result
 * is fed back until the model returns a decision. Only the cases are specimen.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* ── env: process env first, then frontend/.env.local ────────────────────── */
function loadEnvLocal() {
  const out = {};
  for (const name of [".env.local", ".env.development", ".env"]) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const fileEnv = loadEnvLocal();
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d;

const KEY = env("OPENROUTER_API_KEY");
const MODEL = env("INVESTIGATOR_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free");
const PORT = Number(env("INVESTIGATOR_PORT", env("PORT", "8799")));
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_STEPS = 8;

/* ── specimen data (shared with the UI picker) ───────────────────────────── */
const specimen = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/investigator/specimen.json"), "utf8"));
const CASES = specimen.cases;
const WATCHLIST = specimen.watchlist;
const getCase = (id) => CASES.find((c) => c.id === id);

/* ── tools: real logic over the case data ────────────────────────────────── */
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter(Boolean));

function runTool(folder, action, args = {}) {
  switch (action) {
    case "list_documents":
      return { documents: Object.keys(folder.documents) };
    case "extract_fields": {
      const doc = String(args.doc ?? "");
      const fields = folder.documents[doc];
      return fields ? { doc, fields } : { doc, error: "document not in folder" };
    }
    case "screen_sanctions": {
      const nn = norm(args.name);
      const exact = WATCHLIST.find((w) => w.name === nn);
      if (exact) return { match: true, score: 0.97, name: exact.name, list: exact.list, program: exact.program };
      const nt = toks(args.name);
      let best = null;
      for (const w of WATCHLIST) {
        const wt = toks(w.name);
        const inter = [...nt].filter((t) => wt.has(t)).length;
        const score = inter / Math.max(wt.size, 1);
        if (score > 0 && (!best || score > best.score)) best = { score, w };
      }
      if (best && best.score >= 0.5) return { match: false, possible: true, score: +best.score.toFixed(2), list: best.w.list };
      return { match: false, score: 0 };
    }
    case "check_income": {
      const stated = Number(args.stated ?? 0);
      const verified = Number(args.verified ?? 0);
      const ratio = stated > 0 ? +(verified / stated).toFixed(2) : 0;
      const flag = ratio < 0.6 ? "stated income not supported" : ratio < 0.85 ? "partially supported" : "consistent";
      return { stated, verified, ratio, flag };
    }
    case "compare_names": {
      const a = toks(args.a), b = toks(args.b);
      const inter = [...a].filter((t) => b.has(t)).length;
      const overlap = inter / Math.max(a.size, b.size, 1);
      return { a: String(args.a ?? ""), b: String(args.b ?? ""), overlap: +overlap.toFixed(2), verdict: overlap === 1 ? "exact" : overlap >= 0.5 ? "variant" : "mismatch" };
    }
    case "score_risk": {
      const signals = Array.isArray(args.signals) ? args.signals.map(String) : [];
      const n = signals.length;
      return { risk: n >= 2 ? "high" : n === 1 ? "medium" : "low", signals };
    }
    default:
      return { error: `unknown tool: ${action}` };
  }
}

const SYSTEM_PROMPT = `You are VeriSec Investigator, a fraud-review agent for a bank.

Your rule: NO FINDING WITHOUT EVIDENCE. You FLAG; a human makes the final call.
Work ONE step at a time. Each turn, return exactly ONE JSON object and nothing else.

To take a step:
  {"thought":"short reasoning","action":"<tool>","args":{ ... }}

To finish once you have enough evidence:
  {"thought":"short reasoning","decision":"approve|decline|review","reason":"one sentence",
   "findings":[{"claim":"what is wrong or notable","evidence":"the exact tool result it came from","severity":"low|medium|high|critical"}]}

Tools you may call:
- list_documents()                      what is in the folder
- extract_fields({doc})                 doc is one of the documents listed
- screen_sanctions({name})              checks sanctions / watchlists
- check_income({stated, verified})      compares application income vs verified
- compare_names({a, b})                 are two names the same person
- score_risk({signals})                 signals: string[] of concerns you found

Investigate identity, sanctions exposure and income consistency. A sanctions
match is a mandatory decline. Unsupported income is a serious flag. A name
variance or a missing document that you cannot resolve is a reason to send the
case to a human for REVIEW, not to decline. Approve only when nothing is wrong.
Prefer 3-6 steps. Do not repeat a tool call you already made.`;

/* ── robust JSON extraction (model may wrap the object in prose) ──────────── */
function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { if (--depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

async function callModel(messages) {
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://verisec.dev",
      "X-Title": "VeriSec Investigator",
    },
    body: JSON.stringify({ model: MODEL, temperature: 0.1, max_tokens: 700, messages }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`model ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const json = await res.json();
  return (json?.choices?.[0]?.message?.content ?? "").trim();
}

/* ── the agent loop, streamed as SSE ─────────────────────────────────────── */
async function investigate(res, caseId) {
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    if (!KEY) throw new Error("OPENROUTER_API_KEY is not set");
    const folder = getCase(caseId);
    if (!folder) throw new Error(`unknown case: ${caseId ?? "(none)"}`);

    send({ type: "start", case: { id: folder.id, kind: folder.kind, applicant: folder.applicant, summary: folder.summary }, model: MODEL });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Case ${folder.id} (${folder.kind}). Applicant on file: "${folder.applicant}". ${folder.summary} Begin your investigation.` },
    ];

    for (let step = 1; step <= MAX_STEPS; step++) {
      const raw = await callModel(messages);
      const obj = extractJson(raw);
      if (!obj) { send({ type: "error", message: "agent returned no parseable step" }); break; }

      if (typeof obj.decision === "string") {
        send({ type: "decision", step, decision: obj.decision, reason: obj.reason ?? "", findings: Array.isArray(obj.findings) ? obj.findings : [] });
        break;
      }

      const action = String(obj.action ?? "");
      const args = obj.args ?? {};
      send({ type: "plan", step, thought: obj.thought ?? "", action, args });
      const observation = runTool(folder, action, args);
      send({ type: "observe", step, action, observation });

      messages.push({ role: "assistant", content: JSON.stringify(obj) });
      messages.push({ role: "user", content: `observation: ${JSON.stringify(observation)}` });

      if (step === MAX_STEPS) send({ type: "error", message: "reached step limit without a decision" });
    }
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    send({ type: "done" });
    res.end();
  }
}

/* ── http server ─────────────────────────────────────────────────────────── */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  const url = (req.url || "").replace(/\/+$/, "") || "/";
  if (req.method === "GET" && (url === "/" || url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS });
    return res.end(JSON.stringify({ ok: true, service: "verisec-investigator", model: MODEL, cases: CASES.map((c) => c.id), keyLoaded: Boolean(KEY) }));
  }

  if (req.method === "POST" && url === "/investigate") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let caseId;
      try { caseId = JSON.parse(body || "{}").caseId; } catch { /* ignore */ }
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", ...CORS });
      investigate(res, caseId);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`VeriSec Investigator agent on http://localhost:${PORT}  (model ${MODEL}, key ${KEY ? "loaded" : "MISSING"})`);
});
