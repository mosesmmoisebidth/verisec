import { ChevronRight } from "lucide-react";

/**
 * Raw data as an expandable tree: the top level is listed, every nested object or
 * array starts folded with its size shown, and opens on click. Plain <details>, so it
 * works without JavaScript and is keyboard and screen reader friendly.
 */
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function Leaf({ value }: { value: Json }) {
  if (value === null) return <span className="text-inert">null</span>;
  if (typeof value === "string") return <span className="text-pine [overflow-wrap:anywhere]">&quot;{value}&quot;</span>;
  return <span className="tnum text-ramp-2">{String(value)}</span>;
}

function Node({ name, value, depth }: { name: string; value: Json; depth: number }) {
  const isObj = value !== null && typeof value === "object";
  if (!isObj) {
    return (
      <li className="flex min-w-0 gap-1.5 py-0.5 pl-5">
        <span className="shrink-0 text-muted">{name}:</span>
        <Leaf value={value} />
      </li>
    );
  }
  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, Json>);
  const size = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <li className="py-0.5">
      <details open={depth === 0} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" strokeWidth={2} />
          <span className="text-muted">{name}</span>
          <span className="text-inert">{size}</span>
        </summary>
        {entries.length > 0 && (
          <ul className="m-0 ml-1.5 list-none border-l border-hairline p-0 pl-2">
            {entries.map(([k, v]) => (
              <Node key={k} name={k} value={v} depth={depth + 1} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

export function JsonTree({ text }: { text: string }) {
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch {
    return <pre className="m-0 overflow-auto text-micro whitespace-pre-wrap text-slate">{text}</pre>;
  }
  return (
    <ul className="m-0 max-h-[520px] list-none overflow-auto rounded-box border border-hairline bg-page p-2.5 font-mono text-[12px] leading-5">
      <Node name="data" value={data} depth={0} />
    </ul>
  );
}
