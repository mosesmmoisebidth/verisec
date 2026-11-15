"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileQuestion, LockKeyhole } from "lucide-react";

import { CodeView } from "@/components/finance/code-view";
import { CopySnippet } from "@/components/api-keys/copy-snippet";
import { ImageStage } from "@/components/finance/image-stage";
import { Loading, ProductChip, RetryButton, StatePanel, StatusChip, TabStrip } from "@/components/finance/parts";
import { ScanResult } from "@/components/finance/scan-result";
import { FinApiError, finApi } from "@/lib/finance/api";
import { DETAIL, ENDPOINT, SOURCE_LABEL } from "@/lib/finance/content";
import { briefJson } from "@/lib/finance/json-brief";
import { duration, stamp, timeAgo } from "@/lib/finance/format";
import type { ScanResponse } from "@/lib/finance/types";

type Load = { kind: "loading" } | { kind: "ready"; scan: ScanResponse } | { kind: "missing" } | { kind: "offline" };

/** One stored scan, from whichever service made it (the id says which). */
export function ScanDetail() {
  const id = useSearchParams().get("id") ?? "";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [tab, setTab] = useState<"result" | "json">("result");

  // Bumped by Try again; the effect re-fetches on change.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    finApi.getScan(id).then(
      (scan) => alive && setLoad({ kind: "ready", scan }),
      (err: unknown) =>
        alive &&
        setLoad(err instanceof FinApiError && err.kind === "http" && err.status === 404 ? { kind: "missing" } : { kind: "offline" }),
    );
    return () => {
      alive = false;
    };
  }, [id, nonce]);

  const retry = () => {
    setLoad({ kind: "loading" });
    setNonce((n) => n + 1);
  };
  // No id in the URL: nothing to fetch.
  const view: Load = id ? load : { kind: "missing" };

  return (
    <div className="flex flex-col gap-row">
      <a href="/fin/scans" className="inline-flex w-fit items-center gap-1.5 text-micro text-crumb transition-colors hover:text-pine">
        <ArrowLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
        {DETAIL.back}
      </a>

      {view.kind === "loading" ? (
        <Loading label={DETAIL.loading} />
      ) : view.kind === "missing" ? (
        <StatePanel icon={FileQuestion} title={DETAIL.notFoundTitle} body={DETAIL.notFoundBody} />
      ) : view.kind === "offline" ? (
        <StatePanel title={DETAIL.offlineTitle} body={DETAIL.offlineBody} action={<RetryButton label={DETAIL.retryLabel} onClick={retry} />} />
      ) : (
        <Loaded scan={view.scan} tab={tab} setTab={setTab} />
      )}
    </div>
  );
}

function Loaded({ scan, tab, setTab }: { scan: ScanResponse; tab: "result" | "json"; setTab: (t: "result" | "json") => void }) {
  const imageUrl = scan.object === "cheque" ? finApi.chequeImageUrl(scan) : null;

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-mono text-[21px] font-medium tracking-[-0.3px] text-pine">{scan.id}</h1>
        <CopySnippet value={scan.id} label="Copy scan ID" />
        <ProductChip product={scan.object} />
        <StatusChip status={scan.status} />
      </header>

      <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Meta label={DETAIL.meta.created} value={stamp(scan.created_at)} hint={timeAgo(scan.created_at)} />
        <Meta label={DETAIL.meta.source} value={SOURCE_LABEL[scan.source]} />
        <Meta label={DETAIL.meta.env} value={scan.env === "live" ? "Live" : "Test"} />
        <Meta label={DETAIL.meta.time} value={duration(scan.processing_ms)} />
      </dl>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="flex min-w-0 flex-col gap-3 rounded-shell border border-hairline bg-panel p-4">
          <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">{DETAIL.imageTitle}</h2>
          {scan.object === "cheque" && imageUrl ? (
            <ImageStage
              src={imageUrl}
              alt={`Cheque ${scan.id}`}
              size={scan.image}
              box={scan.micr?.box}
              showBoxLabel={DETAIL.showBox}
              missingLabel={DETAIL.imageMissing}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-edge bg-page px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-pill bg-pine text-lime">
                <LockKeyhole aria-hidden className="size-5" strokeWidth={1.8} />
              </span>
              <p className="m-0 text-section font-medium text-pine">{DETAIL.cardImageTitle}</p>
              <p className="m-0 max-w-[42ch] text-micro text-slate">{DETAIL.cardImageBody}</p>
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4 rounded-shell border border-hairline bg-panel p-4">
          <TabStrip
            label="Scan views"
            tabs={[
              { id: "result" as const, label: DETAIL.tabs.result },
              { id: "json" as const, label: DETAIL.tabs.json },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "result" ? (
            <ScanResult result={scan} />
          ) : (
            <CodeView
              label={`GET ${ENDPOINT[scan.object].replace("/micr", "").replace("/read", "")}/${scan.id}`}
              copyLabel="Copy"
              body={briefJson(scan)}
              tree={scan}
              copyValue={JSON.stringify(scan, null, 2)}
              className="max-h-[680px]"
            />
          )}
        </section>
      </div>
    </>
  );
}

function Meta({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-hairline bg-panel px-3.5 py-3">
      <dt className="text-[11px] tracking-[0.4px] text-muted uppercase">{label}</dt>
      <dd className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className="tnum text-body font-medium text-pine">{value}</span>
        {hint ? <span className="text-micro text-slate">{hint}</span> : null}
      </dd>
    </div>
  );
}
