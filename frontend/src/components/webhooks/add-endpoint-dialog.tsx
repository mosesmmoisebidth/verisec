"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Box, Check, CreditCard, Link2, Loader2, Plus, Radar, ReceiptText, ScanFace, Webhook, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Select } from "@/components/ui/select";
import type { AddEndpointForm, WebhookPortal } from "@/lib/console/types";
import type { WebhookEndpointRow, WebhookEnv, WebhookEventType } from "@/lib/console/webhooks-api";
import { WebhooksError, webhooksApi } from "@/lib/console/webhooks-api";
import { cn } from "@/lib/utils";

/** The events, by what they are about (the part of the name before the first dot). */
const GROUP: Record<string, { name: string; icon: LucideIcon }> = {
  verification: { name: "Verification", icon: BadgeCheck },
  face: { name: "Face", icon: ScanFace },
  aml: { name: "Screening", icon: Radar },
  cheque: { name: "Cheques", icon: ReceiptText },
  card: { name: "Cards", icon: CreditCard },
};
const prefixOf = (name: string) => name.split(".")[0] ?? name;

function groupsOf(catalog: WebhookEventType[]) {
  const out: { key: string; name: string; icon: LucideIcon; events: WebhookEventType[] }[] = [];
  for (const e of catalog) {
    const key = prefixOf(e.name);
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, name: GROUP[key]?.name ?? key[0]!.toUpperCase() + key.slice(1), icon: GROUP[key]?.icon ?? Webhook, events: [] };
      out.push(g);
    }
    g.events.push(e);
  }
  return out;
}

/**
 * "Add webhook endpoint", Figma Desktop-25, wired to the console.
 *
 * The frame's URL and Environment fields, plus the events to subscribe to
 * (the portal's catalogue, from the API). A native `<dialog>` for the same
 * reasons as every other dialog here: focus trap, Escape, top layer and page
 * inertness are the platform's. On success the parent shows the signing secret,
 * once.
 *
 * `type="url"` on the field rather than `text`: an endpoint that is not a URL
 * cannot receive anything, and the browser says so before the request is sent.
 */
