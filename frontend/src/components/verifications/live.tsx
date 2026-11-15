"use client";

/**
 * Live verification records from the Console API (stored encrypted; decrypted on the server
 * only for a signed-in operator, and every view is written to the access log).
 * The static export cannot pre-render records that do not exist at build time, so these load
 * in the browser: the list at /verifications, one record at /verifications/session?id=&tab=.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EyeOff, Loader2, LockKeyhole, ShieldOff } from "lucide-react";

import { VerificationDetailView } from "@/components/verifications/detail";
import { VerificationsList } from "@/components/verifications/list";
import { VERIFICATIONS_CHANGED } from "@/components/verifications/row-actions";
import { VerificationTabPanel } from "@/components/verifications/tabs";
import { useAccess } from "@/lib/access";
import { DEMO_VERIFICATIONS_LIST, DEMO_VERIFICATION_TABS } from "@/lib/console/demo-verifications";
import type { VerificationDetail, VerificationRow, VerificationTab, VerificationTabId, VerificationsListData } from "@/lib/console/types";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const TABS = DEMO_VERIFICATION_TABS as unknown as VerificationTab[];

type Load<T> = { state: "loading" } | { state: "signin" } | { state: "error"; message: string } | { state: "ready"; data: T };

async function getJson<T>(path: string): Promise<Load<T>> {
  try {
    const r = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store" });
    if (r.status === 401) return { state: "signin" };
    if (!r.ok) return { state: "error", message: r.status === 404 ? "This verification was not found." : "The records service is unavailable right now." };
    return { state: "ready", data: (await r.json()) as T };
  } catch {
    return { state: "error", message: "The records service is unreachable. Check that the Console API is running." };
  }
}

export function Card({ icon: Icon, title, children }: { icon: typeof Loader2; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-shell border border-edge bg-panel px-6 py-14 text-center">
      <Icon aria-hidden className={Icon === Loader2 ? "size-6 animate-spin text-muted" : "size-6 text-muted"} strokeWidth={1.7} />
      <p className="m-0 text-body font-medium text-pine">{title}</p>
      {children}
    </div>
  );
}

export function SignIn({ next }: { next: string }) {
  return (
    <Card icon={LockKeyhole} title="Sign in to view verifications">
      <p className="m-0 max-w-[420px] text-micro text-muted">Verification records hold personal data. They are only shown to signed-in operators, and every view is logged.</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="rounded-pill bg-lime px-4 py-2 text-micro font-medium text-pine">
        Sign in
      </Link>
    </Card>
  );
}

/* ------------------------------------------------------------------------ list -- */

type ListResponse = { total: number; live: number; rows: VerificationRow[] };

export function LiveVerificationsList() {
  const [load, setLoad] = useState<Load<ListResponse>>({ state: "loading" });
  useEffect(() => {
    const get = () => void getJson<ListResponse>("/api/verifications?size=100").then(setLoad);
    get();
    // a row was disabled, enabled or deleted: the list shows it at once
    window.addEventListener(VERIFICATIONS_CHANGED, get);
    return () => window.removeEventListener(VERIFICATIONS_CHANGED, get);
  }, []);

  if (load.state === "loading") return <Card icon={Loader2} title="Loading verifications" />;
  if (load.state === "signin") return <SignIn next="/verifications" />;
  if (load.state === "error") return <Card icon={ShieldOff} title={load.message} />;

  const data: VerificationsListData = {
    ...DEMO_VERIFICATIONS_LIST,
    liveCount: load.data.live,
    filters: [
      DEMO_VERIFICATIONS_LIST.filters[0]!,
      DEMO_VERIFICATIONS_LIST.filters[1]!,
      // the organisation's own workflows, as its verifications name them
      { name: "workflow", options: ["All workflows", ...[...new Set(load.data.rows.map((r) => r.workflow))].sort()] },
    ],
    rows: load.data.rows,
    pagination: { ...DEMO_VERIFICATIONS_LIST.pagination, rowsLabel: `${load.data.total} verification${load.data.total === 1 ? "" : "s"}`, pages: [1], current: 1 },
  };
  // an empty list keeps the page (title, New Session, filters); the table says there is nothing yet
  return <VerificationsList data={data} rowHref={(id) => `/verifications/session/?id=${encodeURIComponent(id)}`} />;
}

/* ---------------------------------------------------------------------- detail -- */

type LiveDetail = VerificationDetail & {
  status?: string;
  /** The tabs this verification's workflow has (absent: every tab). */
  tabs?: string[] | null;
  access?: { at: string; actor: string; action: string }[];
  /** The person's role does not reveal personal data: identifiers and images came back hidden. */
  masked?: boolean;
};

export function LiveVerificationDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const tab = ((params.get("tab") as VerificationTabId | null) ?? "overview") as VerificationTabId;
  const [load, setLoad] = useState<Load<LiveDetail>>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  // redacting is an Owner or Admin decision (the console refuses anyone else)
  const canRedact = useAccess().can("settings.manage");

  const refresh = useCallback(() => {
    if (id) void getJson<LiveDetail>(`/api/verifications/${encodeURIComponent(id)}`).then(setLoad);
  }, [id]);
  useEffect(refresh, [refresh]);

  const redact = async () => {
    if (!window.confirm("Redact this verification? Its personal data and files are destroyed permanently. This cannot be undone.")) return;
    setBusy(true);
    await fetch(`${API}/api/verifications/${encodeURIComponent(id)}/redact`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setBusy(false);
    refresh();
  };

  if (!id) return <Card icon={ShieldOff} title="No verification selected." />;
  if (load.state === "loading") return <Card icon={Loader2} title="Loading verification" />;
  if (load.state === "signin") return <SignIn next={`/verifications/session/?id=${id}`} />;
  if (load.state === "error") return <Card icon={ShieldOff} title={load.message} />;

  const record = load.data;
  const masked = record.masked ? (
    <span
      title="Your role sees the checks and the decision. Document numbers, dates of birth and images are hidden."
      className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-inert-tint px-3 text-micro font-medium text-inert"
    >
      <EyeOff aria-hidden className="size-4" strokeWidth={1.8} />
      Personal data hidden for your role
    </span>
  ) : null;
  const actions =
    record.status === "redacted" ? (
      <span className="rounded-pill bg-inert-tint px-3 py-1.5 text-micro text-inert">Redacted</span>
    ) : !canRedact ? (
      masked ?? <span />
    ) : (
      <span className="flex flex-wrap items-center gap-2">
      {masked}
      <button
        type="button"
        onClick={redact}
        disabled={busy}
        className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill border border-danger/40 px-3 text-micro font-medium text-danger transition-colors hover:bg-danger-tint disabled:opacity-60"
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ShieldOff aria-hidden className="size-4" strokeWidth={1.8} />}
        Redact personal data
      </button>
      </span>
    );

  return (
    <VerificationDetailView
      record={record}
      tabs={load.data.tabs ? TABS.filter((t) => load.data.tabs!.includes(t.id)) : TABS}
      current={tab}
      tabHref={(t) => `/verifications/session/?id=${encodeURIComponent(id)}&tab=${t}`}
      actions={actions}
    >
      <VerificationTabPanel tab={tab} record={record} />
      {tab === "timeline" && record.access?.length ? (
        <section className="flex flex-col gap-2 border-t border-hairline pt-4">
          <h3 className="m-0 text-body font-medium text-pine">Access log</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {record.access.map((a, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 text-micro text-muted">
                <span>
                  <span className="text-pine">{a.actor}</span> {a.action}
                </span>
                <span className="tnum">{a.at}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </VerificationDetailView>
  );
}
