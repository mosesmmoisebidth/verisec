import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { DataNoticeCard } from "@/components/verify/data-notice";
import { DeviceCheck } from "@/components/verify/device-check";
import { DoneButton } from "@/components/verify/done-button";
import { FlowEntry } from "@/components/verify/flow-entry";
import { LinkGate } from "@/components/verify/link-gate";
import { PlanGate, PlanMobileProgress, PlanStepCounter, PlanStepper, PlanText } from "@/components/verify/plan-flow";
import { ResumeGate } from "@/components/verify/resume-gate";
import { SaveExit } from "@/components/verify/save-exit";
import { TenantAvatar, TenantText } from "@/components/verify/tenant";
import { TipLink } from "@/components/verify/tip-modal";
import type { ScreenContext } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * Optional footer overrides. When a screen is driven client-side (the document
 * front/back capture, which is one step with two in-place substates), the owner
 * passes handlers here and the footer renders buttons that advance state instead
 * of `<a>` links that reload the page. Omitted everywhere else — the footer then
 * behaves exactly as before, a sequence of plain links that work in the static
 * export with no JavaScript.
 */
export type FooterNav = {
  onNext?: () => void;
  onBack?: () => void;
  /** When true, the Continue button is present but disabled (e.g. terms not yet
   *  accepted, or a capture not yet taken). Keeps the button in place so it does
   *  not vanish from under the cursor while the screen becomes valid. */
  nextDisabled?: boolean;
  /** When true, Continue shows a spinner and is not clickable (work in flight). */
  loading?: boolean;
};

/**
 * The chrome every applicant screen sits in — Figma's 1257×700 card.
 *
 * Not a route-group layout, for the same reason `ConsoleShell` is not: a layout
 * cannot reuse the context the page already awaited, so it would fetch the flow
 * a second time to draw the rail.
 *
 * The card is centred in the viewport over the line field, and is one grid: a
 * 381px aside holding the brand and the step rail, and an 873px column holding
 * the screen. Below `lg` the aside is dropped — see `<MobileProgress>`.
 *
 * Everything animates from CSS (`.vs-in`, `--vs-d`), so the whole flow stays
 * server-rendered. See the motion block in globals.css.
 */
