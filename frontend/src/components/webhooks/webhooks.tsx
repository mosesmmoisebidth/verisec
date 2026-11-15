"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Loader2, RefreshCw, RotateCcw, Send, Trash2, X } from "lucide-react";

import { EnvChip } from "@/components/api-keys/parts";
import { toast } from "@/components/ui/toast";
import { AddEndpointDialog } from "@/components/webhooks/add-endpoint-dialog";
import { ConfirmDialog, SecretDialog, type Confirm, type Reveal } from "@/components/webhooks/webhook-dialogs";
import type { DeliveryStatus, WebhooksData } from "@/lib/console/types";
import type { WebhookDelivery, WebhookEndpointRow, WebhookEventType } from "@/lib/console/webhooks-api";
import { WebhooksError, webhooksApi } from "@/lib/console/webhooks-api";
import { cn } from "@/lib/utils";

/**
 * Webhooks, Figma Desktop-23, live.
 *
 * The organisation's endpoints for this portal (KYC or Financial), loaded in
 * the browser from the console API. Each endpoint is a native `<details>`, as
 * in the frame: keyboard and screen reader behaviour come with it, and opening
 * one is what loads its delivery log.
 *
 * Every control is real: the switch turns delivery on and off, the event
 * checkboxes save at once, Rotate makes a new signing secret (shown once, the
 * old one keeps signing for 24 hours), Test sends `webhook.test` to this
 * endpoint only, and Resend sends a logged event again. The whole signing
 * secret exists only in the dialog right after Add or Rotate; lists carry a
 * hint of it.
 */

type Labels = WebhooksData["labels"];

const errText = (e: unknown, fallback: string) => (e instanceof WebhooksError ? e.message : fallback);

