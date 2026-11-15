"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LockKeyhole, ShieldOff } from "lucide-react";

import { Dashboard } from "@/components/dashboard/dashboard";
import { Card } from "@/components/verifications/live";
import { toast } from "@/components/ui/toast";
import { ALL_WORKFLOWS, downloadExport, fetchDashboard, RANGE_DAYS, toDashboardData, type Loaded } from "@/lib/console/live-dashboard";
import type { DashboardData } from "@/lib/console/types";

/**
 * The dashboard, live: the frame's layout and copy (`copy`), filled with what the Console API
 * measured for the signed-in organisation. The date range refetches; the last-sync line ages
 * in place; Export downloads the period's verifications.
 */
export function LiveDashboard({ copy }: { copy: DashboardData }) {
  const [range, setRange] = useState(copy.header.ranges[0] ?? "Last 30 days");
  const days = RANGE_DAYS[range] ?? 30;
  const [load, setLoad] = useState<Loaded | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [exporting, setExporting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // the workflow filter: by name on screen, by id to the console
  const [workflow, setWorkflow] = useState(ALL_WORKFLOWS);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const workflowId = options.find((o) => o.name === workflow)?.id ?? null;

  useEffect(() => {
    let live = true;
    void fetchDashboard(days, workflowId).then((r) => {
      if (live && r.state === "ready" && r.data.workflowOptions) setOptions(r.data.workflowOptions);
      if (!live) return;
      setLoad(r);
      setNow(Date.now());
    });
    return () => {
      live = false;
    };
  }, [days, attempt, workflowId]);

  // "Last Sync" keeps telling the truth while the page stays open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const onExport = useCallback(async () => {
    setExporting(true);
    const ok = await downloadExport(days);
    setExporting(false);
    if (!ok) toast.error("Couldn't export", "Please try again in a moment.");
  }, [days]);

  if (!load) return <Card icon={Loader2} title="Loading dashboard" />;
  if (load.state === "signin") return <Card icon={LockKeyhole} title="Sign in to view your dashboard" />;
  if (load.state === "error")
    return (
      <Card icon={ShieldOff} title={load.message}>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-pill bg-lime px-4 py-2 text-micro font-medium text-pine"
        >
          Try again
        </button>
      </Card>
    );

  return (
    <Dashboard
      data={toDashboardData(load.data, copy, now)}
      controls={{ range, onRange: setRange, onExport, exporting, workflow, onWorkflow: setWorkflow }}
    />
  );
}
