/**
 * The applicant flow's data contract.
 *
 * Same two rules as `lib/console/types.ts`, for the same reason:
 *
 *   1. NOTHING here imports React, and every type is plain JSON. Panel kinds,
 *      icons and outcomes are string unions, not components, so a whole flow
 *      can arrive from `fetch()` unchanged. If a field could not survive
 *      `JSON.parse(JSON.stringify(x))`, it does not belong in this file.
 *   2. Copy lives here too — headings, helper text, button labels, field
 *      placeholders. The views render what they are handed, so relabelling a
 *      screen or translating the flow never touches JSX.
 *
 * A third rule this file adds, because a verification flow is not a dashboard:
 *
 *   3. POSITION IS NEVER STORED. A screen does not carry "2 of 4" — the step
 *      owns an ordered `screens` array and the view counts. The Figma frames
 *      disagree with themselves about this (Capture Front is drawn both "2 of
 *      4" and "2 of 3"), and a stored counter is how that disagreement would
 *      have shipped. Same discipline as the console's derived workflow price.
 *
 * To wire this to a real backend, implement the functions in `./index.ts` and
 * return these shapes. No component changes. See the note in that file.
 */

/* ----------------------------------------------------------------------------
   Shared vocabulary
---------------------------------------------------------------------------- */

/**
 * How a single check came out. Deliberately three states, not two: a flow that
 * can only say pass/fail has to round "the address is a month stale" into one
 * of them, and either answer is a lie.
 */
export type Outcome = "pass" | "attention" | "fail";

/** Icon slots the flow knows how to draw. Add a case to the view's map too. */
export type FlowIcon =
  | "id-card"
  | "passport"
  | "licence"
  | "residence-permit"
  | "camera"
  | "selfie"
  | "nfc"
  | "phone"
  | "email"
  | "home"
  | "file"
  | "shield"
  | "clock"
  | "light"
  | "glare"
  | "crop";

/* ----------------------------------------------------------------------------
   Form controls

   The flow renders real inputs, never styled divs, keyboard-operable and
   announced before any handler exists, so wiring a screen means adding
   `onChange`, not rebuilding the control. The console's builder set this
   precedent; this file carries it across.
---------------------------------------------------------------------------- */

export interface Field {
  /** Also the input's `name`, so a native form submit already carries it. */
  key: string;
  label: string;
  /** Maps to the input's `type`/`inputmode`. `select` renders a <select>. */
  kind: "text" | "email" | "tel" | "date" | "select" | "country";
  /** Prefilled value — for a review screen, what the engine extracted. */
  value?: string;
  placeholder?: string;
  /** Shown under the field in the body grey. */
  hint?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Renders read-only with the extracted-value treatment. */
  readOnly?: boolean;
  /** Monospaced — MRZ lines, serials. */
  mono?: boolean;
  /** Fraction of the row this field takes. Two halves make one line. */
  span?: "full" | "half";
}

/* ----------------------------------------------------------------------------
   Signals, the one source the result screens are computed from
---------------------------------------------------------------------------- */

/**
 * One check the platform ran, and how it came out.
 *
 * This is the ONLY place an outcome is stated. The "Here's What We Found"
 * screen groups these; the final result screen derives its verdict, its risk
 * level and its reason codes from them via `decide()` in `./index.ts`. Nothing
 * stores a verdict, exactly as nothing stores a workflow price — if a screen
 * held its own copy, the summary and the detail would disagree the first time
 * a check changed.
 */
export interface Signal {
  id: string;
  /** The group heading this sits under: "Document", "Face", "Contact"… */
  group: string;
  label: string;
  outcome: Outcome;
  /** One line of plain language. No document numbers, no PII — see below. */
  detail: string;
}

export type Verdict = "Verified" | "Needs review" | "Declined";
export type RiskLevel = "Low" | "Medium" | "High";

/** What `decide()` returns. Every field is computed; none is stored. */
export interface Decision {
  verdict: Verdict;
  risk: RiskLevel;
  /** Non-passing signals, in the order they were run. */
  reasons: { label: string; detail: string; outcome: Outcome }[];
}

/* ----------------------------------------------------------------------------
   Panels

   A discriminated union on `kind`. One `switch` in the view maps each to a
   body; adding a screen type means a member here and a case there, and the
   shell, stepper, footer and routing all keep working untouched.
---------------------------------------------------------------------------- */

/**
 * Wording for a workflow that leaves out checks the full wording names: the first entry whose
 * checks the workflow all runs is used (see `wordingFor` in plan.ts).
 */