export function Webhooks({ data }: { data: WebhooksData }) {
  const [catalog, setCatalog] = useState<WebhookEventType[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[] | null>(null);
  const [max, setMax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // the portal's event catalogue and the endpoints, together; `attempt` re-runs it after an error
  useEffect(() => {
    let live = true;
    Promise.all([webhooksApi.eventTypes(data.portal), webhooksApi.list(data.portal)])
      .then(([c, l]) => {
        if (!live) return;
        setError(null);
        setCatalog(c.event_types);
        setEndpoints(l.endpoints);
        setMax(l.max_endpoints);
      })
      .catch((e: unknown) => {
        if (live) setError(errText(e, "Webhooks could not be loaded."));
      });
    return () => {
      live = false;
    };
  }, [data.portal, attempt]);

  const replace = (row: WebhookEndpointRow) => setEndpoints((list) => (list ? list.map((e) => (e.id === row.id ? row : e)) : list));
  const atLimit = !!endpoints && max > 0 && endpoints.length >= max;

  const askRotate = (endpoint: WebhookEndpointRow) =>
    setConfirm({
      title: "Rotate signing secret?",
      body: "A new secret is created and shown once. The current secret keeps signing for 24 hours, so you can switch your server without missing events.",
      confirmLabel: data.labels.rotate,
      endpoint,
      run: async () => {
        try {
          const r = await webhooksApi.rotate(endpoint.id);
          replace(r.endpoint);
          setConfirm(null);
          setReveal({ endpoint: r.endpoint, secret: r.secret, rotated: true, previousUntil: r.previous_secret_valid_until });
        } catch (e) {
          toast.error("The secret was not rotated", errText(e, "Try again."));
        }
      },
    });

  const askRemove = (endpoint: WebhookEndpointRow) =>
    setConfirm({
      title: "Delete this endpoint?",
      body: "It stops receiving events at once, and its delivery log goes with it. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      endpoint,
      run: async () => {
        try {
          await webhooksApi.remove(endpoint.id);
          setEndpoints((list) => (list ? list.filter((e) => e.id !== endpoint.id) : list));
          setConfirm(null);
          toast.success("Endpoint deleted");
        } catch (e) {
          toast.error("The endpoint was not deleted", errText(e, "Try again."));
        }
      },
    });

  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>
        <AddEndpointDialog
          form={data.add}
          label={data.addLabel}
          portal={data.portal}
          catalog={catalog}
          disabled={!endpoints || atLimit}
          disabledReason={atLimit ? `You can have up to ${max} endpoints. Delete one to add another.` : undefined}
          onCreated={(endpoint, secret) => {
            setEndpoints((list) => [...(list ?? []), endpoint]);
            setJustAdded(endpoint.id);
            setReveal({ endpoint, secret, rotated: false });
          }}
        />
      </header>

      {error ? (
        <section className="flex flex-col items-start gap-3 rounded-shell border border-hairline bg-page p-6">
          <h2 className="m-0 text-[16px] font-medium text-pine">Webhooks could not be loaded</h2>
          <p className="m-0 text-[13.5px] text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEndpoints(null);
              setAttempt((n) => n + 1);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline bg-page px-4 text-[13px] font-medium text-pine hover:bg-hover-light"
          >
            <RefreshCw aria-hidden className="size-4" strokeWidth={2} />
            Try again
          </button>
        </section>
      ) : !endpoints ? (
        <p className="m-0 flex items-center justify-center gap-2 rounded-shell border border-dashed border-edge bg-page px-4 py-8 text-body text-inert">
          <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
          Please wait…
        </p>
      ) : endpoints.length === 0 ? (
        <section className="flex flex-col items-center gap-1.5 rounded-shell border border-dashed border-edge bg-page px-6 py-10 text-center">
          <h2 className="m-0 text-[16px] font-medium text-pine">{data.empty.title}</h2>
          <p className="m-0 max-w-[520px] text-body text-slate">{data.empty.body}</p>
        </section>
      ) : (
        <div className="flex flex-col gap-2">
          {endpoints.map((endpoint, i) => (
            <EndpointCard
              key={endpoint.id}
              endpoint={endpoint}
              catalog={catalog}
              labels={data.labels}
              initiallyOpen={justAdded ? endpoint.id === justAdded : i === 0}
              onUpdated={replace}
              onRotate={() => askRotate(endpoint)}
              onRemove={() => askRemove(endpoint)}
            />
          ))}
        </div>
      )}

      <SecretDialog reveal={reveal} onClose={() => setReveal(null)} />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   One endpoint
---------------------------------------------------------------------------- */

function EndpointCard({
  endpoint,
  catalog,
  labels,
  initiallyOpen,
  onUpdated,
  onRotate,
  onRemove,
}: {
  endpoint: WebhookEndpointRow;
  catalog: WebhookEventType[];
  labels: Labels;
  initiallyOpen: boolean;
  onUpdated: (row: WebhookEndpointRow) => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [savingEvents, setSavingEvents] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logAttempt, setLogAttempt] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // the delivery log loads while the card is open, and again on Refresh, Test and Resend
  useEffect(() => {
    if (!open) return;
    let live = true;
    webhooksApi
      .deliveries(endpoint.id)
      .then((r) => {
        if (!live) return;
        setRows(r.deliveries);
        setLogError(null);
      })
      .catch((e: unknown) => {
        if (live) setLogError(errText(e, "The delivery log could not be loaded."));
      })
      .finally(() => {
        if (live) setLogLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, endpoint.id, logAttempt]);

  const refresh = () => {
    setLogLoading(true);
    setLogAttempt((n) => n + 1);
  };
  /** A delivery takes a moment: look again shortly, then once more for a slow receiver. */
  const refreshSoon = () => {
    for (const ms of [1500, 5000]) timers.current.push(window.setTimeout(refresh, ms));
  };

  const setEnabled = async (on: boolean) => {
    const before = endpoint;
    setSavingSwitch(true);
    onUpdated({ ...endpoint, enabled: on });
    try {
      const r = await webhooksApi.update(endpoint.id, { enabled: on });
      onUpdated(r.endpoint);
      toast.success(on ? "Endpoint turned on" : "Endpoint turned off", on ? "Events are delivered to it again." : "Nothing is delivered to it until you turn it back on.");
    } catch (e) {
      onUpdated(before);
      toast.error("The endpoint was not changed", errText(e, "Try again."));
    } finally {
      setSavingSwitch(false);
    }
  };

  const toggleEvent = async (name: string) => {
    const on = new Set(endpoint.events);
    if (on.has(name)) on.delete(name);
    else on.add(name);
    const next = catalog.map((e) => e.name).filter((n) => on.has(n));
    if (!next.length) {
      toast.warning("Keep at least one event", "To stop deliveries for a while, turn the endpoint off instead.");
      return;
    }
    const before = endpoint;
    setSavingEvents(true);
    onUpdated({ ...endpoint, events: next });
    try {
      const r = await webhooksApi.update(endpoint.id, { events: next });
      onUpdated(r.endpoint);
    } catch (e) {
      onUpdated(before);
      toast.error("The events were not saved", errText(e, "Try again."));
    } finally {
      setSavingEvents(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await webhooksApi.test(endpoint.id);
      toast.success("Test event sent", "It shows in the delivery log in a moment.");
      setOpen(true);
      refreshSoon();
    } catch (e) {
      toast.error("Test event not sent", errText(e, "Try again."));
    } finally {
      setTesting(false);
    }
  };

  const resend = async (row: WebhookDelivery) => {
    setResending(row.id);
    try {
      await webhooksApi.resend(endpoint.id, row.message_id);
      toast.success("Sent again", `${row.event} is on its way.`);
      refreshSoon();
    } catch (e) {
      toast.error("Not sent again", errText(e, "Try again."));
    } finally {
      setResending(null);
    }
  };

  return (
    <details
      open={open}
      data-keep-open
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn(
        "group overflow-hidden rounded-shell border border-hairline",
        // The frame fills the open card white and the closed ones `panel`, so
        // the one you are working in lifts off the stack.
        "bg-panel open:bg-page",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <EnvChip env={endpoint.env} />
          <span className="min-w-0 truncate text-body text-pine">{endpoint.url}</span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          <EnabledSwitch
            on={endpoint.enabled}
            busy={savingSwitch}
            label={`Deliver to ${endpoint.url}`}
            onChange={(on) => void setEnabled(on)}
          />
          <ChevronDown aria-hidden className="size-4 text-slate transition-transform group-open:rotate-180" strokeWidth={1.8} />
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-edge p-4">
        <Section label={labels.events}>
          {/* The frame's 3-up grid, stepping down rather than letting a wire
              name like `verification.needs_review` truncate: an event nobody
              can read is an event nobody can knowingly subscribe to. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.map((event) => (
              <label key={event.name} title={event.description} className={cn("flex items-center gap-2.5 py-0.5", savingEvents ? "cursor-wait" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  name={`${endpoint.id}-events`}
                  value={event.name}
                  checked={endpoint.events.includes(event.name)}
                  disabled={savingEvents}
                  onChange={() => void toggleEvent(event.name)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="grid size-[17px] shrink-0 place-items-center rounded-pill border-[1.5px] border-lime bg-page text-transparent transition-colors peer-checked:bg-lime peer-checked:text-pine peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
                >
                  <Check className="size-2.5" strokeWidth={3.4} />
                </span>
                <span className="min-w-0 truncate font-mono text-[12.5px] text-pine">{event.name}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section label={labels.secret}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`${endpoint.id}-secret`}>
              {labels.secret}
            </label>
            <input
              id={`${endpoint.id}-secret`}
              readOnly
              value={endpoint.secret_hint}
              className="tnum h-9 min-w-[220px] flex-1 rounded-box border border-hairline bg-page px-3 font-mono text-[12.5px] text-slate"
            />
            <button
              type="button"
              onClick={onRotate}
              className="inline-flex h-9 shrink-0 items-center rounded-pill border border-hairline bg-page px-4 text-body text-pine transition-colors hover:bg-hover-light"
            >
              {labels.rotate}
            </button>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={testing || !endpoint.enabled}
              title={!endpoint.enabled ? "Turn the endpoint on to send it a test event." : undefined}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
            >
              {testing ? (
                <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.8} />
              ) : (
                <Send aria-hidden className="size-4" strokeWidth={1.8} />
              )}
              {labels.test}
            </button>
          </div>
          {endpoint.rotated_at ? <p className="m-0 text-micro text-slate">Rotated {stamp(endpoint.rotated_at)}</p> : null}
        </Section>

        <Section
          label={labels.log}
          action={
            <button
              type="button"
              onClick={refresh}
              disabled={logLoading}
              className="inline-flex items-center gap-1.5 text-micro text-pine underline underline-offset-2 transition-colors hover:text-pine/70 disabled:no-underline disabled:opacity-60"
            >
              <RefreshCw aria-hidden className={cn("size-3.5", logLoading && "animate-spin")} strokeWidth={2} />
              {labels.refresh}
            </button>
          }
        >
          <DeliveryLog
            columns={labels.logColumns}
            resendLabel={labels.resend}
            rows={rows}
            error={logError}
            resending={resending}
            onResend={(row) => void resend(row)}
          />
        </Section>

        <div className="flex justify-end border-t border-edge pt-3">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 text-micro text-danger transition-colors hover:text-danger/80"
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
            {labels.remove}
          </button>
        </div>
      </div>
    </details>
  );
}

/**
 * The console's switch (same look as `ui/switch`), controlled: it saves at
 * once and goes back if the save fails. A real checkbox with `role="switch"`.
 */
function EnabledSwitch({ on, busy, label, onChange }: { on: boolean; busy: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-wait"
      />
      <span
        aria-hidden
        className="pointer-events-none flex h-5 w-9 items-center rounded-pill bg-well p-0.5 transition-colors peer-checked:bg-lime peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
      >
        <span className="size-4 rounded-pill bg-page shadow-sm transition-transform" />
      </span>
    </span>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-body font-medium text-pine">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Delivery log
---------------------------------------------------------------------------- */

const DELIVERY: Record<DeliveryStatus, { label: string; pill: string; glyph: typeof Check }> = {
  delivered: { label: "Delivered", pill: "bg-pass-tint text-ramp-2", glyph: Check },
  failed: { label: "Failed", pill: "bg-danger-tint text-danger", glyph: X },
  pending: { label: "Pending", pill: "bg-caution-tint text-caution", glyph: Clock },
};

/** Colour AND a glyph, like every other outcome in the console. */
function DeliveryTag({ status }: { status: DeliveryStatus }) {
  const d = DELIVERY[status];
  const Glyph = d.glyph;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap", d.pill)}>
      <Glyph aria-hidden className="size-3" strokeWidth={2.4} />
      {d.label}
    </span>
  );
}

/** "2026-07-21 09:14:03", the frame's format plus seconds, in the viewer's time zone. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function response(row: WebhookDelivery): string {
  if (row.response_code === null) return row.status === "pending" ? "Waiting" : "No response";
  return row.duration_ms === null ? String(row.response_code) : `${row.response_code} · ${row.duration_ms} ms`;
}

const LOG_TEMPLATE = "minmax(0,1fr) 110px 120px 150px 72px";

function DeliveryLog({
  columns,
  resendLabel,
  rows,
  error,
  resending,
  onResend,
}: {
  columns: string[];
  resendLabel: string;
  rows: WebhookDelivery[] | null;
  error: string | null;
  resending: string | null;
  onResend: (row: WebhookDelivery) => void;
}) {
  if (error && !rows) {
    return <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-5 text-center text-body text-danger">{error}</p>;
  }
  if (!rows) {
    return <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-5 text-center text-body text-inert">Please wait…</p>;
  }
  if (rows.length === 0) {
    // An endpoint that has never fired says so. An empty table under a heading
    // reads as a table that failed to load.
    return (
      <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-5 text-center text-body text-inert">
        No deliveries yet. Send a test event to try this endpoint.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {error ? <p className="m-0 mb-2 text-micro text-danger">{error}</p> : null}
      <div role="table" style={{ minWidth: 640 }}>
        <div role="row" className="grid items-center gap-x-3 border-b border-edge px-3 pb-2" style={{ gridTemplateColumns: LOG_TEMPLATE }}>
          {columns.map((header) => (
            <span key={header} role="columnheader" className="text-micro text-muted">
              {header}
            </span>
          ))}
          <span className="sr-only" role="columnheader">
            Actions
          </span>
        </div>

        <div role="rowgroup">
          {rows.map((row) => (
            <div
              key={row.id}
              role="row"
              className="grid items-center gap-x-3 border-b border-edge px-3 py-2.5 last:border-b-0"
              style={{ gridTemplateColumns: LOG_TEMPLATE }}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-mono text-[12.5px] text-pine">{row.event}</span>
                {row.manual ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-well px-1.5 py-px text-[11px] text-slate">
                    <RotateCcw aria-hidden className="size-2.5" strokeWidth={2.4} />
                    resent
                  </span>
                ) : null}
              </span>
              <span role="cell">
                <DeliveryTag status={row.status} />
              </span>
              <span role="cell" className="tnum text-micro text-slate">
                {response(row)}
              </span>
              <span role="cell" className="tnum flex flex-col text-micro text-slate">
                <span>{stamp(row.at)}</span>
                {row.next_attempt_at ? <span className="text-[11px] text-caution">Next try {clock(row.next_attempt_at)}</span> : null}
              </span>
              <span role="cell" className="text-right">
                <button
                  type="button"
                  onClick={() => onResend(row)}
                  disabled={resending === row.id}
                  className="text-micro text-pine underline underline-offset-2 transition-colors hover:text-pine/70 disabled:no-underline disabled:opacity-60"
                >
                  {resendLabel}
                  <span className="sr-only"> {row.event} delivery</span>
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
