"use client";

import { useMemo, useState } from "react";

import { CodeView } from "@/components/finance/code-view";
import { Segmented } from "@/components/finance/parts";
import { API_DOCS, requestHttp, requestJson, responseStructure, SNIPPET_LANGS, SNIPPETS } from "@/lib/finance/api-docs";
import { briefJson } from "@/lib/finance/json-brief";
import type { ApiMode, ApiParam, RequestFile, SnippetLang } from "@/lib/finance/api-docs";
import { PLAYGROUND } from "@/lib/finance/content";
import { cn } from "@/lib/utils";

const COPY = PLAYGROUND.api;

/**
 * The JSON tab: the call being tried, both ways. Request = the whole request
 * (method, URL, headers with the Bearer key, body fields) as JSON or as it goes
 * over the wire, plus every parameter the call accepts. Response = the response
 * to the last read, or, before any read, a real example response, so the tab is
 * never empty.
 */
export function ApiExchange({
  mode,
  file,
  format,
  live,
}: {
  mode: ApiMode;
  file: RequestFile;
  format: string;
  /** The response of the last read of this call, if any. */
  live: unknown;
}) {
  const doc = API_DOCS[mode];
  const [side, setSide] = useState<"request" | "response">("request");
  const [view, setView] = useState<"json" | "http">("json");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label={doc.title}
          options={[
            { value: "request" as const, label: COPY.requestTab },
            { value: "response" as const, label: COPY.responseTab },
          ]}
          value={side}
          onChange={setSide}
        />
        {side === "request" ? (
          <Segmented
            label={COPY.requestTab}
            options={[
              { value: "json" as const, label: COPY.jsonView },
              { value: "http" as const, label: COPY.httpView },
            ]}
            value={view}
            onChange={setView}
          />
        ) : null}
      </div>

      {side === "request" ? (
        <>
          <p className="m-0 text-micro text-slate">{COPY.requestNote}</p>
          <CodeView
            label={`${doc.method} ${doc.path}`}
            copyLabel="Copy"
            body={view === "json" ? JSON.stringify(requestJson(mode, file, format), null, 2) : requestHttp(mode, file, format)}
          />
          <ParamsTable params={doc.params} />
        </>
      ) : (
        <>
          <p className="m-0 text-micro text-slate">
            {live ? COPY.liveNote : COPY.exampleNote(doc.exampleOf)} {COPY.briefNote}
          </p>
          <CodeView
            label={`${doc.method} ${doc.path} · 200${live ? "" : " · example"}`}
            copyLabel="Copy"
            body={briefJson(live ?? doc.example)}
            tree={live ?? doc.example}
            copyValue={JSON.stringify(live ?? doc.example, null, 2)}
            className="max-h-[640px]"
          />
        </>
      )}
    </div>
  );
}

/** Every header and form field the call accepts. */
function ParamsTable({ params }: { params: ApiParam[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-eyebrow font-medium tracking-[0.6px] text-slate uppercase">{COPY.paramsTitle}</h3>
      <ul className="m-0 flex list-none flex-col divide-y divide-rule overflow-hidden rounded-[14px] border border-hairline bg-page p-0">
        {params.map((p) => (
          <li key={p.name} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] font-medium text-pine">{p.name}</span>
              <span className="rounded-pill bg-well px-2 py-0.5 text-[11px] text-slate">{p.in === "header" ? COPY.header : COPY.form}</span>
              <span
                className={cn(
                  "rounded-pill px-2 py-0.5 text-[11px] font-medium",
                  p.required ? "bg-lime/30 text-pine" : "bg-well text-slate",
                )}
              >
                {p.required ? COPY.yes : COPY.no}
              </span>
              <span className="font-mono text-[12px] text-slate">
                {p.type}
                {p.default ? ` (${COPY.defaultLabel} ${p.default})` : ""}
              </span>
            </div>
            <p className="m-0 text-micro text-slate">{p.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Code tab: the call in each language, then the structure of what comes back. */
export function ApiCode({ mode }: { mode: ApiMode }) {
  const doc = API_DOCS[mode];
  const [lang, setLang] = useState<SnippetLang>("cURL");
  const structure = useMemo(() => JSON.stringify(responseStructure(mode), null, 2), [mode]);

  return (
    <div className="flex flex-col gap-3">
      <Segmented label="Language" options={SNIPPET_LANGS.map((l) => ({ value: l, label: l }))} value={lang} onChange={setLang} />
      <CodeView label={`${lang} · ${doc.method} ${doc.path}`} copyLabel="Copy" body={SNIPPETS[mode][lang]} />
      <div className="mt-1 flex flex-col gap-0.5">
        <h3 className="m-0 text-eyebrow font-medium tracking-[0.6px] text-slate uppercase">{COPY.structureTitle}</h3>
        <p className="m-0 text-micro text-slate">{COPY.structureNote}</p>
      </div>
      <CodeView label={`${COPY.structureTitle} · ${doc.path}`} copyLabel="Copy" body={structure} className="max-h-[560px]" />
    </div>
  );
}
