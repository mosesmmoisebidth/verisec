import type { Metadata } from "next";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import {
  ArrowUpRight,
  ChevronDown,
  Clock,
  CreditCard,
  FileCheck,
  FileScan,
  IdCard,
  Info,
  Nfc,
  Receipt,
  ScanFace,
  ScanLine,
  Server,
  Smartphone,
  Timer,
  UserSearch,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  apiReference,
  changelog,
  codeExamples,
  developersHero,
  environments,
  guides,
  productApis,
  quickstart,
  sandbox,
  sdks,
  webhooks,
  type ServerSdk,
} from "@/config/developers";
import { developerSamples } from "@/config/developer-samples";
import { GitHubIcon } from "@/components/brand/icons";
import { SampleCard } from "@/components/dev/sample-card";
import { BadgePill } from "@/components/layout/badge-pill";
import { Container } from "@/components/layout/container";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { HeroShell } from "@/components/sections/hero";
import {
  CodeBlock,
  CopyButton,
  InstallLine,
  TabbedCodeBlock,
} from "@/components/dev/code-block";
import { PillButton } from "@/components/ui/pill-button";

export const metadata: Metadata = {
  title: "Developers",
  description: developersHero.subline,
  alternates: { canonical: "/developers/" },
};

const productIcons = {
  "id-card": IdCard,
  "file-check": FileCheck,
  "scan-line": ScanLine,
  nfc: Nfc,
  "scan-face": ScanFace,
  "user-search": UserSearch,
  "credit-card": CreditCard,
  receipt: Receipt,
  "file-scan": FileScan,
} as const;

/** Section header used down the whole page: badge + 48px heading. */
function DevHeading({
  badge,
  heading,
  aside,
}: {
  badge: string;
  heading: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col items-start gap-6">
        <BadgePill tint="lime">{badge}</BadgePill>
        <h2 className="text-3xl font-medium text-pine sm:text-4xl lg:text-5xl">
          {heading}
        </h2>
      </div>
      {aside}
    </div>
  );
}

function Quickstart() {
  return (
    <Container id="quickstart" className="flex flex-col gap-10">
      <DevHeading
        badge={quickstart.badge}
        heading={quickstart.heading}
        aside={
          <span className="flex items-center gap-2 rounded-full border border-pine/10 bg-pine/5 px-4 py-2 text-xs text-pine">
            <Timer aria-hidden className="size-3.5" />
            {quickstart.note}
          </span>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {quickstart.steps.map((step, index) => (
          <Reveal key={step.id} delay={index * 0.1} className="h-full">
            <article className="flex h-full flex-col gap-2 rounded-3xl bg-pine p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.3)]">
              <span className="flex size-8 items-center justify-center rounded-full bg-lime text-sm font-medium text-pine">
                {index + 1}
              </span>
              <h3 className="pt-2 text-lg font-medium text-lime">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/85">
                {step.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal>
        <CodeBlock title={quickstart.codeTitle} code={quickstart.code} />
      </Reveal>
    </Container>
  );
}

function ProductApis() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={productApis.badge} heading={productApis.heading} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {productApis.items.map((product, index) => {
          const Icon = productIcons[product.icon];
          return (
            <Reveal
              key={product.id}
              delay={(index % 3) * 0.1}
              className="h-full"
            >
              <a
                href={product.href}
                className="group flex h-full flex-col gap-2 rounded-3xl bg-gradient-to-b from-lime/85 to-panel p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.3)] transition-shadow hover:shadow-[0_22px_60px_-28px_rgba(15,23,42,0.45)] focus-visible:ring-2 focus-visible:ring-pine focus-visible:outline-none"
              >
                <span className="flex size-10 items-center justify-center rounded-[20px] bg-pine text-lime">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="pt-2 text-base font-bold text-pine">
                  {product.name}
                </h3>
                <p className="text-sm leading-relaxed text-pine/70">
                  {product.description}
                </p>
                <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-pill pt-2 text-xs font-bold text-pine underline-offset-4 group-hover:underline">
                  View API
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </a>
            </Reveal>
          );
        })}
      </div>
    </Container>
  );
}

function CodeExamples() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={codeExamples.badge} heading={codeExamples.heading} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="h-full">
          <TabbedCodeBlock languages={codeExamples.languages} />
        </Reveal>
        <Reveal delay={0.12} className="h-full">
          <CodeBlock
            title={codeExamples.responseTitle}
            code={codeExamples.response}
          />
        </Reveal>
      </div>
    </Container>
  );
}

/** Not on the registry yet; the install command is still the real one you will run. */
function SoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-lime bg-lime-tint px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em] text-pine">
      <span aria-hidden className="size-1.5 rounded-pill bg-pine/70" />
      {sdks.soon}
    </span>
  );
}

