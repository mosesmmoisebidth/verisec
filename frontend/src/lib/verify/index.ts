/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE ONE FILE TO CHANGE WHEN YOU WIRE THE APPLICANT FLOW TO THE BACKEND
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Same contract as `lib/console/index.ts`, deliberately — one pattern to learn,
 * not two. Every screen is a pure function of the `ScreenContext` this builds.
 * Nothing imports the demo dataset directly, no component holds a label or an
 * outcome of its own, and no view knows where the data came from. So:
 *
 *   · Replace the bodies of `getVerifyFlow()` / `getScreen()` with fetches.
 *   · Return the shapes in `./types.ts`.
 *   · Change nothing else. No JSX, no CSS, no props.
 *
 * They are already `async`, so becoming real network calls needs no change at
 * any call site.
 *
 * A sketch of what that looks like — note that a verification session is
 * per-applicant, so unlike the console this one takes a session id:
 *
 *     export async function getVerifyFlow(sessionId: string): Promise<VerifyFlow> {
 *       const res = await fetch(`${apiBase()}/api/sessions/${sessionId}/flow`, {
 *         headers: { Authorization: `Bearer ${token}` },
 *         cache: "no-store",
 *         signal: AbortSignal.timeout(15_000),
 *       });
 *       if (!res.ok) throw new ApiError(...);
 *       return toVerifyFlow(await res.json());
 *     }
 *
 * Things worth keeping when you do:
 *
 *   · TIME OUT THE REQUEST. The backend host is resolved at run time from
 *     `public/config.js`, so a stale value does not fail — it hangs, and an
 *     applicant sits on a spinner mid-verification with no way out.
 *   · Keep the payload JSON-serialisable. Panel kinds, icons and outcomes are
 *     string unions in `types.ts` precisely so it can cross the wire untouched.
 *   · DO NOT ADD A VERDICT FIELD. `decide()` below computes the verdict, the
 *     risk level and the reason codes from the signals. If the backend also
 *     sends a verdict, the two will disagree the first time a check changes and
 *     the screen will contradict the audit log. Send signals; derive the rest.
 *   · DO NOT ADD A POSITION FIELD. "2 of 4" is counted from the step's
 *     `screens` array. The frames disagree with themselves about these numbers;
 *     deriving them is what stops that reaching an applicant.
 *   · The static export enumerates routes with `listScreenSlugs()`. Once the
 *     flow is per-session it stops being static — move `/verify/[step]` to a
 *     server render, or keep the shape static and hydrate the values.
 */

import { DEMO_FLOW } from "./demo-data";
import type {
  Decision,
  FlowBrand,
  FlowLanding,
  RiskLevel,
  ScreenContext,
  Signal,
  Verdict,
  VerifyFlow,
} from "./types";

export * from "./types";

/**
 * Turns the signals into a verdict, a risk level and reason codes.
 *
 * THE ONLY PLACE ANY OF THE THREE IS DECIDED. The interim summary and the final
 * screen both call it, so they cannot drift apart, and a screen that wanted to
 * show its own verdict would have to go through here to get one.
 *
 * The rule is intentionally severe and intentionally boring: the worst outcome
 * wins. A flow that averaged its signals, or weighted them, would let two
 * "attention" results add up to a pass — which is precisely the failure an
 * identity check exists to prevent. Any weighting belongs in the engine that
 * produces the signals, where it can be audited, not in the screen that draws
 * them.
 */
export function decide(signals: Signal[]): Decision {
  const failed = signals.some((s) => s.outcome === "fail");
  const flagged = signals.some((s) => s.outcome === "attention");

  const verdict: Verdict = failed ? "Declined" : flagged ? "Needs review" : "Verified";
  const risk: RiskLevel = failed ? "High" : flagged ? "Medium" : "Low";

  return {
    verdict,
    risk,
    reasons: signals
      .filter((s) => s.outcome !== "pass")
      .map((s) => ({ label: s.label, detail: s.detail, outcome: s.outcome })),
  };
}

