import { Mail, MapPin, Phone } from "lucide-react";

import { contact } from "@/config/site";
import { BadgePill } from "@/components/layout/badge-pill";
import { Container } from "@/components/layout/container";
import { PillButton } from "@/components/ui/pill-button";
import {
  FaqAccordion,
  type FaqItem,
} from "@/components/sections/card-accordion";

const contactRows = [
  {
    label: "Location",
    icon: MapPin,
    values: contact.locations.map((text) => ({ text, href: undefined })),
  },
  {
    label: "Phone",
    icon: Phone,
    values: contact.phones.map((text) => ({
      text,
      href: `tel:${text.replace(/\s/g, "")}`,
    })),
  },
  {
    label: "Email",
    icon: Mail,
    values: [{ text: contact.email, href: `mailto:${contact.email}` }],
  },
];

export function ContactList() {
  return (
    <ul className="flex flex-col gap-8">
      {contactRows.map((row) => (
        <li key={row.label} className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime">
            <row.icon aria-hidden className="size-6 text-pine" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-base text-ink-soft">{row.label}</span>
            {row.values.map((value) =>
              value.href ? (
                <a
                  key={value.text}
                  href={value.href}
                  className="text-2xl text-pine transition-colors hover:text-pine/70"
                >
                  {value.text}
                </a>
              ) : (
                <span key={value.text} className="text-2xl text-pine">
                  {value.text}
                </span>
              ),
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FaqSection({
  badge,
  heading,
  cta,
  items,
  defaultOpen,
}: {
  badge?: string;
  heading: string;
  cta: { label: string; href: string };
  items: readonly FaqItem[];
  defaultOpen?: string;
}) {
  return (
    <Container
      id="contact"
      className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
    >
      <div className="flex flex-col items-start gap-9">
        {badge && <BadgePill tint="lime">{badge}</BadgePill>}
        <h2 className="max-w-md text-4xl leading-tight text-pine sm:text-5xl lg:text-[64px] lg:leading-[1.25]">
          {heading}
        </h2>
        <PillButton href={cta.href} variant="pine" size="sm" arrow>
          {cta.label}
        </PillButton>
        <ContactList />
      </div>
      <FaqAccordion items={items} defaultOpen={defaultOpen} />
    </Container>
  );
}
