import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown, FileWarning, Hourglass, Puzzle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AccordionItem as AccordionItemData } from "@/config/home";

/**
 * Card-style accordions from the Figma file. Each item is a rounded card
 * whose entire surface changes when open:
 *  - `trust` tone: grey card -> solid pine with white copy
 *  - `faq` tone:   off-white card -> lime-to-white gradient
 */

const trustIcons = [FileWarning, Hourglass, Puzzle];

export function TrustAccordion({
  items,
  defaultOpen,
  value,
  onValueChange,
}: {
  items: readonly AccordionItemData[];
  defaultOpen?: string;
  /** Controlled open value (array with 0 or 1 id). Omit for uncontrolled. */
  value?: string[];
  onValueChange?: (value: string[]) => void;
}) {
  return (
    <AccordionPrimitive.Root
      multiple={false}
      {...(value !== undefined
        ? { value, onValueChange }
        : { defaultValue: defaultOpen ? [defaultOpen] : undefined })}
      className="flex w-full flex-col gap-5"
    >
      {items.map((item, index) => {
        const Icon = trustIcons[index % trustIcons.length] ?? FileWarning;
        return (
          <AccordionPrimitive.Item
            key={item.id}
            value={item.id}
            className="group rounded-xl bg-surface transition-colors data-open:bg-pine"
          >
            <AccordionPrimitive.Header className="flex">
              <AccordionPrimitive.Trigger className="flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-xl px-6 py-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                <span className="flex items-center gap-3.5">
                  <Icon
                    aria-hidden
                    className="size-8 shrink-0 text-pine group-data-open:text-lime"
                  />
                  <span className="text-xl text-black group-data-open:text-white sm:text-[22px]">
                    {item.title}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-black transition-transform group-data-open:rotate-180 group-data-open:text-white"
                />
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Panel className="overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up">
              <div className="h-(--accordion-panel-height) px-6 pb-8 data-ending-style:h-0 data-starting-style:h-0">
                <p className="max-w-md pl-[46px] text-lg leading-relaxed font-light text-white/80">
                  {item.description}
                </p>
              </div>
            </AccordionPrimitive.Panel>
          </AccordionPrimitive.Item>
        );
      })}
    </AccordionPrimitive.Root>
  );
}

export type FaqItem = { id: string; question: string; answer: string };

export function FaqAccordion({
  items,
  defaultOpen,
}: {
  items: readonly FaqItem[];
  defaultOpen?: string;
}) {
  return (
    <AccordionPrimitive.Root
      multiple={false}
      defaultValue={defaultOpen ? [defaultOpen] : undefined}
      className="flex w-full flex-col gap-5"
    >
      {items.map((item) => (
        <AccordionPrimitive.Item
          key={item.id}
          value={item.id}
          className="group rounded-xl bg-site-panel transition-colors data-open:bg-gradient-to-br data-open:from-lime data-open:via-lime/40 data-open:to-white data-open:shadow-[0_4px_21px_1px_rgba(0,0,0,0.05)]"
        >
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger className="flex flex-1 cursor-pointer items-center justify-between gap-6 rounded-xl px-6 py-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
              <span className="text-lg text-black group-data-open:text-pine sm:text-[22px]">
                {item.question}
              </span>
              <ChevronDown
                aria-hidden
                className="size-5 shrink-0 text-black transition-transform group-data-open:rotate-180 group-data-open:text-pine"
              />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Panel className="overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up">
            <div className="h-(--accordion-panel-height) px-6 pb-7 data-ending-style:h-0 data-starting-style:h-0">
              <p
                className={cn(
                  "max-w-2xl text-lg leading-relaxed font-light text-pine",
                )}
              >
                {item.answer}
              </p>
            </div>
          </AccordionPrimitive.Panel>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