function SdkCard({ name, install, importLine, use, repo, published, registry }: ServerSdk) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-[20px] border border-hairline bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-pine">{name}</h4>
          {published ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-pine px-2 py-0.5 text-[10px] font-semibold text-lime">
              <span aria-hidden className="size-1.5 rounded-pill bg-lime" />
              {sdks.liveLabel}
              {registry ? ` · ${registry}` : ""}
            </span>
          ) : (
            <SoonBadge />
          )}
        </div>
        {repo ? (
          <a
            href={`https://${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#5b6472] transition-colors hover:text-pine"
          >
            <GitHubIcon className="size-3.5" />
            GitHub
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        ) : null}
      </div>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <InstallLine command={install} />
        </div>
        <CopyButton value={install} />
      </div>
      <pre className="overflow-x-auto rounded-xl border border-hairline bg-white px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-pine">
        <code>
          <span className="text-[#5b6472]">{importLine}</span>
          {"\n"}
          {use}
        </code>
      </pre>
    </article>
  );
}

function Sdks() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={sdks.badge} heading={sdks.heading} />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-medium text-pine">
            <Server aria-hidden className="size-4" />
            {sdks.serverHeading}
            {sdks.server.every((s) => s.published) ? null : <SoonBadge />}
          </h3>
          <p className="flex items-start gap-2 text-sm text-[#5b6472]">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {sdks.serverNote}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sdks.server.map((sdk, index) => (
            <Reveal key={sdk.id} delay={(index % 3) * 0.08} className="h-full">
              <SdkCard {...sdk} />
            </Reveal>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-medium text-pine">
            <Smartphone aria-hidden className="size-4" />
            {sdks.mobileHeading}
          </h3>
          <p className="flex items-start gap-2 text-sm text-[#5b6472]">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {sdks.mobileNote}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sdks.mobile.map((sdk, index) => (
            <Reveal key={sdk.id} delay={(index % 3) * 0.08} className="h-full">
              <SdkCard {...sdk} />
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}

function Environments() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={environments.badge} heading={environments.heading} />
      <div className="grid gap-4 lg:grid-cols-2">
        {environments.cards.map((env, index) => (
          <Reveal key={env.id} delay={index * 0.12} className="h-full">
            <article
              className={cn(
                "flex h-full flex-col gap-3 rounded-3xl p-6",
                env.featured
                  ? "bg-gradient-to-b from-lime/85 to-panel"
                  : "bg-surface",
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-pine">{env.name}</h3>
                <code className="rounded-full bg-pine px-2.5 py-0.5 font-mono text-[10px] text-lime">
                  {env.keyPrefix}
                </code>
              </div>
              <p className="text-sm leading-relaxed text-[#5b6472]">
                {env.body}
              </p>
              <p className="mt-auto rounded-[20px] bg-white px-4 py-4 text-xs leading-relaxed text-[#5b6472]">
                {env.limits}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-[#5b6472]">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {environments.note}
      </p>
    </Container>
  );
}

function Sandbox() {
  return (
    <Container className="flex flex-col gap-8">
      <DevHeading badge={sandbox.badge} heading={sandbox.heading} />
      <p className="-mt-3 max-w-2xl flex items-start gap-2 text-sm leading-relaxed text-[#5b6472]">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {sandbox.intro}
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-lg font-medium text-pine">
            <CreditCard aria-hidden className="size-4" />
            {sandbox.samplesHeading}
          </h3>
          <p className="text-xs text-[#5b6472]">{sandbox.samplesNote}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {developerSamples.map((sample, index) => (
            <Reveal key={sample.id} delay={(index % 3) * 0.08} className="h-full">
              <SampleCard sample={sample} href={sandbox.samplesHref} />
            </Reveal>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-lg font-medium text-pine">
            <FileScan aria-hidden className="size-4" />
            {sandbox.inputsHeading}
          </h3>
          <p className="text-xs text-[#5b6472]">{sandbox.inputsNote}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {sandbox.inputs.map((input, index) => {
            const Icon = productIcons[input.icon];
            return (
              <Reveal key={input.id} delay={(index % 3) * 0.08} className="h-full">
                <article className="flex h-full flex-col gap-3 rounded-3xl border border-hairline bg-panel p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold text-pine">
                      <span className="flex size-8 items-center justify-center rounded-[12px] bg-pine text-lime">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      {input.label}
                    </span>
                    <code className="shrink-0 rounded-full bg-pine px-2.5 py-0.5 font-mono text-[10px] text-lime">
                      {input.endpoint}
                    </code>
                  </div>
                  <div className="flex items-stretch gap-2">
                    <pre
                      className={cn(
                        "min-w-0 flex-1 overflow-x-auto rounded-xl border border-hairline bg-white px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-pine",
                        input.mono ? "whitespace-pre" : "whitespace-pre-wrap break-words",
                      )}
                    >
                      {input.value}
                    </pre>
                    <CopyButton value={input.value} />
                  </div>
                  <p className="text-xs leading-relaxed text-[#5b6472]">{input.hint}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-[#5b6472]">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {sandbox.imagesNote}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <PillButton href={sandbox.playgroundCta.href} variant="pine" size="sm" className="px-6 text-sm" arrow>
          {sandbox.playgroundCta.label}
        </PillButton>
        <p className="text-xs text-[#5b6472]">{sandbox.playgroundNote}</p>
      </div>
    </Container>
  );
}

function Webhooks() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={webhooks.badge} heading={webhooks.heading} />
      <Reveal>
        <section className="overflow-hidden rounded-3xl bg-panel p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {webhooks.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="pb-3 text-[10px] font-bold text-[#5b6472]"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webhooks.events.map((event, index) => (
                  <tr
                    key={event.event}
                    className={cn(
                      "border-t border-[#f1f5f9]",
                      index % 2 === 0 && "bg-white",
                    )}
                  >
                    <td className="py-2.5 pr-6 font-mono text-xs whitespace-nowrap text-pine">
                      {event.event}
                    </td>
                    <td className="py-2.5 text-xs text-[#5b6472]">
                      {event.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="h-full">
          <CodeBlock title={webhooks.payloadTitle} code={webhooks.payload} />
        </Reveal>
        <Reveal delay={0.12} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-medium text-pine">
              {webhooks.signatureHeading}
            </h3>
            <p className="text-sm leading-relaxed text-[#5b6472]">
              {webhooks.signatureBody}
            </p>
          </div>
          <CodeBlock
            title={webhooks.signatureTitle}
            code={webhooks.signatureCode}
          />
        </Reveal>
      </div>
    </Container>
  );
}

function Guides() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={guides.badge} heading={guides.heading} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guides.items.map((guide, index) => (
          <Reveal key={guide.id} delay={(index % 3) * 0.1} className="h-full">
            <a
              href={guide.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-full flex-col gap-2 rounded-3xl bg-pine p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.3)] transition-shadow hover:shadow-[0_22px_60px_-28px_rgba(15,23,42,0.5)] focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-white">
                <Clock aria-hidden className="size-3" />
                {guide.minutes}
              </span>
              <h3 className="pt-2 text-base font-medium text-white">
                {guide.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/65">
                {guide.description}
              </p>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-lime underline-offset-4 group-hover:underline">
                Read guide
                <ArrowUpRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

function ApiReference() {
  return (
    <Container className="flex flex-col gap-10">
      <DevHeading badge={apiReference.badge} heading={apiReference.heading} />

      <AccordionPrimitive.Root
        defaultValue={[apiReference.defaultOpen]}
        className="grid gap-3 lg:grid-cols-2"
      >
        {apiReference.groups.map((group) => (
          <AccordionPrimitive.Item
            key={group.id}
            value={group.id}
            className="group h-fit rounded-3xl bg-panel transition-colors data-open:bg-gradient-to-b data-open:from-lime/85 data-open:to-panel"
          >
            <AccordionPrimitive.Header className="flex">
              <AccordionPrimitive.Trigger className="flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-3xl px-6 py-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                <span className="text-base font-medium text-pine">
                  {group.name}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-pine transition-transform group-data-open:rotate-180"
                />
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Panel className="overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up">
              <div className="h-(--accordion-panel-height) px-6 pb-6 data-ending-style:h-0 data-starting-style:h-0">
                <ul className="flex flex-col gap-2.5">
                  {group.endpoints.map((endpoint) => (
                    <li
                      key={`${endpoint.method}-${endpoint.path}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="rounded-[10px] bg-pine px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        {endpoint.method}
                      </span>
                      <code className="font-mono text-[11px] text-pine">
                        {endpoint.path}
                      </code>
                      <span className="text-xs text-[#5b6472]">
                        {endpoint.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </AccordionPrimitive.Panel>
          </AccordionPrimitive.Item>
        ))}
      </AccordionPrimitive.Root>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="h-full">
          <section className="flex h-full flex-col gap-4 rounded-3xl bg-panel p-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-medium text-pine">
                {apiReference.responseHeading}
              </h3>
              <p className="text-sm leading-relaxed text-[#5b6472]">
                {apiReference.responseBody}
              </p>
            </div>
            <h3 className="pt-2 text-base font-medium text-pine">
              {apiReference.statusHeading}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {apiReference.statusCodes.map((status) => (
                <li key={status.code} className="flex gap-3">
                  <code className="w-8 shrink-0 font-mono text-xs font-bold text-pine">
                    {status.code}
                  </code>
                  <span className="text-xs text-[#5b6472]">
                    {status.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
        <Reveal delay={0.12} className="h-full">
          <CodeBlock
            title={apiReference.errorTitle}
            code={apiReference.errorExample}
          />
        </Reveal>
      </div>
    </Container>
  );
}

function Changelog() {
  return (
    <Container className="flex flex-col gap-8">
      <DevHeading badge={changelog.badge} heading={changelog.heading} />
      <p className="max-w-4xl text-sm leading-relaxed text-[#5b6472]">
        {changelog.note}
      </p>
      <ol className="flex flex-col border-l border-[#e2e8f0] pl-6">
        {changelog.entries.map((entry, index) => (
          <Reveal key={entry.version} delay={Math.min(index, 4) * 0.06}>
            <li className="relative flex flex-col gap-1.5 pb-8">
              <span
                aria-hidden
                className="absolute top-2 -left-[29px] size-2.5 rounded-full bg-lime ring-4 ring-white"
              />
              <span className="flex flex-wrap items-baseline gap-3">
                <span className="text-base font-bold text-pine">
                  {entry.version}
                </span>
                <span className="text-xs text-[#5b6472]">{entry.date}</span>
              </span>
              <p className="max-w-4xl text-sm leading-relaxed text-[#5b6472]">
                {entry.body}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Container>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <main className="flex flex-col gap-20 pb-20 lg:gap-28 lg:pb-28">
        <HeroShell activeHref="/developers">
          <Container className="relative z-10 flex flex-col items-center gap-6 pt-24 pb-20 text-center lg:pt-28">
            <Reveal mode="mount">
              <h1 className="max-w-5xl text-[clamp(2.5rem,5.2vw,4.25rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                {developersHero.heading}
              </h1>
            </Reveal>
            <Reveal mode="mount" delay={0.15}>
              <p className="max-w-3xl text-lg leading-relaxed text-ink-muted sm:text-2xl">
                {developersHero.subline}
              </p>
            </Reveal>
            <Reveal mode="mount" delay={0.3}>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <PillButton
                  href={developersHero.primaryCta.href}
                  variant="lime"
                  arrow
                >
                  {developersHero.primaryCta.label}
                </PillButton>
                <PillButton
                  href={developersHero.secondaryCta.href}
                  variant="white"
                >
                  {developersHero.secondaryCta.label}
                  <ArrowUpRight aria-hidden className="size-4" />
                </PillButton>
              </div>
            </Reveal>
          </Container>
        </HeroShell>

        <Quickstart />
        <ProductApis />
        <CodeExamples />
        <Sdks />
        <Environments />
        <Sandbox />
        <Webhooks />
        <Guides />
        <ApiReference />
        <Changelog />
      </main>
      <SiteFooter />
    </>
  );
}
