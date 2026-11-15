"use client";

import { useState } from "react";
import { CircleCheck, Gem, Rocket, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  pricingModels,
  pricingPlans,
  pricingSection,
  type Plan,
  type PricingModel,
} from "@/config/pricing";
import { Container } from "@/components/layout/container";
import { CenteredHeading } from "@/components/layout/section-heading";
import { PillButton } from "@/components/ui/pill-button";

const planIcons = { zap: Zap, rocket: Rocket, gem: Gem } as const;

function PlanCard({ plan }: { plan: Plan }) {
  const dark = plan.variant === "dark";
  const Icon = planIcons[plan.icon];

  return (
    <article
      className={cn(
        "relative flex flex-col gap-6 rounded-2xl p-8",
        dark
          ? "border border-pine bg-pine shadow-[0_14px_29px_10px_rgba(0,0,0,0.03)]"
          : "bg-[linear-gradient(160deg,#fbfbfb_5%,#bfeb58_100%)] shadow-[0_42px_49px_-9px_rgba(191,235,88,0.46)]",
      )}
    >
      <div className="flex items-start justify-between">
        <Icon
          aria-hidden
          className={cn("size-11", dark ? "text-lime" : "text-pine")}
        />
        {plan.badge && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              dark ? "bg-lime text-pine" : "bg-pine text-lime",
            )}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3
          className={cn(
            "text-2xl font-medium",
            dark ? "text-lime" : "text-pine",
          )}
        >
          {plan.name}
        </h3>
        <p
          className={cn(
            "text-lg font-light",
            dark ? "text-white/85" : "text-pine",
          )}
        >
          {plan.tagline}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <span
          className={cn(
            "text-6xl leading-none tracking-tight lg:text-[64px]",
            dark ? "text-white" : "text-pine",
          )}
        >
          {plan.price}
        </span>
        {plan.priceSuffix && (
          <span
            className={cn(
              "pb-1.5 text-lg font-light",
              dark ? "text-white/85" : "text-pine",
            )}
          >
            {plan.priceSuffix}
          </span>
        )}
      </div>

      {/* What you get, called out */}
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full px-4 py-1.5 text-base font-medium",
          dark ? "bg-white/10 text-lime" : "bg-pine/10 text-pine",
        )}
      >
        {plan.highlight}
      </span>

      <ul className="flex flex-col gap-[15px]">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CircleCheck
              aria-hidden
              className={cn(
                "mt-0.5 size-6 shrink-0",
                dark ? "text-lime" : "text-pine",
              )}
            />
            <span
              className={cn(
                "text-lg font-light",
                dark ? "text-white/85" : "text-pine",
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        <PillButton
          href={plan.cta.href}
          size="wide"
          variant={dark ? "lime-outline" : "pine-lime"}
        >
          {plan.cta.label}
        </PillButton>
      </div>
    </article>
  );
}

const MODELS = ["credits", "subscription"] as const;

/**
 * The sliding Credits / Subscription toggle and the active model's plan cards.
 * A pill with a highlight that slides between the two options (like a segmented control);
 * switching swaps the three cards underneath. Used on the home page and the /pricing page.
 */
export function PricingModels({ className }: { className?: string }) {
  const [model, setModel] = useState<PricingModel>("credits");

  return (
    <div className={cn("flex w-full flex-col items-center gap-10", className)}>
      <div className="flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Pricing model"
          className="relative inline-flex rounded-full bg-lime p-1.5"
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-1.5 left-1.5 w-[150px] rounded-full bg-pine shadow-[0_6px_16px_rgba(14,50,40,0.25)] transition-transform duration-300 ease-out",
              model === "subscription" && "translate-x-[150px]",
            )}
          />
          {MODELS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={model === value}
              onClick={() => setModel(value)}
              className={cn(
                "relative z-10 h-[45px] w-[150px] cursor-pointer rounded-full text-lg font-medium transition-colors",
                model === value ? "text-white" : "text-pine hover:text-pine/70",
              )}
            >
              {pricingModels[value].label}
            </button>
          ))}
        </div>
        <p className="text-center text-base text-ink-muted">
          {pricingModels[model].note}
        </p>
      </div>

      <div key={model} className="grid w-full gap-4 lg:grid-cols-3">
        {pricingPlans[model].map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}

/** Home page pricing section: heading + model toggle + plan cards. */
export function PricingSection() {
  return (
    <Container className="flex flex-col items-center gap-12" id="pricing">
      <CenteredHeading
        badge={pricingSection.badge}
        heading={pricingSection.heading}
        subline={pricingSection.subline}
      />
      <PricingModels />
    </Container>
  );
}
