import { LogoMark } from "@/components/brand/logo";
import type { Specimen } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * A specimen proof of address, drawn as a page.
 *
 * WHY THIS IS DRAWN AND NOT AN IMAGE. Figma's Desktop-37 fills this dialog with
 * a scan of an unrelated third-party PDF — a Random House production guide —
 * that had been dropped in as placeholder art. Shipping it would show an
 * applicant a document with nothing to do with proof of address, and would
 * reproduce someone else's copyrighted page. So the dialog gets a real specimen
 * of the thing actually being asked for.
 *
 * It is HTML, not an SVG or a bitmap, for three reasons that matter here: the
 * text is selectable and readable by a screen reader, it stays crisp at any
 * zoom (an applicant squinting at a sample document is the whole use case), and
 * the copy stays in `demo-data.ts` where the rest of the flow's copy lives.
 *
 * Every value is a specimen token and the page is watermarked, so it cannot be
 * mistaken for a real bill belonging to a real person.
 *
 * The three highlighted fields are the point of the whole dialog: an applicant
 * needs to know WHICH parts of their document we read, so those are numbered on
 * the page and repeated as a legend underneath.
 */
export function SpecimenDocument({ specimen }: { specimen: Specimen }) {
  // Resolved before the JSX. Numbering inside the render `.map()` would be an
  // accumulator in a memoizable callback — the `react-hooks/immutability` rule
  // the console's Donut ran into.
  const marks = new Map(
    specimen.fields.filter((f) => f.highlight).map((f, i) => [f.label, i + 1]),
  );

  return (
    <figure className="m-0 flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-tile border border-card-line bg-white shadow-[0_1px_2px_0_rgb(14_50_40/0.06)]">
        {/* Watermark. `aria-hidden` and drawn under the content — it marks the
            page for a human eye, and a screen reader reading "SPECIMEN" in the
            middle of an address would be noise. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="-rotate-24 text-[64px] leading-none font-bold tracking-[0.12em] text-pine/6 select-none sm:text-[92px]">
            {specimen.watermark}
          </span>
        </span>

        <header className="relative flex items-center gap-3 border-b border-card-line bg-tile px-6 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-well bg-pine text-lime">
            <LogoMark className="h-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-field font-medium text-pine">{specimen.issuer}</span>
            <span className="text-[11px] leading-4 text-quiet">{specimen.issuerMeta}</span>
          </span>
        </header>

        <div className="relative flex flex-col gap-4 px-6 py-5">
          <h4 className="m-0 text-eyebrow font-medium tracking-[0.5px] text-pine/71 uppercase">
            {specimen.title}
          </h4>

          <dl className="m-0 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-5 gap-y-3">
            {specimen.fields.map((field) => {
              const mark = marks.get(field.label);
              return (
                <div key={field.label} className="contents">
                  <dt className="text-caption text-quiet">{field.label}</dt>
                  <dd
                    className={cn(
                      "m-0 flex items-start gap-2 text-caption text-pine",
                      mark && "font-medium",
                    )}
                  >
                    {mark ? (
                      <span
                        aria-hidden
                        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-lime text-[10px] leading-none font-bold text-pine"
                      >
                        {mark}
                      </span>
                    ) : null}
                    <span className={cn("flex flex-col", mark && "-mt-px")}>
                      {(Array.isArray(field.value) ? field.value : [field.value]).map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {/* The legend. Numbered to match the page, so "we check three things" is
          shown against the document rather than asserted next to it. */}
      <figcaption className="flex flex-col gap-2.5">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {specimen.fields
            .filter((f) => f.highlight)
            .map((field) => (
              <li key={field.label} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-lime text-[10px] leading-none font-bold text-pine"
                >
                  {marks.get(field.label)}
                </span>
                <span className="text-caption text-quiet">
                  <span className="font-medium text-pine">{field.label}.</span> {field.highlight}
                </span>
              </li>
            ))}
        </ol>
        <p className="m-0 text-caption text-quiet">{specimen.footnote}</p>
      </figcaption>
    </figure>
  );
}