export function AddEndpointDialog({
  form,
  label,
  portal,
  catalog,
  disabled,
  disabledReason,
  onCreated,
}: {
  form: AddEndpointForm;
  label: string;
  portal: WebhookPortal;
  catalog: WebhookEventType[];
  disabled?: boolean;
  disabledReason?: string;
  onCreated: (endpoint: WebhookEndpointRow, secret: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [envLabel, setEnvLabel] = useState(form.envOptions[0] ?? "Test");
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const env: WebhookEnv = envLabel.toLowerCase() === "live" ? "live" : "test";
  const allOn = catalog.length > 0 && events.size === catalog.length;
  const groups = groupsOf(catalog);
  const setGroup = (names: string[], on: boolean) =>
    setEvents((s) => {
      const next = new Set(s);
      for (const n of names) {
        if (on) next.add(n);
        else next.delete(n);
      }
      return next;
    });

  const open = () => {
    setUrl("");
    setEnvLabel(form.envOptions[0] ?? "Test");
    setEvents(new Set());
    setError(null);
    setBusy(false);
    ref.current?.showModal();
  };
  const close = () => {
    if (!busy) ref.current?.close();
  };

  const toggle = (name: string) =>
    setEvents((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const submit = async () => {
    if (!events.size) {
      setError("Choose at least one event.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await webhooksApi.create({ url: url.trim(), env, portal, events: catalog.map((e) => e.name).filter((n) => events.has(n)) });
      setBusy(false);
      ref.current?.close();
      onCreated(r.endpoint, r.secret);
    } catch (e) {
      setBusy(false);
      setError(e instanceof WebhooksError ? e.message : "The endpoint could not be added. Try again.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
      >
        <Plus aria-hidden className="size-[15px]" strokeWidth={2.2} />
        {label}
      </button>

      {/* Backdrop-close. eslint's premise, a click handler with no keyboard
          path, is false for <dialog>: Escape closes it natively, which is the
          keyboard equivalent this rule exists to require. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        aria-labelledby="add-endpoint-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(780px,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-5 p-6"
        >
          <header className="flex items-start justify-between gap-4">
            <span className="flex flex-col gap-1.5">
              <h2 id="add-endpoint-title" className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink">
                {form.title}
              </h2>
              <span className="text-micro text-muted">Pick what this URL receives. Every delivery is signed.</span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label={form.closeLabel}
              className="-m-1 grid size-6 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
            >
              <X aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
          </header>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <label htmlFor={`endpoint-url-${portal}`} className="text-body text-ink">
              {form.urlLabel}
            </label>
            <span className="relative flex h-9 items-center">
              <Link2 aria-hidden className="pointer-events-none absolute left-3 size-[18px] text-slate" strokeWidth={1.5} />
              <input
                id={`endpoint-url-${portal}`}
                name="url"
                type="url"
                inputMode="url"
                required
                maxLength={2048}
                autoComplete="off"
                spellCheck={false}
                placeholder={form.urlPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-full w-full rounded-[10px] border border-hairline bg-panel pr-3 pl-10 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
              />
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor={`endpoint-env-${portal}`} className="text-body text-ink">
              {form.envLabel}
            </label>
            <Select
              block
              menuFixed
              id={`endpoint-env-${portal}`}
              name="environment"
              label={form.envLabel}
              options={form.envOptions}
              value={envLabel}
              onValueChange={setEnvLabel}
              icon={Box}
              className="h-9 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-10 text-body text-ink"
            />
            {env === "live" ? <p className="m-0 text-micro text-slate">{form.liveHint}</p> : null}
          </div>
          </div>

          <div role="group" aria-labelledby={`endpoint-events-${portal}`} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-baseline gap-2">
                <span id={`endpoint-events-${portal}`} className="text-body text-ink">
                  {form.eventsLabel}
                </span>
                {catalog.length ? (
                  <span className="tnum text-micro text-muted">
                    {events.size} of {catalog.length} selected
                  </span>
                ) : null}
              </span>
              {catalog.length ? (
                <button
                  type="button"
                  onClick={() => setEvents(allOn ? new Set() : new Set(catalog.map((e) => e.name)))}
                  className="text-micro font-medium text-pine underline underline-offset-2 hover:text-pine/70"
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              ) : null}
            </div>

            {catalog.length ? (
              // a big group takes the full width, three tiles across; small ones (one or two events) pair up
              <div className="grid gap-4 rounded-[14px] border border-hairline bg-panel p-3.5 sm:grid-cols-2">
                {groups.map((g) => {
                  const small = g.events.length <= 2;
                  const names = g.events.map((e) => e.name);
                  const on = names.filter((n) => events.has(n)).length;
                  const Icon = g.icon;
                  return (
                    <section key={g.key} aria-label={g.name} className={cn("flex min-w-0 flex-col gap-2", !small && "sm:col-span-2")}>
                      <header className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="grid size-6 place-items-center rounded-pill bg-pine text-lime">
                            <Icon className="size-3.5" strokeWidth={2} />
                          </span>
                          <span className="text-body font-medium text-pine">{g.name}</span>
                          <span className="font-mono text-[11.5px] text-muted">{g.key}.*</span>
                        </span>
                        <span className="flex items-center gap-2.5">
                          <span className="tnum text-micro text-muted">
                            {on}/{names.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setGroup(names, on < names.length)}
                            className="rounded-pill border border-hairline bg-white px-2.5 py-0.5 text-micro font-medium text-pine transition-colors hover:border-pine/30"
                          >
                            {on < names.length ? "All" : "None"}
                          </button>
                        </span>
                      </header>
                      <div className={cn("grid grid-cols-1 gap-2", small ? "sm:grid-cols-2" : "sm:grid-cols-2 md:grid-cols-3")}>
                        {g.events.map((event) => {
                          const checked = events.has(event.name);
                          return (
                            // relative: the visually hidden checkbox stays inside its own tile
                            <label
                              key={event.name}
                              title={event.name}
                              className={cn(
                                "relative flex min-w-0 cursor-pointer items-start gap-2.5 rounded-[12px] border p-3 transition-colors",
                                checked ? "border-pine bg-lime-tint" : "border-hairline bg-white hover:border-pine/30",
                              )}
                            >
                              <input
                                type="checkbox"
                                name="events"
                                value={event.name}
                                checked={checked}
                                onChange={() => toggle(event.name)}
                                className="peer sr-only"
                              />
                              <span
                                aria-hidden
                                className="mt-px grid size-[17px] shrink-0 place-items-center rounded-pill border-[1.5px] border-lime bg-page text-transparent transition-colors peer-checked:bg-lime peer-checked:text-pine peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
                              >
                                <Check className="size-2.5" strokeWidth={3.4} />
                              </span>
                              <span className="flex min-w-0 flex-col gap-0.5">
                                {/* names wrap after a dot, never cut off */}
                                <span className="font-mono text-[12.5px] font-medium [overflow-wrap:anywhere] text-pine">
                                  {event.name
                                    .slice(g.key.length + 1)
                                    .split(".")
                                    .map((part, i) => (
                                      <span key={i}>
                                        {i ? "." : ""}
                                        <wbr />
                                        {part}
                                      </span>
                                    ))}
                                </span>
                                <span className="text-micro text-quiet">{event.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-micro text-slate">The event list could not be loaded. Close this and try again.</p>
            )}
          </div>

          {error ? (
            <p role="alert" className="m-0 rounded-[10px] bg-danger-tint px-3 py-2 text-[13px] leading-[19px] text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !catalog.length}
              className={cn(
                "inline-flex h-9 min-w-[140px] items-center justify-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100",
              )}
            >
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} /> : <Plus aria-hidden className="size-4" strokeWidth={2.2} />}
              {busy ? "Please wait…" : form.submitLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