export type Leaner<T> = { needs: string[]; value: T }[];

export interface ChecklistItem {
  icon: FlowIcon;
  label: string;
  /** Secondary line. Omit for the frame's single-line tiles. */
  detail?: string;
  /** Shown only when the workflow runs one of these checks. Omit to always show. */
  needs?: string[];
}

export interface ConsentDoc {
  label: string;
  href: string;
}

export interface ChoiceOption {
  /** Unique within the screen; becomes the radio's value. */
  value: string;
  icon: FlowIcon;
  label: string;
  /** One line of plain language. The document-type frame draws single-line
   *  options with no description, so this is optional. */
  detail?: string;
  /** Region names the document is accepted for. Omit for "anywhere". */
  regions?: string[];
  /** Renders dimmed and non-selectable, with `reason` shown in place of hints. */
  disabled?: boolean;
  reason?: string;
}

/**
 * A capture step's two states.
 *
 * `empty` draws the framing guide and the shutter; `captured` draws the shot
 * with Retake / Use photo. The frames supply both, and they are one screen with
 * two states rather than two routes — the applicant does not navigate between
 * them, the camera does.
 */
export interface CapturePanel {
  kind: "capture";
  /** What the guide box is shaped like. Drives the aspect ratio, nothing else. */
  frame: "id-landscape" | "id-portrait" | "face";
  /** Instruction above the viewfinder. */
  guide: string;
  tips: { icon: FlowIcon; label: string }[];
  shutter: string;
  /** Copy for the state after a shot is taken. */
  captured: { heading: string; retake: string; accept: string };
  /**
   * Which state to draw. The flow has no camera yet, so this is data; when the
   * capture is real it becomes component state and this field goes away.
   */
  state: "empty" | "captured";
}

export type Panel =
  | { kind: "checklist"; items: ChecklistItem[]; note?: string }
  | { kind: "consent"; agreements: string[] }
  | {
      kind: "choice";
      name: string;
      options: ChoiceOption[];
      /** The country selector the frame draws above the options. */
      country?: { label: string; value: string; options: string[] };
    }
  | CapturePanel
  | {
      kind: "review";
      fields: Field[];
      note?: string;
      /** Extracted image crops (portrait, signature). A slot with an `image`
       *  shows that public sample under a SAMPLE ribbon; without one it stays a
       *  marked, empty slot. */
      crops?: { label: string; image?: string }[];
    }
  /** A large centred glyph — the frame's face-scan intro, no controls. */
  | {
      kind: "illustration";
      icon: FlowIcon;
      caption?: string;
    }
  | {
      kind: "handoff";
      /** The chip-read status shown under the QR ("Waiting for phone…"). */
      status: string;
      /** A real, scannable QR image (public path). Encodes the handoff link. */
      qr?: string;
      /**
       * The payload a real QR would encode — kept so the code can also be typed
       * by hand where a frame calls for it. Desktop-8 shows QR + status only, so
       * these are optional and not drawn there.
       */
      pairingCode?: string;
      caption?: string;
      /** Optional numbered how-to. The updated frame drops it for QR + status. */
      steps?: string[];
    }
  | {
      kind: "contact";
      field: Field;
      consent?: string;
      /** The frame's leading country-code selector (phone). */
      countryCode?: { value: string; options: string[] };
    }
  | {
      kind: "otp";
      length: number;
      /** Where the code went, as shown to the applicant. */
      sentTo: string;
      /**
       * How long the code is good for, e.g. "10 minutes".
       *
       * Stated, not counted down. A live timer needs the issuing time from the
       * session, and a countdown that starts when the page renders would lie to
       * anyone who reloaded. Say the window; count it when the backend supplies
       * an expiry instant.
       */
      expiresIn: string;
      resend: string;
    }
  | {
      kind: "upload";
      accept: string[];
      maxMb: number;
      /** Left column. The frame runs this at 315px against the 440px dropzone. */
      guidance: string;
      /** The lime 440×240 drop target. */
      dropzone: { label: string };
      /**
       * The frame offers typing an address as an alternative to uploading, so
       * an applicant with no document to hand is not simply stuck.
       */
      manual: { label: string; placeholder: string };
      /** The sample-document dialog. The flow's only client-side state. */
      samples: { trigger: string; title: string; close: string; specimen: Specimen };
    }
  | { kind: "address"; fields: Field[] }
  | {
      kind: "findings";
      intro: string;
      signalIds: string[];
      /**
       * The rich Desktop-21 report. When present it replaces the plain signal
       * list. Values are the frame's demo analytics — technical scores/metadata,
       * no PII.
       */
      report?: {
        scores: { label: string; value: string }[];
        riskLevel: string;
        decision: string;
        reasonCodes: string[];
        channels: {
          title: string;
          otp: { label: string; value: string }[];
          metrics: { label: string; value: string }[];
        }[];
        consistency: { title: string; pairs: { left: string; right: string }[] };
        velocity: { title: string; rows: { label: string; value: string }[] };
        explain: { decision: string; risk: string; summary: string; codes: string[] };
      };
    }
  | {
      kind: "result";
      /**
       * Copy for each verdict `decide()` can return — NOT one fixed message.
       *
       * The frame is drawn as "You're verified", and storing that as the
       * screen's title is how a screen ends up shouting "You're verified" over
       * a chip that says Needs review. The verdict picks the wording, the same
       * way it picks the colour, so the two cannot contradict each other.
       */
      outcomes: Record<Verdict, ResultCopy>;
      /**
       * The Trust Seal. The frame names it and makes it the focus of the
       * verified screen but ships no artwork, so the view draws the product's
       * own seal — a designed badge, not a fabricated document — from these
       * fields. `reference` is a specimen, never a real applicant identifier.
       */
      seal?: {
        title: string;
        detail?: string;
        issuer?: string;
        reference?: string;
        issued?: string;
      };
    };

