import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Every custom `--text-*` size in `app/globals.css`, by name.
 *
 * WHY THIS LIST HAS TO EXIST. `tailwind-merge` resolves conflicts from a table
 * of stock Tailwind class names; it has never seen this project's `@theme`, so
 * it cannot tell `text-micro` (a size) from `text-slate` (a colour) and files
 * both under one group. The last one wins, and the size is DELETED — silently,
 * at runtime, only inside `cn()`. `cn("text-micro", "text-slate")` returned
 * exactly `"text-slate"`, which is how a table of timestamps ended up at the
 * browser's default 16px and truncating.
 *
 * Registering the names as font sizes is the whole fix, and it fixes every call
 * site at once rather than one `cn()` at a time.
 *
 * KEEP IN SYNC: add a `--text-*` token to `globals.css`, add its name here. The
 * cost of forgetting is not a crash — it is that one utility quietly stops
 * working wherever it meets a colour, which is the hardest kind of bug to see.
 */
const FONT_SIZES = [
  "body",
  "caption",
  "card",
  "display",
  "display-sm",
  "eyebrow",
  "field",
  "h1",
  "hero",
  "lead",
  "mark",
  "micro",
  "nav",
  "org",
  "read",
  "search",
  "section",
  "stat",
  "stat-lg",
  "step",
  "wordmark",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
