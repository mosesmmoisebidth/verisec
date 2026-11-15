"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BookOpen, CheckCircle2, CircleHelp, Gauge, KeyRound, ListChecks, Server, ShieldCheck, X } from "lucide-react";

import { FinGroupTile } from "@/components/finance/api-playground/parts";
import { CopyButton, InlineCode, JsonTree } from "@/components/api-keys/playground-parts";
import type { Param } from "@/lib/console/playground-run";
import type { FinEndpoint } from "@/lib/finance/playground-catalog";
import { cn } from "@/lib/utils";

/**
 * "How to use" for one Financial API, laid out as the KYC Playground's guide: what
 * it does, how to run it, every field and header it takes, a real sample response,
 * what each field means, the status codes, where it can fail, and its limits.
 */

const TIER = {
  major: { label: "Major API", cls: "bg-lime text-pine" },
  minor: { label: "Focused API", cls: "bg-lime-tint text-ramp-2" },
};

function headersOf(ep: FinEndpoint): { name: string; value: string; req: boolean; note: string }[] {
  return [
    { name: "Authorization", value: "Bearer YOUR_API_KEY", req: true, note: "Your API key authorises the call." },
    ...(ep.body === "multipart"
      ? [{ name: "Content-Type", value: "multipart/form-data", req: true, note: "The photo goes as a file upload; your HTTP client sets this." }]
      : ep.body === "json"
        ? [{ name: "Content-Type", value: "application/json", req: true, note: "The request body is JSON." }]
        : []),
    { name: "X-VeriSec-Env", value: "test | live", req: false, note: "Which environment the call is recorded in. Default test." },
    { name: "X-VeriSec-Source", value: "api | sdk", req: false, note: "Where the call comes from, shown in your logs. Default api." },
  ];
}

function whereOf(ep: FinEndpoint, p: Param): string {
  if (p.kind === "image") return "file";
  if (p.name === "digits") return "path";
  return ep.body === "json" ? "body" : ep.body === "query" ? "query" : "form";
}

