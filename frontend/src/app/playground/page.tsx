import { LogoMark } from "@/components/brand/logo";
import { firstScreenSlug, getVerifyFlow, IS_DEMO_DATA } from "@/lib/verify";

export const metadata = { title: "Flow playground · VeriSec" };

/**
 * An index of every screen in the applicant flow.
 *
 * NOT a rebuild of Figma's Desktop-1. That frame is a designed landing screen
 * and it is not reproduced here — it was not among the frames still to hand
 * when this was built, and guessing at a designed screen is exactly the habit
 * the 2026-08-21 purge was carried out to stop. Re-supply the frame and this
 * file is the one to replace.
 *
 * What it is instead: the thing that makes seventeen screens reviewable. Every
 * screen is one click away, grouped by step, so a designer can check a frame
 * against its build without walking the whole flow to reach screen fourteen.
 * It reads the same `getVerifyFlow()` everything else does, so it cannot list a
 * screen that does not exist or miss one that does.
 */
export default async function PlaygroundPage() {
  const [flow, firstSlug] = await Promise.all([getVerifyFlow(), firstScreenSlug()]);
  const screenCount = flow.steps.reduce((n, step) => n + step.screens.length, 0);

  return (
    <div className="flex min-h-screen justify-center bg-cream px-4 py-10 lg:px-8">
      <main className="flex w-full max-w-[900px] flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="flex items-center gap-2 text-pine">
            <LogoMark className="h-7" />
            <span className="text-mark leading-none font-bold tracking-tight">{flow.brand.wordmark}</span>
          </span>
          <h1 className="m-0 text-display font-medium text-pine">Applicant flow</h1>
          <p className="m-0 max-w-[62ch] text-read text-quiet">
            {screenCount} screens across {flow.steps.length} steps, built from the Figma frames.
            Start at the beginning or jump to any screen.
          </p>

          {IS_DEMO_DATA ? (
            <p className="m-0 rounded-well border border-caution/30 bg-caution-tint px-4 py-3 text-read text-caution">
              <strong className="font-medium">Sample data.</strong> Every value and every outcome in
              this flow is invented for demonstration. Nothing here is measured and nothing here
              should be relied on.
            </p>
          ) : null}

          <a
            href={`/verify/${firstSlug}`}
            className="inline-flex h-11 w-fit items-center rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-colors hover:bg-pine/90"
          >
            Start the flow
          </a>
        </header>

        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {flow.steps.map((step, i) => (
            <li
              key={step.id}
              className="flex flex-col gap-3 rounded-tile border border-card-line bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-pill bg-pine text-eyebrow font-medium text-lime"
                >
                  {i + 1}
                </span>
                <h2 className="m-0 text-field font-medium text-pine">{step.title}</h2>
                <span className="text-eyebrow text-quiet">
                  {step.screens.length} {step.screens.length === 1 ? "screen" : "screens"}
                </span>
                {step.partial ? (
                  <span className="rounded-pill bg-caution-tint px-2.5 py-0.5 text-eyebrow text-caution">
                    {step.partial}
                  </span>
                ) : null}
              </div>

              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {step.screens.map((screen) => (
                  <li key={screen.slug}>
                    <a
                      href={`/verify/${screen.slug}`}
                      className="inline-flex items-center rounded-pill border border-divider bg-tile px-3.5 py-1.5 text-body text-pine transition-colors hover:border-pine/28 hover:bg-white"
                    >
                      {screen.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
