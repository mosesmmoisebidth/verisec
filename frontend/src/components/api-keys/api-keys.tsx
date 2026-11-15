import { FlaskConical } from "lucide-react";

import { KeysWorkspace } from "@/components/api-keys/keys-workspace";
import { LiveLogs } from "@/components/api-keys/live-logs";
import { SdksPanel } from "@/components/api-keys/logs-sdks";
import { ApiTabStrip, Undesigned } from "@/components/api-keys/parts";
import { Playground } from "@/components/api-keys/playground";
import type { ApiKeysData, ApiTabId } from "@/lib/console/types";

/**
 * API Keys & Playground — Desktop-44 · 45 · 46 · 47, one screen per tab.
 *
 * The header's Create button appears on the keys tab only, which is where the
 * frames put it: Desktop-45 and its siblings draw the title and the strip and
 * nothing else.
 */
export function ApiKeysScreen({
  data,
  current,
  isDemo,
}: {
  data: ApiKeysData;
  current: ApiTabId;
  isDemo: boolean;
}) {
  // The keys tab is live (the key service through the console): no sample marker, and its own Create button.
  if (current === "keys") {
    return (
      <KeysWorkspace
        title={<h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>}
        tabs={<ApiTabStrip tabs={data.tabs} current={current} />}
        createLabel={data.createLabel}
      />
    );
  }
  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>
            {/* the Playground and the Logs are live (real APIs, real calls): only the tabs still on sample data carry the marker */}
            {isDemo && current !== "playground" && current !== "logs" ? <SampleMarker /> : null}
          </div>
        </div>

        <ApiTabStrip tabs={data.tabs} current={current} />
      </header>

      <Panel data={data} current={current} />
    </div>
  );
}

function Panel({ data, current }: { data: ApiKeysData; current: ApiTabId }) {
  const undesigned = <Undesigned title={data.emptyTitle} body={data.emptyBody} />;

  switch (current) {
    case "keys":
      return undesigned;
    case "playground":
      return data.playground ? <Playground data={data.playground} /> : undesigned;
    case "logs":
      return data.logs ? <LiveLogs demo={data.logs} /> : undesigned;
    case "sdks":
      return data.sdks ? <SdksPanel data={data.sdks} /> : undesigned;
  }
}

/**
 * "Sample data".
 *
 * This screen needs the marker more than any other in the console: it is a wall
 * of things shaped exactly like live credentials, and an operator who reads
 * `sk_live_9f3c…c4d2` as one of their own keys will go looking for where it
 * came from. Renders from `IS_DEMO_DATA`, the same single flag the applicant
 * flow uses — flip that and this disappears.
 *
 * `/dashboard` and `/verifications` still need one of these.
 */
function SampleMarker() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-caution-tint px-2.5 py-1 text-micro font-medium text-caution">
      <FlaskConical aria-hidden className="size-3.5" strokeWidth={1.8} />
      Sample data
    </span>
  );
}