function Section({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold tracking-[0.2px] text-pine">
        <span aria-hidden className="grid size-6 place-items-center rounded-[7px] bg-lime-tint text-pine">
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function FinHowTo({ ep, onClose }: { ep: FinEndpoint; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const t = TIER[ep.tier];
  const docs = ep.docs;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center overscroll-contain p-4 sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 h-full w-full cursor-default bg-pine/25 backdrop-blur-[3px] duration-200 animate-in fade-in" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`How to use ${ep.name}`}
        className="relative z-[1] flex h-[calc(100dvh-3rem)] max-h-[900px] w-full max-w-[1240px] flex-col overflow-hidden rounded-[22px] border border-edge bg-page shadow-[0_40px_90px_-24px_rgb(14_50_40/0.5)] duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3.5 border-b border-rule bg-[image:var(--gradient-tab)] px-5 py-4 sm:px-6">
          <FinGroupTile group={ep.group} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[18px] font-semibold text-pine">{ep.name}</h2>
              <span className={cn("rounded-pill px-2 py-0.5 text-[10.5px] font-semibold", t.cls)}>{t.label}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[12.5px]">
              <span className="rounded-[6px] bg-info-tint px-1.5 py-px text-[10.5px] font-semibold tracking-[0.3px] text-info">{ep.method}</span>
              <code className="truncate text-slate">{ep.path}</code>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-pill text-pine/55 transition-colors hover:bg-hover-light hover:text-pine">
            <X aria-hidden className="size-5" strokeWidth={1.9} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-x-10 gap-y-7 overflow-y-auto px-5 py-6 sm:px-6 lg:grid-cols-2 [scrollbar-width:thin]">
          <div className="flex flex-col gap-7">
            <Section icon={BookOpen} title="What it does">
              <p className="m-0 max-w-[62ch] text-[13.5px] leading-[21px] text-ink-muted">
                <InlineCode tone="light" text={docs.what} />
              </p>
            </Section>

            <Section icon={ListChecks} title="How to run it">
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {docs.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[20px] text-pine">
                    <span className="tnum mt-px grid size-5 shrink-0 place-items-center rounded-pill bg-pine text-[11px] font-semibold text-lime">{i + 1}</span>
                    <span>
                      <InlineCode tone="light" text={s} />
                    </span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section icon={Server} title="Request fields">
              <div className="overflow-hidden rounded-[12px] border border-edge">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-panel text-[11px] font-medium text-slate">
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Sent as</th>
                      <th className="px-3 py-2 font-medium">Allowed / default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map((p) => {
                      const allowed = p.kind === "enum" ? (p.choices ?? []).map((c) => c.value).join(" · ") : p.kind === "image" ? "JPG, PNG or BMP, up to 10 MB" : null;
                      const dflt = p.kind === "enum" && p.default !== undefined ? String(p.default) : null;
                      return (
                        <tr key={p.name} className="border-t border-rule align-top">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <code className="font-mono text-[11.5px] text-pine">{p.name}</code>
                              {p.required ? <span className="rounded-[5px] bg-danger-tint px-1 text-[9.5px] font-semibold text-danger">req</span> : null}
                            </div>
                            {p.note ? <p className="m-0 mt-0.5 max-w-[34ch] text-[11px] leading-[15px] text-slate">{p.note}</p> : null}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-[5px] bg-well px-1.5 py-px font-mono text-[11px] text-slate">{whereOf(ep, p)}</span>
                          </td>
                          <td className="px-3 py-2 text-[11.5px] text-ink-soft">
                            {allowed ? <span className="break-words">{allowed}</span> : null}
                            {allowed && dflt ? <br /> : null}
                            {dflt ? <span className="text-slate">default {dflt}</span> : null}
                            {!allowed && !dflt ? <span className="text-muted">-</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="m-0 text-[11.5px] leading-[17px] text-slate">{docs.envelope}</p>
            </Section>

            <Section icon={KeyRound} title="Headers">
              <div className="overflow-hidden rounded-[12px] border border-edge">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-panel text-[11px] font-medium text-slate">
                      <th className="px-3 py-2 font-medium">Header</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                      <th className="px-3 py-2 font-medium">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headersOf(ep).map((h) => (
                      <tr key={h.name} className="border-t border-rule align-top">
                        <td className="px-3 py-2">
                          <code className="font-mono text-[11.5px] text-pine">{h.name}</code>
                          <p className="m-0 mt-0.5 max-w-[30ch] text-[11px] leading-[15px] text-slate">{h.note}</p>
                        </td>
                        <td className="px-3 py-2">
                          <code className="font-mono text-[11px] break-all text-ink-soft">{h.value}</code>
                        </td>
                        <td className="px-3 py-2">
                          {h.req ? (
                            <span className="rounded-[5px] bg-danger-tint px-1.5 py-px text-[10px] font-semibold text-danger">required</span>
                          ) : (
                            <span className="rounded-[5px] bg-well px-1.5 py-px text-[10px] text-slate">optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section icon={Gauge} title="Limits and what's allowed">
              <ul className="m-0 flex flex-col gap-1.5 pl-0">
                {docs.limits.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[18px] text-pine">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-ramp-3" />
                    {l}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="flex flex-col gap-7">
            <Section icon={CheckCircle2} title="Sample response">
              <div className="overflow-hidden rounded-[14px] bg-code-bg ring-1 ring-black/10">
                <div className="flex items-center justify-between gap-2 border-b border-white/8 bg-code-chrome px-3.5 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-code-ink/80">
                    <span aria-hidden className="size-1.5 rounded-pill bg-lime" />
                    200 OK, a real read
                  </span>
                  <CopyButton value={JSON.stringify(ep.example, null, 2)} />
                </div>
                <div className="max-h-[320px] overflow-auto px-4 py-3 [scrollbar-color:rgb(207_224_216/0.28)_transparent] [scrollbar-width:thin]">
                  <JsonTree value={ep.example} openDepth={3} />
                </div>
              </div>
              {docs.notes.length ? (
                <div className="flex flex-col gap-1.5">
                  {docs.notes.map((n, i) => (
                    <p key={i} className="m-0 flex items-start gap-2 rounded-[10px] bg-info-tint/60 px-3 py-2 text-[12px] leading-[17px] text-info">
                      <CircleHelp aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
                      <span>
                        <InlineCode tone="light" text={n} />
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}
            </Section>

            <Section icon={ShieldCheck} title="What comes back">
              <dl className="m-0 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                {docs.returns.map((r) => (
                  <div key={r.field} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[11.5px] text-pine">{r.field}</dt>
                    <dd className="m-0 text-[11.5px] leading-[16px] text-slate">{r.note}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section icon={Gauge} title="Status codes">
              <div className="flex flex-col gap-1.5">
                {docs.statuses.map((s) => (
                  <div key={s.code} className="flex items-start gap-3 rounded-[10px] border border-rule px-3 py-2">
                    <span className={cn("tnum mt-px shrink-0 rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold", s.code.startsWith("2") ? "bg-pass-tint text-ramp-2" : "bg-caution-tint text-caution")}>{s.code}</span>
                    <span className="min-w-0 text-[12px] leading-[17px] text-pine">
                      <span className="font-medium">{s.label}.</span> <span className="text-slate">{s.when}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {docs.failures.length ? (
              <Section icon={AlertTriangle} title="If it fails">
                <div className="flex flex-col gap-1.5">
                  {docs.failures.map((f) => (
                    <div key={f.code} className="rounded-[10px] border border-caution/25 bg-caution-tint/40 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded-[5px] bg-page px-1.5 py-px font-mono text-[11px] font-semibold text-caution">{f.code}</code>
                        <span className="text-[12px] text-pine">{f.message}</span>
                      </div>
                      <p className="m-0 mt-1 text-[11.5px] leading-[16px] text-slate">
                        <InlineCode tone="light" text={f.fix} />
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
