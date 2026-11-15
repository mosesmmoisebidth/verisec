import { QrCode, RefreshCw, Smartphone, Upload } from "lucide-react";

import { FieldGrid } from "@/components/verify/fields";
import { LiveResult } from "@/components/verify/live-result";
import { PlanList } from "@/components/verify/plan-flow";
import { TenantText } from "@/components/verify/tenant";
import {
  FlowGlyph,
  GlyphTile,
  OutcomeMark,
  SolarCameraAddLinear,
  SolarCameraLinear,
  outcomeInk,
  outcomeLabel,
} from "@/components/verify/icons";
import { Select } from "@/components/ui/select";
import { CountrySelect } from "@/components/ui/country-select";
import { COUNTRIES, findCountry } from "@/lib/countries";
import { SampleDialog } from "@/components/verify/sample-dialog";
import type {
  CapturePanel,
  Decision,
  Panel,
  ScreenContext,
  Signal,
  Verdict,
} from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * One `switch` over the panel union, and a body for each member.
 *
 * Adding a screen type is a member in `types.ts` and a case here — the shell,
 * the stepper, the footer and the routing all keep working untouched. Every
 * string on screen arrives in the panel; no component below holds copy of its
 * own.
 */
export function FlowPanel({ ctx }: { ctx: ScreenContext }) {
  const panel: Panel = ctx.screen.panel;

  switch (panel.kind) {
    case "checklist":
      return <ChecklistPanel panel={panel} />;
    case "consent":
      return <ConsentPanel panel={panel} />;
    case "choice":
      return <ChoicePanel panel={panel} />;
    case "capture":
      return <CapturePanelView panel={panel} />;
    case "review":
      return <ReviewPanel panel={panel} />;
    case "illustration":
      return <IllustrationPanel panel={panel} />;
    case "handoff":
      return <HandoffPanel panel={panel} />;
    case "contact":
      return <ContactPanel panel={panel} />;
    case "otp":
      return <OtpPanel panel={panel} />;
    case "upload":
      return <UploadPanel panel={panel} />;
    case "address":
      return <AddressPanel panel={panel} />;
    case "findings":
      return <FindingsPanel panel={panel} signals={ctx.signals} />;
    case "result":
      // the real decision from the server, never the sample one the static page was built with
      return <LiveResult panel={panel} />;
  }
}

/* ----------------------------------------------------------------------------
   Get started · Face intro
---------------------------------------------------------------------------- */

