import { MICR_SYMBOL_NAME, micrTokens, WEAK_CHAR } from "@/lib/finance/micr";
import type { MicrSymbol } from "@/lib/finance/micr";
import type { ChequeResponse } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/**
 * The MICR line as the engine read it, drawn like the strip along the
 * bottom of a cheque: digits in white, control symbols in lime, and a small
 * bar under every character whose length is that character's confidence.
 * Anything under `WEAK_CHAR` turns amber so a doubtful digit is obvious.
 *
 * The line always fits its panel, never scrolls: one grid column per
 * character, and the glyph size follows the column width (container units),
 * capped at the size it reads best at.
 *
 * The E-13B glyphs (⑆ ⑈ ⑉ ⑇) live in the Unicode OCR block, which few text
 * faces carry, so symbols use a symbol-font stack; those faces draw them
 * small inside the em box, hence the larger size for symbols.
 */
const SYMBOL_FONT = "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','Noto Sans Symbols',sans-serif";

export function MicrLine({ micr }: { micr: NonNullable<ChequeResponse["micr"]> }) {
  const tokens = micrTokens(micr);
  const n = Math.max(tokens.length, 1);
  const present = [...new Set(tokens.filter((t) => t.kind !== "digit").map((t) => t.kind as MicrSymbol))];
  const cell = `calc(100cqw / ${n})`;

  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-pine px-4 pt-4 pb-3.5">
      <div className="@container w-full">
        <div
          className="grid items-end"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          aria-label={`MICR line ${micr.printed}`}
          role="img"
        >
          {tokens.map((t, i) => {
            // confidence can arrive as a string; coerce so `.toFixed` can't crash.
            const conf = typeof t.confidence === "number" ? t.confidence : Number(t.confidence);
            const weak = Number.isFinite(conf) && conf < WEAK_CHAR;
            const name = t.kind === "digit" ? t.glyph : MICR_SYMBOL_NAME[t.kind];
            return (
              <span key={i} title={`${name}, ${Number.isFinite(conf) ? conf.toFixed(1) : "-"}%`} className="flex min-w-0 flex-col items-center gap-1.5">
                {t.kind === "control" ? (
                  <span aria-hidden className="grid h-[26px] w-full place-items-center">
                    <span className="size-2 rotate-45 rounded-[2px] border border-lime" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-[26px] w-full items-center justify-center leading-none",
                      t.kind === "digit" ? "font-mono text-white" : "text-lime",
                      weak && "text-[#f6c86b]",
                    )}
                    style={
                      t.kind === "digit"
                        ? { fontSize: `min(22px, ${cell} * 1.5)` }
                        : { fontSize: `min(32px, ${cell} * 2.1)`, fontFamily: SYMBOL_FONT }
                    }
                  >
                    {t.glyph}
                  </span>
                )}
                <span aria-hidden className="h-[3px] w-[70%] max-w-3 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(8, t.confidence)}%`, background: weak ? "#f6c86b" : "rgba(191,235,88,.8)" }}
                  />
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {present.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 border-t border-white/10 p-0 pt-2.5">
          {present.map((kind) => (
            <li key={kind} className="flex items-center gap-1.5 text-[11px] text-white/65">
              {kind === "control" ? (
                <span aria-hidden className="size-1.5 rotate-45 rounded-[1px] border border-lime" />
              ) : (
                <span aria-hidden className="text-[20px] leading-none text-lime" style={{ fontFamily: SYMBOL_FONT }}>
                  {tokens.find((t) => t.kind === kind)?.glyph}
                </span>
              )}
              {MICR_SYMBOL_NAME[kind]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