export interface ResultCopy {
  /** Replaces the screen's own title — see `ScreenContext.title`. */
  title: string;
  heading: string;
  body: string;
  nextSteps: string[];
}

/**
 * A specimen document, drawn for the sample dialog.
 *
 * The frame fills this dialog with a scan of an unrelated third-party PDF that
 * had been dropped in as placeholder art. Reproducing that would show an
 * applicant a document with nothing to do with proof of address — so what is
 * drawn instead is a real specimen of the thing being asked for, built from
 * this data.
 *
 * NO REAL DOCUMENT AND NO REAL PERSON. Every value is a specimen token, the
 * page carries a watermark, and the issuer is fictional. The point of the
 * dialog is to show an applicant WHICH THREE THINGS must be visible on
 * whatever they upload — so those fields carry a `highlight`, and the renderer
 * numbers them and repeats them as a legend.
 */
export interface Specimen {
  /** Drawn diagonally across the page. */
  watermark: string;
  issuer: string;
  issuerMeta: string;
  title: string;
  /** Ordered rows of the document body. */
  fields: SpecimenField[];
  footnote: string;
}

export interface SpecimenField {
  label: string;
  /** An array renders as stacked lines — an address block. */
  value: string | string[];
  /** Present = this is one of the things we check. Becomes a numbered marker. */
  highlight?: string;
}

/* ----------------------------------------------------------------------------
   Screens and steps
---------------------------------------------------------------------------- */

export interface FlowScreen {
  /** Route segment. Unique across the whole flow — it is the URL. */
  slug: string;
  /** Small caps line above the heading. Omit to fall back to the step title. */
  eyebrow?: string;
  title: string;
  /** One or two sentences under the heading, full width. */
  intro?: string;
  /**
   * The left explainer column the updated frames add: a short paragraph and an
   * optional "learn more" link, set beside the screen's controls. Omit and the
   * panel runs full width (the pre-two-column screens still do).
   *
   * When `link.tip` is present the link opens that tip in a centred modal
   * (Desktop-70) rather than navigating — `href` is then optional. A link with
   * an `href` and no `tip` is a plain navigation (e.g. "Read full policy").
   */
  aside?: {
    body: string;
    /** The checks `body` speaks of; a workflow without all of them gets the first fitting `leaner`. */
    needs?: string[];
    leaner?: Leaner<string>;
    link?: { label: string; href?: string; tip?: TipContent };
    /**
     * A short "how your data is handled" note shown under the body, for the
     * biometric steps. Keep every point truthful to the published Privacy
     * Policy; links open in a new tab so the flow is not lost.
     */
    notice?: DataNotice;
  };
  panel: Panel;
  /** Slug of the previous screen. Omit to hide Back — the first screen. */
  back?: string;
  /**
   * The primary button.
   *
   * `to` is a slug WITHIN the flow. `to: null` means the flow is over — and
   * then `exit` says where the applicant goes next. An exit is a path out of
   * the flow entirely (the console, a customer's own site), which is why it is
   * a plain href rather than a slug: nothing else in the flow can link there.
   * Omit both and the button is disabled, which is right only while there is
   * genuinely nowhere to go. `close: true` is the end of the flow with nothing
   * after it: the button clears this device and asks the browser to close the tab.
   */
  next: { label: string; to: string | null; exit?: string; close?: boolean };
  /** An optional second action, e.g. "Skip this step". */
  skip?: { label: string; to: string };
}