function ChecklistPanel({ panel }: { panel: Extract<Panel, { kind: "checklist" }> }) {
  return (
    <div className="flex flex-col gap-4">
      {/* lines about a check this workflow skips (the chip step, a selfie) are left out */}
      <PlanList
        className="m-0 flex list-none flex-col gap-3 p-0"
        entries={panel.items.map((item) => ({
          key: item.label,
          needs: item.needs,
          node: (
            <li className="flex items-center gap-3.5 rounded-tile border border-card-line bg-tile p-4">
              <GlyphTile icon={item.icon} tone="brand" />
              <span className="flex flex-col gap-0.5">
                <span className="text-field font-medium text-pine">{item.label}</span>
                {item.detail ? <span className="text-read text-quiet">{item.detail}</span> : null}
              </span>
            </li>
          ),
        }))}
      />
      {panel.note ? <Note>{panel.note}</Note> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Terms & privacy
---------------------------------------------------------------------------- */

function ConsentPanel({ panel }: { panel: Extract<Panel, { kind: "consent" }> }) {
  return (
    // Desktop-3 lays the statements in the right column, each a compact pill.
    <div className="ml-auto flex w-full max-w-[430px] flex-col gap-2.5">
      {/* One checkbox per consent statement, each unchecked. Consent that
          arrives pre-ticked is not consent, a flow that ships it that way
          fails the audit it exists to pass, so these stay unchecked no matter
          how they are wired later. */}
      {panel.agreements.map((agreement) => (
        <label
          key={agreement}
          className="group flex cursor-pointer items-center gap-3 rounded-well border border-divider bg-white px-3.5 py-3 transition-colors hover:border-pine/28 has-checked:border-pine/35"
        >
          {/* The frame's selection control is a filled dot, not a ticked box:
              `appearance-none rounded-full` drops the OS tick and `:checked`
              fills the circle lime. Still a real checkbox, each statement is an
              independent yes, and it toggles natively in the static export. */}
          <DotInput type="checkbox" name="consent" required />
          <span className="text-read text-pine/82">{agreement}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * The flow's circular selection control — the lime "dot" the consent and
 * document-choice frames draw. Empty pine ring when off; a solid lime circle
 * when on. Shared so a consent checkbox and a document radio read identically.
 */
function DotInput({
  type,
  name,
  value,
  required,
  disabled,
}: {
  type: "checkbox" | "radio";
  name: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      name={name}
      value={value}
      required={required}
      disabled={disabled}
      className="size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-pine/25 bg-white transition-colors checked:border-lime checked:bg-lime disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/55"
    />
  );
}

/* ----------------------------------------------------------------------------
   Choose your document
---------------------------------------------------------------------------- */

function ChoicePanel({ panel }: { panel: Extract<Panel, { kind: "choice" }> }) {
  return (
    // Desktop-4: country selector, then the types two-up — in the right column.
    <div className="ml-auto flex w-full max-w-[440px] flex-col gap-4">
      {panel.country ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-field font-medium text-pine/82">{panel.country.label}</span>
          <CountrySelect
            countries={COUNTRIES}
            name="country"
            label={panel.country.label}
            defaultCode={findCountry(panel.country.value)?.code}
            className="h-11 w-full rounded-well border border-divider bg-white pr-9 pl-3.5 text-field text-pine"
          />
        </label>
      ) : null}

      {/* Two-up, single line — the same lime dot as the consent screen, and no
          document glyph: the frame lists the types by name alone. */}
      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Document type</legend>
        {panel.options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "group flex items-center gap-3 rounded-well border p-3.5 transition-colors",
              option.disabled
                ? "cursor-not-allowed border-divider bg-tile opacity-60"
                : "cursor-pointer border-divider bg-white hover:border-pine/28 has-checked:border-pine/35",
            )}
          >
            <DotInput type="radio" name={panel.name} value={option.value} disabled={option.disabled} />
            <span className="min-w-0 truncate text-field font-medium text-pine">{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Capture, document front / back / selfie
---------------------------------------------------------------------------- */

/**
 * The viewfinder, in whichever of its two states the data asks for.
 *
 * There is no camera behind this yet and no photograph in the frame, so the
 * captured state draws a neutral placeholder rather than a rendering of an ID
 * document or a face. Both would be worse than an empty box: a realistic fake
 * document is a forgery template, and a stock face attached to an invented
 * applicant is a person who never consented to being one.
 */
function CapturePanelView({ panel }: { panel: CapturePanel }) {
  const shot = panel.state === "captured";
  const isFace = panel.frame === "face";

  return (
    // The frame and its Capture button share one column that hugs the frame's
    // width, so the button sits under the frame's right edge (Desktop-5) — or
    // centred under the oval on the selfie screen.
    <div
      className={cn(
        "flex w-full flex-col gap-4",
        isFace ? "mx-auto max-w-[360px] items-center" : "ml-auto max-w-[440px]",
      )}
    >
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden border-2 border-dashed border-lime bg-lime/12",
          isFace ? "aspect-[3/4] rounded-[180px]" : "aspect-[440/240] rounded-tile",
        )}
      >
        {shot ? (
          // The applicant's captured frame, filled with a public sample so it
          // reads like Desktop-77 rather than an empty oval — clean here (the
          // operator-facing console records carry the SAMPLE ribbon instead).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={isFace ? "/samples/selfie-sample.jpg" : "/samples/id-sample.png"}
            alt={isFace ? "Sample selfie" : "Sample document"}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <SolarCameraLinear className="size-[70px] text-pine" />
            <p className="m-0 max-w-[32ch] text-field text-pine">{panel.guide}</p>
          </div>
        )}
      </div>

      {shot ? (
        <div
          className={cn(
            "flex flex-col gap-3",
            isFace ? "items-center" : "items-end",
          )}
        >
          <p className="m-0 text-field font-medium text-pine">{panel.captured.heading}</p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
            >
              <RefreshCw aria-hidden className="size-4" strokeWidth={1.8} />
              {panel.captured.retake}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-pill bg-lime px-6 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95"
            >
              {panel.captured.accept}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95",
            isFace ? "self-center" : "self-end",
          )}
        >
          <SolarCameraAddLinear className="size-5" />
          {panel.shutter}
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Review · Address
---------------------------------------------------------------------------- */

function ReviewPanel({ panel }: { panel: Extract<Panel, { kind: "review" }> }) {
  return (
    <div className="flex flex-col gap-4">
      {panel.crops && panel.crops.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {panel.crops.map((crop) => (
            <div key={crop.label} className="flex flex-col gap-1.5">
              <span className="text-field font-medium text-pine/82">{crop.label}</span>
              {/* A public sample fills the slot when supplied (under a SAMPLE
                  ribbon); otherwise a marked, empty slot the engine fills at run
                  time, never an invented portrait of a real person. */}
              <div className="relative grid h-[116px] place-items-center overflow-hidden rounded-tile border border-dashed border-pine/28 bg-lime/12 px-3 text-center text-eyebrow text-pine/47">
                {crop.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={crop.image}
                      alt={crop.label}
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 rounded-pill bg-pine/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.5px] text-lime uppercase">
                      Sample
                    </span>
                  </>
                ) : (
                  "Extracted at run time"
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <FieldGrid fields={panel.fields} />
      {panel.note ? <Note>{panel.note}</Note> : null}
    </div>
  );
}

function AddressPanel({ panel }: { panel: Extract<Panel, { kind: "address" }> }) {
  return <FieldGrid fields={panel.fields} />;
}

/* ----------------------------------------------------------------------------
   ePassport handoff
---------------------------------------------------------------------------- */

/**
 * The phone handoff — Figma Desktop-8.
 *
 * A single soft card: a REAL, scannable QR (the design's own pine + lime-badge
 * render in `public/qr/`) centred near the top, with "Waiting for phone…" and a
 * phone glyph beneath it. The frame drops the pairing-code box and the numbered
 * how-to entirely — the left explainer column (the shell's `aside`) carries the
 * "What is an ePassport chip?" copy, so nothing here competes with it.
 */
function HandoffPanel({ panel }: { panel: Extract<Panel, { kind: "handoff" }> }) {
  return (
    <div className="flex w-full justify-center lg:justify-end">
      <div className="flex w-full max-w-[384px] flex-col items-center gap-6 rounded-[20px] border border-card-line bg-tile px-6 py-8">
        <div className="grid size-[226px] shrink-0 place-items-center overflow-hidden">
          {panel.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={panel.qr}
              alt="QR code, scan with your phone to continue the ePassport read"
              className="size-full object-contain"
              width={226}
              height={226}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <QrCode aria-hidden className="size-8 text-pine/47" strokeWidth={1.4} />
              <p className="m-0 text-eyebrow leading-4 text-pine/70">
                QR renders once the session issues a handoff link
              </p>
            </div>
          )}
        </div>

        <p
          className="m-0 flex items-center gap-2 text-body text-quiet"
          role="status"
          aria-live="polite"
        >
          <Smartphone aria-hidden className="size-[18px] text-quiet" strokeWidth={1.7} />
          {panel.status}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Contact · one-time code
---------------------------------------------------------------------------- */

function ContactPanel({ panel }: { panel: Extract<Panel, { kind: "contact" }> }) {
  return (
    <div className="flex max-w-[460px] flex-col gap-4">
      {panel.countryCode ? (
        // Phone: a leading country-code selector next to the number, per frame.
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`field-${panel.field.key}`} className="text-field font-medium text-pine/82">
            {panel.field.label}
          </label>
          <div className="flex gap-2">
            <Select
              name="countryCode"
              label="Country code"
              options={panel.countryCode.options}
              defaultValue={panel.countryCode.value}
              className="h-11 shrink-0 rounded-well border border-divider bg-white pr-8 pl-3.5 text-field text-pine"
            />
            <input
              id={`field-${panel.field.key}`}
              name={panel.field.key}
              type="tel"
              placeholder={panel.field.placeholder}
              className="h-11 min-w-0 flex-1 rounded-well border border-divider bg-white px-3.5 text-field text-pine outline-none transition-colors placeholder:text-pine/47 focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/28"
            />
          </div>
          {panel.field.hint ? <span className="text-read text-quiet">{panel.field.hint}</span> : null}
        </div>
      ) : (
        <FieldGrid fields={[panel.field]} />
      )}
      {panel.consent ? <Note>{panel.consent}</Note> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Illustration, a large centred glyph (face-scan intro)
---------------------------------------------------------------------------- */

function IllustrationPanel({ panel }: { panel: Extract<Panel, { kind: "illustration" }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <span className="grid size-[220px] place-items-center rounded-full bg-lime/12 text-pine">
        <FlowGlyph icon={panel.icon} className="size-24" strokeWidth={1.2} />
      </span>
      {panel.caption ? <p className="m-0 text-read text-quiet">{panel.caption}</p> : null}
    </div>
  );
}

/**
 * The one-time-code screen — Figma Desktop-13 / Desktop-20.
 *
 * Two columns: where the code went and how to get another on the left, the
 * boxes on the right. The frame draws them at 405px across, six 52px boxes with
 * a 12px radius on `#fbfbfb`.
 *
 * Each box is a real input with its own label, so a screen reader announces
 * "digit 3 of 6" instead of six anonymous fields, and
 * `autocomplete="one-time-code"` on the first lets iOS and Android offer the
 * code straight from the SMS — the single biggest drop-off point in a flow
 * like this.
 */
function OtpPanel({ panel }: { panel: Extract<Panel, { kind: "otp" }> }) {
  const digits = Array.from({ length: panel.length }, (_, i) => i);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
      <div className="flex max-w-[330px] flex-col gap-3">
        <p className="m-0 text-read text-quiet">
          We sent a code to <span className="font-medium text-pine">{panel.sentTo}</span>. It
          expires in {panel.expiresIn}.
        </p>
        <button
          type="button"
          className="self-start text-body text-pine underline underline-offset-4 transition-colors hover:text-pine/70"
        >
          {panel.resend}
        </button>
      </div>

      {/* One row that shrinks, never a row that wraps. Six boxes wrapping to
          4 + 2 on a 375px screen reads as a four-digit code followed by a
          two-digit one, and a phone is where most of these are typed. The
          column count comes from `panel.length`, so a 4- or 8-digit code fits
          without touching this file. */}
      <div
        className="grid w-full max-w-otp shrink-0 gap-2.5"
        style={{ gridTemplateColumns: `repeat(${panel.length}, minmax(0, 1fr))` }}
      >
        {digits.map((i) => (
          <div key={i} className="vs-in" style={{ "--vs-d": `${300 + i * 45}ms` } as React.CSSProperties}>
            <label htmlFor={`otp-${i}`} className="sr-only">
              Digit {i + 1} of {panel.length}
            </label>
            <input
              id={`otp-${i}`}
              name={`otp-${i}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1} of ${panel.length}`}
              className="tnum aspect-square h-[52px] w-full rounded-box border border-divider bg-tile text-center text-[22px] text-pine transition-[border-color,background-color,box-shadow] focus:border-pine focus:bg-white focus-visible:ring-4 focus-visible:ring-lime/50 focus-visible:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Proof of address upload
---------------------------------------------------------------------------- */

/**
 * Proof of address — Figma Desktop-36.
 *
 * Two columns like the OTP screen: what we accept and the samples link on the
 * left, the 440px drop target and the type-it-instead field on the right.
 *
 * The frame offers typing an address as an alternative to uploading. That is
 * not a nicety — an applicant who has no document to hand would otherwise be
 * stuck on an optional step with no way past it except Skip, which silently
 * costs them the check.
 */
function UploadPanel({ panel }: { panel: Extract<Panel, { kind: "upload" }> }) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
      <div className="flex max-w-[330px] flex-col gap-3">
        <p className="m-0 text-read text-quiet">{panel.guidance}</p>
        <SampleDialog
          trigger={panel.samples.trigger}
          title={panel.samples.title}
          close={panel.samples.close}
          specimen={panel.samples.specimen}
        />
      </div>

      <div className="flex w-full max-w-[440px] shrink-0 flex-col gap-4">
        {/* A real <input type="file"> behind a styled label, not a div with a
            click handler: drag-and-drop, the file picker, keyboard focus and
            screen-reader announcement all come free and correct. */}
        <label className="flex aspect-[440/240] cursor-pointer flex-col items-center justify-center gap-2 rounded-box border border-lime bg-lime/12 p-3 text-center transition-colors hover:bg-lime/20 has-focus-visible:ring-4 has-focus-visible:ring-lime/50">
          <Upload aria-hidden className="size-[70px] text-pine" strokeWidth={1.25} />
          <span className="text-[21px] leading-[30px] text-pine/90">{panel.dropzone.label}</span>
          <span className="text-eyebrow text-quiet">
            {panel.accept.join(" · ")}, up to {panel.maxMb}MB
          </span>
          <input
            type="file"
            name="proofOfAddress"
            accept={panel.accept.map((ext) => `.${ext.toLowerCase()}`).join(",")}
            className="sr-only"
          />
        </label>

        <div>
          <label htmlFor="address-manual" className="sr-only">
            {panel.manual.label}
          </label>
          <input
            id="address-manual"
            name="addressManual"
            type="text"
            autoComplete="street-address"
            placeholder={panel.manual.placeholder}
            className="h-[46px] w-full rounded-box border border-divider bg-tile px-3 text-body text-pine/90 placeholder:text-pine/90 transition-colors focus:border-pine focus:bg-white focus-visible:ring-4 focus-visible:ring-lime/50 focus-visible:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Findings · result
---------------------------------------------------------------------------- */

/** Groups the signals in the order they first appear — no sorting, no lookup. */
function groupSignals(signals: Signal[]) {
  const groups: { name: string; signals: Signal[] }[] = [];
  for (const signal of signals) {
    const existing = groups.find((g) => g.name === signal.group);
    if (existing) existing.signals.push(signal);
    else groups.push({ name: signal.group, signals: [signal] });
  }
  return groups;
}

function FindingsPanel({
  panel,
  signals,
}: {
  panel: Extract<Panel, { kind: "findings" }>;
  signals: Signal[];
}) {
  const r = panel.report;
  if (!r) {
    return (
      <div className="flex flex-col gap-5">
        <p className="m-0 text-read text-quiet">{panel.intro}</p>
        <SignalGroups signals={signals} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Score cards + risk / decision */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {r.scores.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-tile border border-card-line bg-tile p-3">
            <span className="text-eyebrow text-quiet">{s.label}</span>
            <span className="tnum text-[19px] leading-6 font-medium text-pine">{s.value}</span>
          </div>
        ))}
        <FindingStat label="Risk level" value={r.riskLevel} />
        <FindingStat label="Decision" value={r.decision} />
      </div>

      {/* Reason-code chips */}
      <div className="flex flex-wrap gap-2">
        {r.reasonCodes.map((code) => (
          <span
            key={code}
            className="tnum rounded-pill bg-pass-tint px-2.5 py-1 text-[11px] font-medium tracking-[0.3px] text-ramp-2"
          >
            {code}
          </span>
        ))}
      </div>

      {/* Per-channel intelligence */}
      <div className="grid gap-3 sm:grid-cols-2">
        {r.channels.map((ch) => (
          <div key={ch.title} className="flex flex-col gap-3 rounded-tile border border-card-line bg-tile p-4">
            <h3 className="m-0 text-body font-medium text-pine">{ch.title}</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {ch.otp.map((o) => (
                <span key={o.label} className="flex flex-col gap-0.5">
                  <span className="text-eyebrow text-quiet">{o.label}</span>
                  <span className="text-read font-medium text-pine">{o.value}</span>
                </span>
              ))}
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-divider p-0 pt-2.5">
              {ch.metrics.map((m) => (
                <li key={m.label} className="flex items-center justify-between gap-3">
                  <span className="text-read text-quiet">{m.label}</span>
                  <span className="text-read font-medium text-pine">{m.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Cross-channel consistency */}
      <section className="flex flex-col gap-2.5 rounded-tile border border-card-line bg-tile p-4">
        <h3 className="m-0 text-body font-medium text-pine">{r.consistency.title}</h3>
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {r.consistency.pairs.map((p) => (
            <li key={`${p.left}-${p.right}`} className="flex items-center gap-2 text-read">
              <OutcomeMark outcome="pass" />
              <span className="text-pine">{p.left}</span>
              <span aria-hidden className="text-pine/40">
                ↔
              </span>
              <span className="text-pine">{p.right}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Velocity & duplicates */}
      <section className="flex flex-col gap-2.5 rounded-tile border border-card-line bg-tile p-4">
        <h3 className="m-0 text-body font-medium text-pine">{r.velocity.title}</h3>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {r.velocity.rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <span className="text-read text-quiet">{row.label}</span>
              <span className="tnum text-read font-medium text-pine">{row.value}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Explainable decision */}
      <section className="flex flex-col gap-3 rounded-tile border border-card-line bg-pass-tint/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-body font-medium text-pine">Explainable decision</h3>
          <span className="rounded-pill bg-pass-tint px-2 py-0.5 text-eyebrow font-medium text-ramp-2">
            {r.explain.decision}
          </span>
          <span className="rounded-pill bg-pass-tint px-2 py-0.5 text-eyebrow font-medium text-ramp-2">
            {r.explain.risk}
          </span>
        </div>
        <p className="m-0 text-read text-pine/82">{r.explain.summary}</p>
        <div className="flex flex-wrap gap-2">
          {r.explain.codes.map((code) => (
            <span
              key={code}
              className="rounded-pill bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.3px] text-pine/70"
            >
              {code}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

/** A labelled stat box — the findings report's Risk level / Decision cells. */
function FindingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tile border border-card-line bg-pass-tint/50 p-3">
      <span className="text-eyebrow text-quiet">{label}</span>
      <span className="text-body font-semibold text-ramp-2">{value}</span>
    </div>
  );
}

function SignalGroups({ signals }: { signals: Signal[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groupSignals(signals).map((group) => (
        <section key={group.name} className="flex flex-col gap-2">
          <h2 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">
            {group.name}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.signals.map((signal) => (
              <li
                key={signal.id}
                className="flex items-start gap-3 rounded-tile border border-card-line bg-tile p-3.5"
              >
                <span className="mt-0.5">
                  <OutcomeMark outcome={signal.outcome} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-body font-medium text-pine">{signal.label}</span>
                    <span className={cn("text-eyebrow", outcomeInk(signal.outcome))}>
                      {outcomeLabel(signal.outcome)}
                    </span>
                  </span>
                  <span className="text-read text-quiet">{signal.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Colour, tint and glyph per verdict — the console's chip vocabulary, so a
 * "Needs review" means the same thing to an operator and to an applicant.
 */
const VERDICT_STYLE: Record<Verdict, { bg: string; ink: string; glyph: string }> = {
  Verified: { bg: "bg-pass-tint", ink: "text-ramp-2", glyph: "✓" },
  "Needs review": { bg: "bg-caution-tint", ink: "text-caution", glyph: "!" },
  Declined: { bg: "bg-danger-tint", ink: "text-danger", glyph: "✕" },
};

/**
 * The final screen.
 *
 * Every word of the verdict, the risk level and the reason codes comes from
 * `decide()`. Nothing here is stored and nothing here is styled by hand — flip
 * one signal in the demo data and this screen changes from "You're verified" to
 * "Needs review" at Medium risk with a reason code, with no edit to this file.
 */
function ResultPanel({
  panel,
  decision,
  signals,
}: {
  panel: Extract<Panel, { kind: "result" }>;
  decision: Decision;
  signals: Signal[];
}) {
  const style = VERDICT_STYLE[decision.verdict];
  // The verdict picks the wording as well as the colour, so the screen cannot
  // congratulate someone it just declined.
  const copy = panel.outcomes[decision.verdict];

  return (
    <div className="flex flex-col gap-6">
      <div className={cn("flex flex-col gap-4 rounded-tile p-6", style.bg)}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-pill text-[20px] font-bold text-white",
              decision.verdict === "Verified"
                ? "bg-ramp-3"
                : decision.verdict === "Needs review"
                  ? "bg-caution"
                  : "bg-danger",
            )}
          >
            {style.glyph}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={cn("text-[22px] leading-7 font-medium", style.ink)}>
              {decision.verdict}
            </span>
            <span className="text-eyebrow text-quiet">Risk level: {decision.risk}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="m-0 text-field font-medium text-pine">{copy.heading}</p>
          <p className="m-0 text-read text-quiet">
            <TenantText text={copy.body} />
          </p>
        </div>

        {decision.reasons.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-well bg-white/70 p-4">
            <h2 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">
              Why
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {decision.reasons.map((reason) => (
                <li key={reason.label} className="flex items-start gap-2.5">
                  <span className="mt-0.5">
                    <OutcomeMark outcome={reason.outcome} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-body font-medium text-pine">{reason.label}</span>
                    <span className="text-read text-quiet">{reason.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <SignalGroups signals={signals} />

      {panel.seal && decision.verdict === "Verified" ? (
        <TrustSeal seal={panel.seal} />
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">
          What happens next
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {copy.nextSteps.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-read text-quiet">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-pine/28" />
              <span>
                <TenantText text={line} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The Trust Seal — the focus of the verified frame.
 *
 * The frame reserves the space and names the seal but ships no artwork, so this
 * draws the product's own mark: a designed badge, not a fabricated document or
 * certificate. The reference is a specimen carried in the data, never a real
 * applicant identifier, so nothing here is PII. This is what the frame's right
 * column is: the thing an applicant keeps when a check passes.
 */
function TrustSeal({ seal }: { seal: Extract<Panel, { kind: "result" }>["seal"] }) {
  if (!seal) return null;

  return (
    <div className="relative overflow-hidden rounded-tile border border-pine/12 bg-pine p-6 text-lime">
      {/* Concentric guilloché rings, the way a seal or a banknote is drawn —
          pure CSS, no asset. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.14]">
        <div className="absolute top-1/2 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
        <div className="absolute top-1/2 left-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
        <div className="absolute top-1/2 left-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
      </div>

      <div className="relative flex flex-col items-center gap-4 text-center">
        <span className="grid size-16 place-items-center rounded-pill bg-lime text-pine ring-8 ring-lime/15">
          <FlowGlyph icon="shield" />
        </span>

        <div className="flex flex-col items-center gap-1">
          <span className="text-eyebrow font-medium tracking-[2px] text-lime/70 uppercase">
            {seal.detail ?? "Trust Seal"}
          </span>
          <span className="text-[22px] leading-7 font-semibold text-white">{seal.title}</span>
          {seal.issuer ? (
            <span className="text-body text-lime/75">Issued by {seal.issuer}</span>
          ) : null}
        </div>

        {seal.reference || seal.issued ? (
          <dl className="m-0 flex flex-wrap items-stretch justify-center gap-2 pt-1">
            {seal.reference ? (
              <div className="flex flex-col gap-0.5 rounded-well bg-white/10 px-4 py-2 text-left">
                <dt className="text-[10px] tracking-[0.4px] text-lime/60 uppercase">Reference</dt>
                <dd className="m-0 font-mono text-body text-white">{seal.reference}</dd>
              </div>
            ) : null}
            {seal.issued ? (
              <div className="flex flex-col gap-0.5 rounded-well bg-white/10 px-4 py-2 text-left">
                <dt className="text-[10px] tracking-[0.4px] text-lime/60 uppercase">Issued</dt>
                <dd className="m-0 font-mono text-body text-white">{seal.issued}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Shared
---------------------------------------------------------------------------- */

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-well bg-pine/5 px-4 py-3 text-read text-quiet">{children}</p>
  );
}