/**
 * The whole flow.
 *
 * Currently serves the demo dataset. Takes no session id yet; add one here
 * rather than at the call sites, which already await it.
 */
export async function getVerifyFlow(): Promise<VerifyFlow> {
  return DEMO_FLOW;
}

/**
 * One screen, plus everything the shell around it needs — which step it belongs
 * to, where it sits in that step, and the stepper rail.
 *
 * Returns null for an unknown slug so the route can 404. Steps the frames did
 * not supply have no screen and therefore no route: an invented screen in a
 * verification flow is worse than a missing one.
 */
export async function getScreen(slug: string): Promise<ScreenContext | null> {
  const flow = await getVerifyFlow();

  const stepIndex = flow.steps.findIndex((step) => step.screens.some((s) => s.slug === slug));
  // A miss gives -1, and `steps[-1]` is undefined — so the lookup guards itself
  // and the separate `=== -1` check is redundant.
  const step = flow.steps[stepIndex];
  if (!step) return null;

  const substepIndex = step.screens.findIndex((s) => s.slug === slug);
  const screen = step.screens[substepIndex];
  if (!screen) return null;

  // The findings panel names the subset of checks it covers — it runs before
  // the address step, so it can only report what had been checked by then. The
  // result panel summarises all of them. Every other screen needs none.
  // Resolved here so no component ever reaches into the flow itself.
  const signals =
    screen.panel.kind === "findings"
      ? screen.panel.signalIds
          .map((id) => flow.signals.find((s) => s.id === id))
          .filter((s): s is Signal => s !== undefined)
      : screen.panel.kind === "result"
        ? flow.signals
        : [];

  const decision = decide(flow.signals);

  return {
    brand: flow.brand,
    copy: flow.copy,
    screen,
    // A result screen's heading is chosen by the verdict, not by the frame. The
    // frame is drawn "You're verified"; storing that would leave the heading
    // congratulating an applicant whose chip says Declined.
    // (the result screen's verdict and its wording come from the server at run time: see LiveResult)
    title: screen.title,
    step,
    stepNumber: stepIndex + 1,
    stepCount: flow.steps.length,
    substepNumber: substepIndex + 1,
    substepCount: step.screens.length,
    steps: flow.steps.map((s) => ({
      id: s.id,
      title: s.title,
      caption: s.caption,
      optional: s.optional,
      partial: s.partial,
      screens: s.screens.map((x) => x.slug),
    })),
    signals,
    // The final screen derives from every signal, not just the ones on show.
    decision,
  };
}

/**
 * The opening screen's content — Figma Desktop-1.
 *
 * Separate from `getScreen()` because it is not one: no step, no position, no
 * Back. Splitting it means `/` fetches only what it draws rather than the whole
 * seven-step flow to render a heading and three cards.
 */
export async function getLanding(): Promise<FlowLanding & { brand: FlowBrand }> {
  const flow = await getVerifyFlow();
  return { ...flow.landing, brand: flow.brand };
}

/** Every screen slug, for `generateStaticParams` in the export build. */
export async function listScreenSlugs(): Promise<string[]> {
  const flow = await getVerifyFlow();
  return flow.steps.flatMap((step) => step.screens.map((s) => s.slug));
}

/** The first screen — where `/playground` and any "start over" link point. */
export async function firstScreenSlug(): Promise<string> {
  const flow = await getVerifyFlow();
  const slug = flow.steps[0]?.screens[0]?.slug;
  // A flow with no screens cannot be walked, and failing loudly here beats
  // handing every "start" link an href of `/verify/undefined`.
  if (!slug) throw new Error("the verify flow has no screens");
  return slug;
}

/**
 * True while the flow is showing invented values.
 *
 * Read this rather than testing for the demo dataset by identity: it gives the
 * UI one honest place to render a "Sample data" marker, which it must do before
 * these screens go in front of a real applicant — a fabricated outcome on a
 * verification surface is one somebody will act on. Flip it to `false` in the
 * same commit that makes these functions real.
 */
export const IS_DEMO_DATA = true;
