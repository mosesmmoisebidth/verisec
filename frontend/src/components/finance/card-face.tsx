import { LogoMark } from "@/components/brand/logo";
import { cardField, groupPan, maskedPan } from "@/lib/finance/card";
import type { BinRecord, CardRead } from "@/lib/finance/types";

/**
 * The read card, redrawn as a card: number, expiry, holder, network and bank
 * laid out where they sit on plastic, in the brand's pine and lime. A generic
 * face with no issuer artwork, so it can never pass for a real card image.
 *
 * Shows the full number only when the response carries it (the read itself);
 * stored scans show first six and last four.
 */
export function CardFace({ card, bin }: { card: Omit<CardRead, "bin">; bin: BinRecord | null | undefined }) {
  const number = card.number ? groupPan(card.number) : maskedPan(card);
  const network = bin?.network ?? null;
  const expiry = cardField(card, "valid_thru");
  const holder = cardField(card, "holder_name");

  return (
    <div
      className="@container relative aspect-[1.586] w-full max-w-[380px] overflow-hidden rounded-[18px] p-5 text-white shadow-[0_22px_44px_-22px_rgba(14,50,40,0.75)]"
      style={{ background: "linear-gradient(135deg,#0e3228 0%,#1a4a3a 55%,#27634d 100%)" }}
      role="img"
      aria-label={`Card ${number}${expiry ? `, valid through ${expiry}` : ""}`}
    >
      <span aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full bg-lime/[0.09]" />
      <span aria-hidden className="absolute -right-2 -bottom-24 size-56 rounded-full bg-lime/[0.06]" />

      <div aria-hidden className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate text-[11px] font-medium tracking-[0.08em] text-white/75 uppercase">
            {bin?.issuer ?? "Payment card"}
          </span>
          <LogoMark className="h-5 shrink-0 text-lime/80" />
        </div>

        <span className="block h-[26px] w-[36px] rounded-[6px] bg-[linear-gradient(135deg,#e6f7b6_0%,#bfeb58_60%,#9fd13a_100%)] shadow-inner">
          <span className="mx-auto mt-[12px] block h-px w-6 bg-pine/25" />
        </span>

        <p className="m-0 font-mono text-[clamp(12px,6.1cqw,22px)] tracking-[0.08em] whitespace-nowrap text-white tabular-nums">{number}</p>

        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[8px] tracking-[0.12em] text-white/55 uppercase">Valid thru</span>
            <span className="font-mono text-[13px] text-white">{expiry ?? "--/--"}</span>
            {holder ? (
              <span className="mt-1 truncate text-[11px] tracking-[0.08em] text-white/85 uppercase">{holder}</span>
            ) : null}
          </div>
          {network ? <span className="shrink-0 text-[15px] font-semibold tracking-[0.02em] text-lime italic">{network}</span> : null}
        </div>
      </div>
    </div>
  );
}
