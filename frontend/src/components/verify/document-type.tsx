"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import { usePlan } from "@/lib/verify/plan";
import { CountrySelect } from "@/components/ui/country-select";
import { COUNTRIES, findCountry } from "@/lib/countries";
import type { Panel, ScreenContext } from "@/lib/verify/types";
import { readFlow, writeFlow } from "@/lib/verify/flow-store";
import { cn } from "@/lib/utils";

/**
 * Choose Your Document — persists the chosen type so the capture step knows
 * whether to ask for one image (passport) or two (a card's front and back).
 * Continue is gated until a type is picked.
 */
export function DocumentTypeClient({ ctx }: { ctx: ScreenContext }) {
  const router = useRouter();
  const panel = ctx.screen.panel as Extract<Panel, { kind: "choice" }>;
  // First render uses only the config defaults, identical on server and client.
  // The previous visit's choices live in sessionStorage, which the server cannot
  // see, so they are restored after mount (reading them during render made the
  // hydrating HTML differ from the server's and threw React #418).
  const [selected, setSelected] = useState<string | null>(null);
  const [country, setCountry] = useState<string>(findCountry(panel.country?.value)?.code ?? "");
  // The picker is uncontrolled (reads its default once), so bump this once when a
  // saved country is restored to remount it showing that country.
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    const saved = readFlow();
    if (saved.docType) setSelected(saved.docType);
    const code = findCountry(saved.country)?.code;
    if (code) {
      setCountry(code);
      setRestored(1);
    }
  }, []);
  const next = ctx.screen.next?.to;
  // only the document types this verification's workflow accepts
  const plan = usePlan();

  const nav = {
    onNext: () => {
      if (selected) {
        writeFlow({ docType: selected, country: country || panel.country?.value });
        if (next) router.push(`/verify/${next}`);
      }
    },
    nextDisabled: !selected,
  };

  return (
    <FlowShell ctx={ctx} nav={nav}>
      <div className="ml-auto flex w-full max-w-[440px] flex-col gap-4">
        {panel.country ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-field font-medium text-pine/82">{panel.country.label}</span>
            <CountrySelect
              key={restored}
              countries={COUNTRIES}
              name="country"
              label={panel.country.label}
              defaultCode={country || findCountry(panel.country.value)?.code}
              onChange={setCountry}
              className="h-11 w-full rounded-well border border-divider bg-white pr-9 pl-3.5 text-field text-pine"
            />
          </label>
        ) : null}

        <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
          <legend className="sr-only">Document type</legend>
          {panel.options.filter((o) => !plan?.documentTypes || plan.documentTypes.includes(o.value)).map((option) => {
            const active = selected === option.value;
            return (
              <button
                type="button"
                key={option.value}
                disabled={option.disabled}
                onClick={() => setSelected(option.value)}
                className={cn(
                  "group flex items-center gap-3 rounded-well border p-3.5 text-left transition-colors",
                  option.disabled
                    ? "cursor-not-allowed border-divider bg-tile opacity-60"
                    : active
                      ? "border-pine/45 bg-lime/10"
                      : "cursor-pointer border-divider bg-white hover:border-pine/28",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                    active ? "border-lime bg-lime text-pine" : "border-pine/25 bg-white",
                  )}
                >
                  {active ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 truncate text-field font-medium text-pine">{option.label}</span>
              </button>
            );
          })}
        </fieldset>

        {!selected ? (
          <p className="m-0 text-eyebrow text-pine/60" role="status" aria-live="polite">
            Choose a document type to continue.
          </p>
        ) : null}
      </div>
    </FlowShell>
  );
}
