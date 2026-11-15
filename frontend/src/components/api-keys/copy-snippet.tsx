"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a code snippet to the clipboard — the SDK cards' one interactive bit. */
export function CopySnippet({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      aria-label={`${label}: ${value}`}
      className="grid size-6 shrink-0 place-items-center rounded-md text-pine/50 transition-colors hover:bg-pine/8 hover:text-pine"
    >
      {copied ? (
        <Check aria-hidden className="size-3.5 text-ramp-2" strokeWidth={2.2} />
      ) : (
        <Copy aria-hidden className="size-3.5" strokeWidth={1.7} />
      )}
    </button>
  );
}