export function FlowShell({
  ctx,
  children,
  nav,
  asideSlot,
  wide,
}: {
  ctx: ScreenContext;
  children: React.ReactNode;
  nav?: FooterNav;
  /** Extra content rendered in the left explainer column, below its text. Used
   *  by screens (like Confirm Details) that want a summary beside the controls
   *  instead of splitting their own column. */
  asideSlot?: React.ReactNode;
  /** Give the screen the FULL card width, stacking the explainer above the
   *  content instead of beside it. The camera steps need this: Regula sizes its
   *  guide oval from the camera window's WIDTH, so boxing the camera into the
   *  ~300px side column shrinks the oval until a head no longer fits it. */
  wide?: boolean;
}) {
  const { brand, copy, screen, title } = ctx;
  // every screen in flow order: where the gate looks for the next one this workflow shows
  const order = ctx.steps.flatMap((s) => s.screens);

  const asideBlock = screen.aside ? (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-body leading-relaxed text-quiet">
        <PlanText text={screen.aside.body} needs={screen.aside.needs} leaner={screen.aside.leaner} />
      </p>
      {screen.aside.link ? (
        screen.aside.link.tip ? (
          <TipLink label={screen.aside.link.label} tip={screen.aside.link.tip} />
        ) : (
          <a
            href={screen.aside.link.href}
            // another page (the full policy) opens in its own tab: the applicant keeps their place in the flow
            {...(screen.aside.link.href?.startsWith("/") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="group inline-flex w-fit items-center gap-1.5 text-body font-medium text-pine underline-offset-4 transition-colors hover:underline"
          >
            {screen.aside.link.label}
            <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
          </a>
        )
      ) : null}
      {screen.aside.notice ? <DataNoticeCard notice={screen.aside.notice} /> : null}
    </div>
  ) : null;

  return (
    <div className="vs-ground relative min-h-screen">
      <FlowEntry order={ctx.stepNumber * 100 + ctx.substepNumber} />
      <DeviceCheck />
      <PlanGate slug={screen.slug} order={order} />
      <ResumeGate steps={ctx.steps} />
      <LinkGate />
      <div className="vs-backdrop" aria-hidden />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-8 lg:px-8">
        <main className="vs-card-in flex max-h-[calc(100dvh-4.25rem)] w-full max-w-flow-card overflow-hidden rounded-[22px] shadow-flow backdrop-blur-[14.9px] sm:max-h-[calc(100dvh-6rem)] sm:rounded-[24px] lg:rounded-flow">
          <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[var(--spacing-flow-aside)_1fr]">
            <FlowAside ctx={ctx} />

            <div className="vs-stage flex min-h-0 flex-col gap-4 bg-white p-4 sm:gap-6 sm:p-6 lg:p-flow-pad">
              {/* Frame 81 — the tenant bar. Save & exit sits left of the org,
                  not right: it is an escape hatch, and burying it beside the
                  account puts it where a "sign out" would be. */}
              <header className="vs-in flex items-center justify-between gap-4">
                <SaveExit label={brand.saveAndExit} />

                <span className="flex items-center gap-2.5">
                  <TenantAvatar />
                  <span className="text-body font-medium text-pine">
                    <TenantText text={brand.tenant} />
                  </span>
                </span>
              </header>

              <div className="flex flex-col gap-1 pt-2">
                <p className="vs-in text-eyebrow text-pine/71" style={delay(60)}>
                  <PlanStepCounter template={copy.stepCounter} steps={ctx.steps} stepId={ctx.step.id} slug={screen.slug} />
                </p>
                {/* `ctx.title`, not `screen.title` — a result screen's heading
                    is chosen by the verdict. See the note in types.ts. */}
                <h1
                  className="vs-in m-0 text-display-sm text-pine lg:text-display"
                  style={delay(110)}
                >
                  {title}
                </h1>
                {screen.intro ? (
                  <p className="vs-in m-0 max-w-[68ch] pt-0.5 text-body text-quiet" style={delay(160)}>
                    <TenantText text={screen.intro} />
                  </p>
                ) : null}
              </div>

              <PlanMobileProgress
                steps={ctx.steps}
                stepId={ctx.step.id}
                slug={screen.slug}
                title={ctx.step.title}
                substepTemplate={copy.substep}
              />

              <hr className="vs-in m-0 border-0 border-t border-divider" style={delay(200)} />

              {/* The body scrolls INSIDE the card, so the footer (Continue) stays
                  pinned and visible however long the content is. */}
              <div className="vs-scroll -mr-2 flex-1 min-h-0 overflow-y-auto pr-2">
              {wide ? (
                // Same two columns, but the explainer is squeezed to a narrow
                // rail so the content column keeps most of the card. The camera
                // steps need that width (Regula sizes its guide oval from the
                // camera window's WIDTH), and keeping the explainer BESIDE the
                // camera rather than above it is what keeps the box off a scroll.
                <div
                  className="vs-in grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)]"
                  style={delay(250)}
                >
                  <div className="flex flex-col gap-4">
                    {asideBlock}
                    {asideSlot}
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">{children}</div>
                </div>
              ) : screen.aside ? (
                // The updated frames run a left explainer column beside the
                // controls. Below `lg` it stacks: the explanation reads first,
                // then the controls.
                <div
                  className={cn(
                    "vs-in grid gap-x-10 gap-y-6",
                    // A data-handling note needs a wider explainer so it reads in
                    // a few comfortable lines instead of a narrow column.
                    screen.aside.notice
                      ? "lg:grid-cols-[minmax(0,370px)_minmax(0,1fr)]"
                      : "lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]",
                  )}
                  style={delay(250)}
                >
                  <div className="flex flex-col gap-4">
                    {asideBlock}
                    {asideSlot}
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">{children}</div>
                </div>
              ) : (
                <div className="vs-in flex flex-col gap-6" style={delay(250)}>
                  {children}
                </div>
              )}
              </div>

              <FlowFooter ctx={ctx} nav={nav} />
            </div>
          </div>
        </main>

        <p className="vs-in m-0 text-eyebrow text-pine/70" style={delay(420)}>
          {copy.poweredBy}
        </p>
      </div>
    </div>
  );
}

/** `--vs-d`, the stagger each `.vs-in` reads for its animation delay. */
function delay(ms: number) {
  // Scale every stagger down (and cap it): these delays re-run on each step
  // navigation, so the original 60-520ms cascade made pages trickle in for a
  // full second and felt laggy. Kept as a light cascade that settles fast.
  return { "--vs-d": `${Math.min(180, Math.round(ms * 0.34))}ms` } as React.CSSProperties;
}


/* ----------------------------------------------------------------------------
   Aside, brand, step rail, legal
---------------------------------------------------------------------------- */

function FlowAside({ ctx }: { ctx: ScreenContext }) {
  const { brand } = ctx;

  return (
    <aside className="hidden min-h-0 flex-col justify-between gap-10 overflow-y-auto bg-white/60 p-aside-pad lg:flex">
      <div className="flex flex-col gap-10">
        <span className="vs-in flex items-center gap-2 text-pine">
          <LogoMark className="h-7" />
          <span className="text-mark leading-none font-bold tracking-tight">{brand.wordmark}</span>
        </span>

        <PlanStepper
          steps={ctx.steps}
          stepId={ctx.step.id}
          slug={ctx.screen.slug}
          optionalLabel={ctx.copy.optional}
          substepTemplate={ctx.copy.substep}
        />
      </div>

      <p className="vs-in m-0 text-eyebrow leading-4 text-quiet" style={delay(520)}>
        <TenantText text={brand.legal} />
      </p>
    </aside>
  );
}

/* ----------------------------------------------------------------------------
   Footer
---------------------------------------------------------------------------- */

/**
 * Back / Skip / Continue, at the frame's 90×36 and 132×36.
 *
 * Every one of them is a link, not a button, because the flow is a sequence of
 * URLs and nothing about moving between them needs JavaScript. That keeps the
 * whole thing walkable in the static export, and it means the browser's own
 * back button already does the right thing.
 */
function FlowFooter({ ctx, nav }: { ctx: ScreenContext; nav?: FooterNav }) {
  const { screen, copy } = ctx;
  const href = (slug: string) => `/verify/${slug}`;

  // Identical classes whether the control is a link or a button, so an in-place
  // substep advance looks and feels exactly like a step navigation.
  const backCls =
    "group inline-flex h-9 min-w-[90px] items-center justify-center gap-2 rounded-pill bg-pine/10 pr-6 pl-[18px] text-body text-pine transition-[background-color,transform] hover:bg-pine/15 active:scale-[0.97]";
  const nextCls =
    "group inline-flex h-9 min-w-[132px] items-center justify-center gap-2 rounded-pill bg-pine px-6 text-body text-white shadow-cta transition-[background-color,transform] hover:bg-pine/90 active:scale-[0.97]";

  const backInner = (
    <>
      <ArrowLeft
        aria-hidden
        className="size-3.5 transition-transform group-hover:-translate-x-0.5"
        strokeWidth={1.8}
      />
      {copy.back}
    </>
  );
  const nextInner = (
    <>
      {screen.next.label}
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
        strokeWidth={1.8}
      />
    </>
  );

  return (
    <footer
      className="vs-in flex flex-wrap items-center gap-3 border-t border-divider pt-6"
      style={delay(320)}
    >
      {screen.back ? (
        // A handler makes Back an in-place substep move (front←back); otherwise
        // it is the plain slug link it has always been.
        nav?.onBack ? (
          <button type="button" onClick={nav.onBack} className={backCls}>
            {backInner}
          </button>
        ) : (
          <Link href={href(screen.back)} className={backCls}>
            {backInner}
          </Link>
        )
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-4">
        {screen.skip ? (
          <Link
            href={href(screen.skip.to)}
            className="inline-flex h-9 items-center justify-center text-body text-pine/70 underline underline-offset-4 transition-colors hover:text-pine"
          >
            {screen.skip.label}
          </Link>
        ) : null}

        {nav?.onNext ? (
          // Continue advances an in-place substep or a client-gated navigation.
          // Disabled (not absent) until the screen is valid — e.g. all terms
          // ticked, or a capture taken — so it never vanishes under the cursor.
          <button
            type="button"
            onClick={nav.loading ? undefined : nav.onNext}
            disabled={nav.nextDisabled || nav.loading}
            aria-disabled={nav.nextDisabled || nav.loading}
            aria-busy={nav.loading}
            className={cn(
              nextCls,
              (nav.nextDisabled || nav.loading) &&
                "cursor-not-allowed bg-pine/28 shadow-none hover:bg-pine/28 active:scale-100",
            )}
          >
            {nav.loading ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {screen.next.label}
              </>
            ) : (
              nextInner
            )}
          </button>
        ) : screen.next.to ? (
          <Link href={href(screen.next.to)} className={nextCls}>
            {nextInner}
          </Link>
        ) : screen.next.exit ? (
          // The flow is over and there is somewhere to go — an absolute path
          // out of the flow, not a slug within it.
          <a href={screen.next.exit} className={nextCls}>
            {nextInner}
          </a>
        ) : screen.next.close ? (
          // The flow is over with nothing after it: clear this device and close
          // the tab. A client action, so it is its own small component.
          <DoneButton label={screen.next.label} className={nextCls} />
        ) : (
          // Over, with nowhere to go. Disabled rather than absent so the button
          // does not vanish from under the cursor on the last screen.
          <button
            type="button"
            disabled
            className="inline-flex h-9 min-w-[132px] cursor-default items-center justify-center gap-2 rounded-pill bg-pine/28 px-6 text-body text-white"
          >
            {screen.next.label}
            <Check aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
    </footer>
  );
}