/**
 * A "learn more" tip — Desktop-70. Opened from an aside link, shown in a centred
 * modal: a heading and a short body. `bullets` (the default) renders `body` as a
 * list; `paragraphs` renders each entry as its own paragraph.
 */
export interface TipContent {
  title: string;
  kind?: "bullets" | "paragraphs";
  body: string[];
  /** As `aside.needs` / `aside.leaner`, for the tip's body. */
  needs?: string[];
  leaner?: Leaner<string[]>;
}

export interface FlowStep {
  id: string;
  /** Shown in the stepper and, unless a screen overrides it, as the eyebrow. */
  title: string;
  /** The line under the title in the rail — "Capture and confirm your ID". */
  caption: string;
  /** Renders an "optional" badge beside the title, and nothing else. */
  optional?: boolean;
  /** Ordered. Position within it is what the view counts — never stored. */
  screens: FlowScreen[];
  /**
   * Set when the frames for a step are incomplete, so the stepper can say the
   * step is partly drawn instead of quietly showing a short one. Honest gap
   * marking, same intent as `IS_DEMO_DATA`.
   */
  partial?: string;
}

export interface FlowBrand {
  /** The tenant running this check, as shown to the applicant. */
  tenant: string;
  /** Precomputed, so the view never has to guess how to abbreviate a name. */
  tenantInitials: string;
  wordmark: string;
  saveAndExit: string;
  /** Footer line under the card. */
  legal: string;
}

export interface FlowCopy {
  back: string;
  /** Template with `{n}` and `{total}` — the frame's "Step 5/7". */
  stepCounter: string;
  /** Template with `{n}` and `{total}` — the rail's "2 of 5". */
  substep: string;
  optional: string;
  poweredBy: string;
}

/* ----------------------------------------------------------------------------
   The opening screen, Figma Desktop-1
---------------------------------------------------------------------------- */

/**
 * What an operator sees before they walk the flow themselves.
 *
 * Its own shape rather than another `FlowScreen`: it sits outside the seven
 * steps, has no stepper, no Back and no position, and forcing it into the union
 * would mean every panel type carrying fields only this screen uses.
 */
export interface FlowLanding {
  /** The lime pill above the heading. */
  badge: string;
  heading: string;
  body: string;
  cta: { label: string; to: string };
  /**
   * The way past the walkthrough.
   *
   * Walking your own flow is the RECOMMENDED first move, not a required one —
   * without this the only door out of the welcome screen is a 90-second flow,
   * which is a wall in front of somebody who just wants to see the console.
   */
  secondary?: { label: string; href: string };
  /** The three numbered cards. The first is drawn on the lime gradient. */
  cards: { index: string; label: string }[];
}

export interface VerifyFlow {
  brand: FlowBrand;
  copy: FlowCopy;
  landing: FlowLanding;
  steps: FlowStep[];
  /** Every check this flow ran. The result screens are computed from these. */
  signals: Signal[];
}

/** What one screen's page needs: the screen plus where it sits in the flow. */
export interface ScreenContext {
  brand: FlowBrand;
  copy: FlowCopy;
  screen: FlowScreen;
  /**
   * The heading to render. Normally `screen.title`, but a result screen's
   * heading is chosen by the verdict, so the view reads this and never the
   * screen's own field — a title that outranks the data is how a declined
   * applicant gets congratulated.
   */
  title: string;
  /** The step this screen belongs to. */
  step: FlowStep;
  /** 1-based, derived from the arrays — never read off the screen. */
  stepNumber: number;
  stepCount: number;
  substepNumber: number;
  substepCount: number;
  /** Every step, for the rail. Enough to draw it without the screens. */
  steps: { id: string; title: string; caption: string; optional?: boolean; partial?: string; screens: string[] }[];
  /** Resolved for the panels that need them; empty for every other screen. */
  signals: Signal[];
  decision: Decision;
}

/** The data-handling note a screen's explainer can carry (see `aside.notice`). */
export type DataNotice = { title: string; points: string[]; links: { label: string; href: string }[] };
