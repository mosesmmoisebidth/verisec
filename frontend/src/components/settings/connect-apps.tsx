"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, Pencil } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { AppPicker } from "@/components/integrations/app-picker";
import { AppLogo, Dialog, DialogHeader, Toggle, button, errText } from "@/components/integrations/parts";
import { createGoogleSheet, pickGoogleFile, pickerConfigured, type PickedFile } from "@/lib/integrations/google-picker";
import { SettingsCard } from "@/components/settings/parts";
import {
  integrationsApi,
  type AppInfo,
  type IntegrationsOverview,
} from "@/lib/console/integrations-api";
import { cn } from "@/lib/utils";

/**
 * Connect apps, inside Settings -> Notifications. One banner opens the app picker; after an app is
 * connected (one click, the app's own sign-in), a popup lets the person choose which events it
 * should receive. The same apps and backend as the Webhooks events; only the delivery is an app
 * instead of a URL.
 */

/** The apps offered first (those with a shipped logo), newest-relevant first. */
const SUGGESTED: { slug: string; name: string }[] = [
  { slug: "slack", name: "Slack" },
  { slug: "microsoft_teams", name: "Microsoft Teams" },
  { slug: "googlechat", name: "Google Chat" },
  { slug: "discord", name: "Discord" },
  { slug: "gmail", name: "Gmail" },
  { slug: "googlesheets", name: "Google Sheets" },
  { slug: "googledrive", name: "Google Drive" },
  { slug: "figma", name: "Figma" },
];

/** The console's own account notifications, offered alongside the verification events. */
const ACCOUNT_EVENTS: { type: string; title: string }[] = [
  { type: "account.low_balance", title: "Low balance" },
  { type: "account.payment_failed", title: "Payment failed" },
  { type: "account.live_key", title: "Live key created or revoked" },
  { type: "account.security_alert", title: "Security alert" },
  { type: "account.volume_anomaly", title: "Volume anomaly" },
];

/** The action each app runs when an event fires (the native "send" for that app). */
const DEFAULT_ACTION: Record<string, string> = {
  slack: "slack.send_message",
  microsoft_teams: "microsoft_teams.send_message",
  googlechat: "googlechat.send_message",
  discord: "discord.send_message",
  gmail: "gmail.send_email",
  googlesheets: "googlesheets.append_row",
  googledrive: "googledrive.create_file",
  figma: "figma.post_comment",
};

