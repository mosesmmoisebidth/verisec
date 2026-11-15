"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Terminal-style code panel used across the Developers page: window
 * chrome (traffic lights or language tabs) plus a copy button.
 */

function TrafficLights() {
  return (
    <span aria-hidden className="flex items-center gap-2">
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </span>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context) — leave the label as-is.
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#242424]/15 bg-[#242424]/5 px-2.5 py-1 text-[11px] font-medium text-[#636363] transition-colors hover:bg-[#242424]/10"
    >
      <Icon aria-hidden className="size-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CodeBlock({
  title,
  code,
  className,
  accent = false,
}: {
  title: string;
  code: string;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border bg-panel",
        accent
          ? "border-lime/60 shadow-[0_20px_60px_-25px_rgba(191,235,88,0.5)]"
          : "border-black/10 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.16)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-2.5">
        <span className="flex items-center gap-2">
          <TrafficLights />
          <span className="pl-2 font-mono text-[11px] text-[#4c4c4c]">
            {title}
          </span>
        </span>
        <CopyButton value={code} />
      </div>
      <pre className="flex-1 overflow-x-auto p-4 font-mono text-xs leading-[1.65] text-pine">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function TabbedCodeBlock({
  languages,
  className,
}: {
  languages: readonly { id: string; label: string; code: string }[];
  className?: string;
}) {
  const [activeId, setActiveId] = useState(languages[0]?.id ?? "");
  const active = languages.find((l) => l.id === activeId) ?? languages[0];

  if (!active) return null;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-lime/60 bg-panel shadow-[0_20px_60px_-25px_rgba(191,235,88,0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-black/10 px-3 py-2">
        <div
          role="tablist"
          aria-label="Language"
          className="flex flex-wrap gap-1"
        >
          {languages.map((language) => {
            const isActive = language.id === active.id;
            return (
              <button
                key={language.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(language.id)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1 font-mono text-[11px] transition-colors",
                  isActive
                    ? "bg-black/10 text-pine"
                    : "text-[#4c4c4c] hover:bg-black/5",
                )}
              >
                {language.label}
              </button>
            );
          })}
        </div>
        <CopyButton value={active.code} />
      </div>
      <pre className="flex-1 overflow-x-auto p-4 font-mono text-xs leading-[1.65] text-pine">
        <code>{active.code}</code>
      </pre>
    </div>
  );
}

/** Small install-command chip used on the SDK cards. */
export function InstallLine({ command }: { command: string }) {
  return (
    <code className="block overflow-x-auto rounded-xl bg-pine px-3 py-2 font-mono text-[11px] whitespace-nowrap text-lime">
      {command}
    </code>
  );
}
