import type { Field } from "@/lib/verify/types";
import { CountrySelect } from "@/components/ui/country-select";
import { Select } from "@/components/ui/select";
import { COUNTRIES, findCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Real form controls, never styled divs.
 *
 * Same call the console's builder made, for the same reason and with more at
 * stake here: these are keyboard-operable, announced by a screen reader and
 * fillable by a password manager before a single handler exists. Wiring a
 * screen means adding `onChange`, not rebuilding the DOM. An applicant who
 * navigates by keyboard can already get through every screen in this flow.
 *
 * Nothing is submitted yet — there is no action and no state. What is here is
 * the control surface, complete and correct.
 */

const CONTROL =
  "h-11 w-full rounded-well border border-divider bg-white px-3.5 text-field text-pine " +
  "placeholder:text-pine/47 transition-colors focus:border-pine focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-pine/28 disabled:cursor-not-allowed " +
  "read-only:bg-tile read-only:text-pine/70";

export function FlowField({ field }: { field: Field }) {
  const id = `field-${field.key}`;
  const describedBy = field.hint ? `${id}-hint` : undefined;
  const isCountry = field.kind === "country";
  const isSelect = field.kind === "select";

  return (
    <div className={cn("flex flex-col gap-1.5", field.span === "half" ? "sm:col-span-1" : "sm:col-span-2")}>
      <label htmlFor={id} className="text-field font-medium text-pine/82">
        {field.label}
        {field.required ? (
          <>
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>

      {isCountry ? (
        <CountrySelect
          id={id}
          countries={COUNTRIES}
          name={field.key}
          label={field.label}
          defaultCode={findCountry(field.value)?.code}
          className={cn(CONTROL, "pr-9")}
        />
      ) : isSelect ? (
        // The platform dropdown, not a native <select> — so Confirm Details'
        // Document Type matches every other picker in the flow and the console.
        <Select
          block
          id={id}
          name={field.key}
          label={field.label}
          disabled={field.readOnly}
          defaultValue={field.value}
          options={(field.options ?? []).map((o) => o.label)}
          className={cn(CONTROL, "py-0 pr-9 font-normal")}
        />
      ) : field.mono ? (
        // MRZ and the like: monospaced, read-only, and wrapping rather than a
        // one-line input that scrolls its own value out of sight.
        <div
          id={id}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            "h-auto min-h-11 py-2.5 font-mono text-[12.5px] leading-5 tracking-tight break-all read-only:bg-tile",
            "bg-tile text-pine/80",
          )}
        >
          {field.value}
        </div>
      ) : (
        <input
          id={id}
          name={field.key}
          type={field.kind}
          // `tel` and `email` get the right on-screen keyboard on a phone —
          // the difference between a two-tap entry and a hunt through symbols.
          inputMode={field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : undefined}
          autoComplete={AUTOCOMPLETE[field.key] ?? "off"}
          defaultValue={field.value}
          placeholder={field.placeholder}
          required={field.required}
          readOnly={field.readOnly}
          aria-describedby={describedBy}
          className={CONTROL}
        />
      )}

      {field.hint ? (
        <p id={describedBy} className="m-0 text-eyebrow leading-4 text-quiet">
          {field.hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Autofill hints, by field key.
 *
 * Worth the table: an applicant filling this on a phone gets their own address
 * back from the browser instead of typing it, which is both faster and less
 * error-prone than anything we could validate afterwards. Keys not listed fall
 * back to `off` — a document number must never be offered from an autofill
 * store, and nothing here should be saved into one.
 */
const AUTOCOMPLETE: Record<string, string> = {
  givenNames: "given-name",
  surname: "family-name",
  dateOfBirth: "bday",
  phone: "tel",
  email: "email",
  line1: "address-line1",
  line2: "address-line2",
  city: "address-level2",
  postcode: "postal-code",
  country: "country",
};

/** A grid of fields. Two `half` fields share a line; `full` spans both. */
export function FieldGrid({ fields }: { fields: Field[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <FlowField key={field.key} field={field} />
      ))}
    </div>
  );
}