export function ConnectApps() {
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An app slug carried in from the /slack landing page (?connect=slack): start its
  // sign-in as soon as the overview has loaded, so the visitor lands mid-connect.
  const [autoConnect, setAutoConnect] = useState<string | null>(null);
  // The Google destination picked per app, held in the PARENT so it survives even if the events dialog is
  // ever remounted while the Google picker is open (belt-and-braces alongside the in-dialog state).
  const [destByApp, setDestByApp] = useState<Record<string, PickedFile>>({});

  const load = useCallback(() => {
    setLoading(true);
    integrationsApi
      .overview()
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load, attempt]);

  // Coming back from an app's sign-in: open its events popup, then tidy the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const failed = url.searchParams.get("connect_error");
    const toConnect = url.searchParams.get("connect");
    if (connected) setEditing(connected);
    if (failed) toast.error("That app could not be connected", "Please try again.");
    if (toConnect) setAutoConnect(toConnect);
    if (connected || failed || toConnect) {
      url.searchParams.delete("connected");
      url.searchParams.delete("connect_error");
      url.searchParams.delete("connect");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  // Act on `?connect=<app>` once the overview is in: if that app is already
  // connected, open its events popup; otherwise send the person to its sign-in.
  useEffect(() => {
    if (!autoConnect || !overview) return;
    const slug = autoConnect;
    setAutoConnect(null);
    const active = (overview.connections ?? []).find((c) => c.app === slug && c.status === "ACTIVE");
    if (active) {
      setEditing(slug);
      return;
    }
    integrationsApi
      .connect(slug)
      .then(({ redirect_url }) => window.location.assign(redirect_url))
      .catch((e) => toast.error("Could not start the connection", errText(e, "Please try again.")));
  }, [autoConnect, overview]);

  const apps = overview?.apps ?? {};
  const connected = useMemo(
    () => (overview?.connections ?? []).filter((c) => c.status === "ACTIVE"),
    [overview],
  );
  const connectedSet = useMemo(() => new Set(connected.map((c) => c.app)), [connected]);

  return (
    <div className="flex flex-col gap-4">
      {connected.length > 0 && (
        <SettingsCard className="p-0">
          <div className="flex flex-col">
            {connected.map((c) => {
              const auto = overview?.automations.find((a) => a.action.app === c.app);
              const events =
                auto && auto.trigger.kind === "verisec" ? auto.trigger.events.length : 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 border-b border-[#f0f0ed] px-5 py-3.5 last:border-b-0"
                >
                  <AppLogo slug={c.app} app={apps[c.app]} size={30} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium text-pine">
                      {apps[c.app]?.name ?? c.app}
                      {c.alias ? <span className="text-pine/50"> · {c.alias}</span> : null}
                    </span>
                    <span className="text-[13px] text-pine/55">
                      {events > 0 ? `Receiving ${events} event${events === 1 ? "" : "s"}` : "No events chosen yet"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(c.app)}
                    className={cn(button.secondary, "ml-auto h-8 px-3")}
                  >
                    <Pencil aria-hidden className="size-3.5" strokeWidth={1.8} />
                    Events
                  </button>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      )}

      <SettingsCard>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full flex-wrap items-center justify-between gap-4 text-left"
        >
          <span className="flex min-w-0 items-center gap-4">
            <StackedLogos apps={apps} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-medium text-pine">Connect more apps</span>
              <span className="max-w-[52ch] text-[14px] text-pine/60">
                Send verification alerts to Slack, Teams, Google Sheets and more. Connect an app, then
                choose what it receives.
              </span>
            </span>
          </span>
          <span className={cn(button.secondary, "pointer-events-none shrink-0")}>
            <Link2 aria-hidden className="size-4" strokeWidth={1.8} />
            Connect
          </span>
        </button>
      </SettingsCard>

      {loading ? null : (
        <AppPicker
          open={picking}
          onClose={() => setPicking(false)}
          connected={connectedSet}
          suggested={SUGGESTED}
          known={apps}
          onConnected={(slug) => {
            // A paste-URL app (Teams / Google Chat) just connected: reload and open its events.
            setAttempt((a) => a + 1);
            setEditing(slug);
          }}
        />
      )}

      {editing && (
        <EventsDialog
          app={editing}
          appInfo={apps[editing]}
          overview={overview}
          savedDest={destByApp[editing]}
          onDestChange={(d) => setDestByApp((m) => ({ ...m, [editing]: d }))}
          onClose={() => {
            setEditing(null);
            setAttempt((a) => a + 1);
          }}
        />
      )}
    </div>
  );
}

/** The app logos, overlapped horizontally with a small ring between them. */
function StackedLogos({ apps }: { apps: Record<string, AppInfo> }) {
  const slugs = SUGGESTED.slice(0, 6).map((s) => s.slug);
  return (
    <span className="flex shrink-0 items-center">
      {slugs.map((slug, i) => (
        <span
          key={slug}
          className={cn("rounded-[7px] bg-page ring-2 ring-page", i > 0 && "-ml-3.5")}
          style={{ zIndex: slugs.length - i }}
        >
          <AppLogo slug={slug} app={apps[slug]} size={28} />
        </span>
      ))}
    </span>
  );
}

/** The "which events should this app receive" popup. */
function EventsDialog({
  app,
  appInfo,
  overview,
  savedDest,
  onDestChange,
  onClose,
}: {
  app: string;
  appInfo?: AppInfo;
  overview: IntegrationsOverview | null;
  savedDest?: PickedFile;
  onDestChange?: (dest: PickedFile) => void;
  onClose: () => void;
}) {
  const name = appInfo?.name ?? app;
  const verification = overview?.events ?? [];
  const existing = overview?.automations.find((a) => a.action.app === app);
  const connection = (overview?.connections ?? []).find((c) => c.app === app && c.status === "ACTIVE");

  // Google Sheets and Drive need a destination (the exact sheet / folder). The person picks it with the
  // Google Picker, which authorises just that file under the non-sensitive drive.file scope.
  const isSheets = app === "googlesheets";
  const isDrive = app === "googledrive";
  const needsDestination = isSheets || isDrive; // Sheets requires one; Drive's folder is optional
  const destArgKey = isSheets ? "spreadsheet_id" : "folder_id";

  const initial = useMemo(
    () => new Set(existing && existing.trigger.kind === "verisec" ? existing.trigger.events : []),
    [existing],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dest, setDestState] = useState<PickedFile | null>(() => {
    if (savedDest) return savedDest;
    const args = existing?.action.arguments ?? {};
    const id = args[destArgKey];
    if (typeof id === "string" && id) return { id, name: typeof args.__dest_name === "string" ? args.__dest_name : id };
    return null;
  });
  // Keep the picked destination in the parent too, so it is never lost to a remount.
  const setDest = (file: PickedFile) => {
    setDestState(file);
    onDestChange?.(file);
  };

  const pickDestination = async () => {
    if (!pickerConfigured()) {
      toast.error("Not set up yet", "Google file picking isn't configured. Please try again later.");
      return;
    }
    setPicking(true);
    try {
      const file = await pickGoogleFile(isSheets ? "spreadsheet" : "folder");
      if (file) {
        setDest(file);
        toast.success(isSheets ? "Spreadsheet selected" : "Folder selected", file.name);
      }
    } catch (e) {
      toast.error("Couldn't open Google", errText(e, "Please try again."));
    } finally {
      setPicking(false);
    }
  };

  // Make a fresh spreadsheet in the person's Drive and use it as the destination (no Picker needed).
  const createSheet = async () => {
    if (!pickerConfigured()) {
      toast.error("Not set up yet", "Google isn't configured yet. Please try again later.");
      return;
    }
    setPicking(true);
    try {
      const file = await createGoogleSheet("VeriSec verification alerts");
      setDest(file);
      toast.success("Spreadsheet created", `"${file.name}" was created in your Google Drive.`);
    } catch (e) {
      toast.error("Couldn't create the sheet", errText(e, "Please try again."));
    } finally {
      setPicking(false);
    }
  };

  const toggle = (type: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  // Every event this app could receive (verification + account), for the Select all / Deselect all toggle.
  const allTypes = [...verification.map((e) => e.type), ...ACCOUNT_EVENTS.map((e) => e.type)];
  const allSelected = allTypes.length > 0 && allTypes.every((t) => selected.has(t));
  const toggleAll = () => setSelected(allSelected ? new Set<string>() : new Set(allTypes));

  const save = async () => {
    // Google Sheets must have a destination sheet; without it the append has nowhere to go.
    if (isSheets && !dest) {
      toast.error("Choose a spreadsheet", "Pick the Google Sheet VeriSec should write each row to.");
      return;
    }
    setSaving(true);
    try {
      const events = [...selected];
      // The picked destination travels on the action arguments (plus a friendly name so the UI can show it).
      const destArgs: Record<string, unknown> = {};
      if (needsDestination && dest) {
        destArgs[destArgKey] = dest.id;
        destArgs.__dest_name = dest.name;
        if (isSheets) destArgs.range = "Sheet1";
      }
      if (existing) {
        await integrationsApi.updateAutomation(existing.id, {
          events,
          ...(needsDestination ? { arguments: { ...(existing.action.arguments ?? {}), ...destArgs } } : {}),
        });
      } else {
        if (!connection) throw new Error("not_connected");
        await integrationsApi.createAutomation({
          name: `${name} alerts`,
          trigger: { kind: "verisec", events },
          action: {
            app,
            slug: DEFAULT_ACTION[app] ?? `${app}.send_message`,
            connection: connection.id,
            arguments: { text: "VeriSec {{event.type}} — {{data.id}} ({{data.verdict}})", ...destArgs },
          },
        });
      }
      toast.success(`${name} updated`, `Now receiving ${events.length} event${events.length === 1 ? "" : "s"}.`);
      onClose();
    } catch (e) {
      toast.error("Could not save", errText(e, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} labelledBy="events-title" width={620}>
      <div className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-center gap-3 border-b border-hairline p-6">
          <AppLogo slug={app} app={appInfo} size={34} />
          <div className="min-w-0 flex-1">
            <DialogHeader id="events-title" title={`What ${name} receives`} onClose={onClose} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {needsDestination ? (
            <div className="mb-5 flex flex-col gap-2 rounded-box border border-hairline bg-well/40 p-4">
              <h3 className="m-0 text-body font-medium text-pine">
                Destination{isDrive ? <span className="font-normal text-slate"> (optional)</span> : null}
              </h3>
              <p className="m-0 text-[13px] text-pine/60">
                {isSheets
                  ? "Pick the Google Sheet VeriSec appends a row to for each event, or create a new one."
                  : "Pick a Drive folder for the summary files. Left unset, they go to My Drive."}
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void pickDestination()}
                  disabled={picking}
                  className={cn(button.secondary, "h-9")}
                >
                  {picking ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.8} /> : null}
                  {dest ? (isSheets ? "Choose a different sheet" : "Change folder") : isSheets ? "Choose existing sheet" : "Choose folder"}
                </button>
                {isSheets ? (
                  <button
                    type="button"
                    onClick={() => void createSheet()}
                    disabled={picking}
                    className={cn(button.secondary, "h-9")}
                  >
                    Create a new sheet
                  </button>
                ) : null}
              </div>
              {dest ? (
                <div className="flex items-center gap-2 rounded-box border border-lime/60 bg-lime/15 px-3 py-2">
                  <Check aria-hidden className="size-4 shrink-0 text-pine" strokeWidth={2.4} />
                  <span className="min-w-0 truncate text-[13px] text-pine">
                    {isSheets ? "Writing to" : "Saving into"}: <span className="font-semibold">{dest.name}</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-0 mb-4 flex items-start justify-between gap-4">
            <p className="m-0 text-[14px] text-pine/60">
              Choose which events {name} should get. Each one arrives as a short message with the
              reference and outcome — never names, documents or photos.
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className={cn(button.secondary, "h-8 shrink-0 px-3 text-[13px]")}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <EventGroup label="Verifications" events={verification} selected={selected} onToggle={toggle} />
          <EventGroup label="Account" events={ACCOUNT_EVENTS} selected={selected} onToggle={toggle} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline p-6">
          <span className="text-[13px] text-pine/55">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={button.secondary}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className={button.primary}>
              {saving ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.8} /> : null}
              Save
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function EventGroup({
  label,
  events,
  selected,
  onToggle,
}: {
  label: string;
  events: { type: string; title: string }[];
  selected: Set<string>;
  onToggle: (type: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-wide text-pine/45 uppercase">{label}</h3>
      <div className="overflow-hidden rounded-box border border-hairline">
        {events.map((e) => (
          <label
            key={e.type}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-[#f0f0ed] bg-page px-4 py-3 last:border-b-0 hover:bg-hover-light"
          >
            <span className="text-[15px] text-pine">{e.title}</span>
            <Toggle
              on={selected.has(e.type)}
              busy={false}
              label={e.title}
              onChange={() => onToggle(e.type)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
