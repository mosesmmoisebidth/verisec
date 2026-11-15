import { useEffect, useState, type CSSProperties } from "react";
import { Loader2, Search } from "lucide-react";

import { toast } from "@/components/ui/toast";
import type { AppInfo } from "@/lib/console/integrations-api";
import { integrationsApi } from "@/lib/console/integrations-api";
import { cn } from "@/lib/utils";

import { AppLogo, button, Dialog, DialogHeader, errText, field, Pill } from "./parts";

/**
 * "Connect an app": Composio's catalogue, searchable. Connecting sends the person to the
 * app's own sign-in page (through Composio) and back to /integrations?connected=<app>.
 */
export function AppPicker({
  open,
  onClose,
  connected,
  suggested,
  known,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  /** Apps this organisation already has an active account for. */
  connected: Set<string>;
  /** The home page's apps, shown first. */
  suggested: { slug: string; name: string }[];
  /** Apps whose name and logo the page already has. */
  known: Record<string, AppInfo>;
  /** Called after a paste-URL app (Teams / Google Chat) is connected, with its slug. */
  onConnected?: (slug: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="app-picker-title" width={760}>
      <PickerBody onClose={onClose} connected={connected} suggested={suggested} known={known} onConnected={onConnected} />
    </Dialog>
  );
}

/** How a paste-URL app is explained in its connect form. */
const PASTE_HELP: Record<string, { label: string; placeholder: string; hint: string }> = {
  microsoft_teams: {
    label: "Teams webhook URL",
    placeholder: "https://prod-NN.westus.logic.azure.com:443/workflows/…",
    hint: "In Teams, create a Workflow (or Incoming Webhook) on your channel with the “Post to a channel when a webhook request is received” template, then paste its HTTP POST URL here.",
  },
  googlechat: {
    label: "Google Chat webhook URL",
    placeholder: "https://chat.googleapis.com/v1/spaces/…",
    hint: "In your Google Chat space, open Apps & integrations → Webhooks → Add webhook, then paste its URL here. (Needs a Google Workspace account.)",
  },
};

const count = (n: number, one: string) => `${n.toLocaleString("en")} ${one}${n === 1 ? "" : "s"}`;

function PickerBody({
  onClose,
  connected,
  suggested,
  known,
  onConnected,
}: {
  onClose: () => void;
  connected: Set<string>;
  suggested: { slug: string; name: string }[];
  known: Record<string, AppInfo>;
  onConnected?: (slug: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [paste, setPaste] = useState<{ slug: string; name: string } | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteSaving, setPasteSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AppInfo[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [going, setGoing] = useState<string | null>(null);

  // A short pause after typing before searching.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    integrationsApi
      .apps(query || undefined)
      .then((r) => {
        if (!live) return;
        setItems(r.items);
        setNext(r.next);
        setTotal(r.total);
        setError(null);
      })
      .catch((e: unknown) => {
        if (live) setError(errText(e, "The app list could not be loaded."));
      });
    return () => {
      live = false;
    };
  }, [query]);

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try {
      const r = await integrationsApi.apps(query || undefined, next);
      setItems((list) => [...(list ?? []), ...r.items.filter((a) => !list?.some((b) => b.slug === a.slug))]);
      setNext(r.next);
    } catch (e) {
      toast.error("More apps could not be loaded", errText(e, "Try again."));
    } finally {
      setMore(false);
    }
  };

  const connect = async (slug: string, name: string) => {
    // Teams / Google Chat are connected by pasting a webhook URL, not a one-click sign-in.
    const info = known[slug] ?? items?.find((a) => a.slug === slug);
    if (info?.connect === "webhook_url" || info?.connect === "bot_token") {
      setPasteValue("");
      setPaste({ slug, name });
      return;
    }
    setGoing(slug);
    try {
      const { redirect_url } = await integrationsApi.connect(slug);
      window.location.assign(redirect_url);
    } catch (e) {
      setGoing(null);
      toast.error(`${name} could not be connected`, errText(e, "Try again."));
    }
  };

  const savePaste = async () => {
    if (!paste || !pasteValue.trim()) return;
    setPasteSaving(true);
    try {
      await integrationsApi.connectManual(paste.slug, pasteValue.trim());
      const slug = paste.slug;
      setPaste(null);
      onClose();
      onConnected?.(slug);
    } catch (e) {
      toast.error(`${paste.name} could not be connected`, errText(e, "Check the URL and try again."));
    } finally {
      setPasteSaving(false);
    }
  };

  const shownSuggested = query ? [] : suggested;

  if (paste) {
    const help = PASTE_HELP[paste.slug] ?? { label: "Webhook URL", placeholder: "https://…", hint: "Paste the webhook URL for this app." };
    return (
      <div className="flex max-h-[calc(100dvh-34px)] flex-col">
        <div className="flex flex-col gap-3 border-b border-edge p-6 pb-4">
          <DialogHeader id="app-picker-title" title={`Connect ${paste.name}`} onClose={onClose} />
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-start gap-3">
            <AppLogo app={known[paste.slug]} slug={paste.slug} size={40} />
            <p className="m-0 text-body text-slate">{help.hint}</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-micro font-medium text-pine">{help.label}</span>
            <input
              type="url"
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder={help.placeholder}
              autoComplete="off"
              className={cn(field, "h-10 border-lime")}
              style={{ "--tw-ring-color": "var(--color-lime)" } as CSSProperties}
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setPaste(null)} className={button.secondary}>
              Back
            </button>
            <button
              type="button"
              onClick={() => void savePaste()}
              disabled={pasteSaving || !pasteValue.trim()}
              className={button.primary}
            >
              {pasteSaving ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} /> : null}
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[calc(100dvh-34px)] flex-col">
      <div className="flex flex-col gap-3 border-b border-edge p-6 pb-4">
        <DialogHeader id="app-picker-title" title="Connect an app" onClose={onClose} />
        <p className="m-0 text-body text-slate">
          You sign in on the app&rsquo;s own page. VeriSec never sees your password, and you can disconnect at any time.
        </p>
        <label className="relative block">
          <span className="sr-only">Search apps</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" strokeWidth={2} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={total ? `Search ${total.toLocaleString("en")} apps` : "Search apps"}
            autoComplete="off"
            className={cn(field, "h-10 border-lime pl-9")}
            // inline so it wins over `field`'s focus-visible:ring-pine: the focus ring is lime, not dark
            style={{ "--tw-ring-color": "var(--color-lime)" } as CSSProperties}
          />
        </label>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto p-6 pt-4">
        {shownSuggested.length ? (
          <section className="flex flex-col gap-2.5">
            <h3 className="m-0 text-micro font-medium text-slate">On the VeriSec home page</h3>
            <div className="flex flex-wrap gap-2">
              {shownSuggested.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  disabled={going !== null}
                  onClick={() => (connected.has(s.slug) ? toast.success(`${s.name} is already connected`) : void connect(s.slug, s.name))}
                  className="inline-flex h-10 items-center gap-2 rounded-pill border border-hairline bg-page pr-4 pl-2 text-body text-pine hover:bg-hover-light disabled:opacity-60"
                >
                  {going === s.slug ? <Loader2 aria-hidden className="size-6 animate-spin p-1" strokeWidth={2} /> : <AppLogo app={known[s.slug] ?? items?.find((a) => a.slug === s.slug)} slug={s.slug} size={24} />}
                  {s.name}
                  {connected.has(s.slug) ? <Pill tone="ok">Connected</Pill> : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          {shownSuggested.length ? <h3 className="m-0 text-micro font-medium text-slate">All apps</h3> : null}
          {error ? (
            <p className="m-0 rounded-box border border-dashed border-edge px-4 py-5 text-center text-body text-danger">{error}</p>
          ) : !items ? (
            <p className="m-0 flex items-center justify-center gap-2 rounded-box border border-dashed border-edge px-4 py-8 text-body text-inert">
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
              Please wait…
            </p>
          ) : items.length === 0 ? (
            <p className="m-0 rounded-box border border-dashed border-edge px-4 py-5 text-center text-body text-inert">No app matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
              {items.map((app) => (
                <li key={app.slug} className="flex items-start gap-3 rounded-shell border border-hairline bg-panel p-3">
                  <AppLogo app={app} slug={app.slug} size={32} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-medium text-pine">{app.name}</span>
                      {connected.has(app.slug) ? <Pill tone="ok">Connected</Pill> : null}
                    </span>
                    <span className="line-clamp-2 text-micro text-slate">{app.description}</span>
                    <span className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-micro text-inert">
                        {count(app.actions, "action")}
                        {app.triggers ? ` · ${count(app.triggers, "event")}` : ""}
                      </span>
                      {app.auth === "own" ? (
                        <span className="text-micro text-slate" title="VeriSec has to add its own sign-in for this app in Composio first.">
                          Not available yet
                        </span>
                      ) : app.auth === "none" ? (
                        <span className="text-micro text-slate">No sign-in needed</span>
                      ) : (
                        <button
                          type="button"
                          disabled={going !== null}
                          onClick={() => void connect(app.slug, app.name)}
                          className={cn(button.primary, "h-8 px-3 text-micro")}
                        >
                          {going === app.slug ? <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} /> : null}
                          {connected.has(app.slug) ? "Add another account" : "Connect"}
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {next && items?.length ? (
            <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(button.secondary, "self-center")}>
              {more ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} /> : null}
              Show more
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
