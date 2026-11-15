"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { CopyButton } from "@/components/dev/code-block";
import type { DeveloperSample } from "@/config/developer-samples";
import { cn } from "@/lib/utils";

type Tab = "response" | "boxes";

/** The API answers, each under the call that returned it. */
function responseText(sample: DeveloperSample) {
  return sample.reads.map((r) => `// ${r.endpoint}\n${JSON.stringify(r.json, null, 2)}`).join("\n\n");
}

/** What was drawn on the image: every detected text region, one per line so the list stays readable. */
function boxesText(sample: DeveloperSample) {
  const rows = sample.detected.boxes.map((b) => `    { "box": [${b.box.join(", ")}], "score": ${b.score} }`);
  return `{\n  "width": ${sample.detected.width},\n  "height": ${sample.detected.height},\n  "boxes": [\n${rows.join(",\n")}\n  ]\n}`;
}

const STATUS_TONE: Record<string, string> = {
  read: "bg-pass-tint text-ramp-2",
  partial: "bg-caution-tint text-caution",
  unreadable: "bg-danger-tint text-danger",
};

/**
 * One sample on the Developers page: the photo with the engines' result drawn on it (saved as an
 * image, not drawn in the browser), the exact JSON the API returned, and a way into the Playground.
 */
export function SampleCard({ sample, href }: { sample: DeveloperSample; href: string }) {
  const [tab, setTab] = useState<Tab>("response");
  const text = tab === "response" ? responseText(sample) : boxesText(sample);
  const status = String((sample.reads[0]?.json as { status?: unknown } | undefined)?.status ?? "");
  const tabs: { id: Tab; label: string }[] = [
    { id: "response", label: "API response" },
    { id: "boxes", label: `Detected boxes (${sample.regions})` },
  ];

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[18px] border border-hairline bg-panel shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)]">
      <a
        href={href}
        className="group relative block aspect-[8/5] overflow-hidden bg-pine/5 outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-inset"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sample.src}
          alt={`${sample.title}, with every detected text region outlined`}
          width={800}
          height={500}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute top-3 left-3 rounded-full bg-pine px-2.5 py-0.5 text-[10px] font-bold text-lime">
          {sample.kind}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-pine">
          {sample.regions} text regions
        </span>
      </a>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-bold text-pine">{sample.title}</h4>
          {status ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize",
                STATUS_TONE[status] ?? "bg-white text-pine",
              )}
            >
              {status}
            </span>
          ) : null}
        </div>

        <div role="tablist" aria-label={`${sample.title} JSON`} className="flex gap-1 self-start rounded-full bg-white p-1 ring-1 ring-hairline">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                tab === t.id ? "bg-pine text-white" : "text-pine/70 hover:text-pine",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="relative">
          <pre className="h-44 overflow-auto rounded-xl border border-hairline bg-white py-2.5 pr-12 pl-3 font-mono text-[10.5px] leading-[1.55] text-pine">
            <code>{text}</code>
          </pre>
          <div className="absolute top-2 right-2">
            <CopyButton value={text} />
          </div>
        </div>

        <a
          href={href}
          className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-bold text-pine underline-offset-4 hover:underline"
        >
          Open in Playground
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      </div>
    </article>
  );
}
