import Link from "next/link";

import { CreateKeyDialog } from "@/components/api-keys/create-key-dialog";
import { KeysTable } from "@/components/api-keys/keys-table";
import { SdksPanel } from "@/components/api-keys/logs-sdks";
import { FinApiPlayground } from "@/components/finance/api-playground/playground";
import { LiveLogs } from "@/components/finance/live-logs";
import { SampleMarker } from "@/components/finance/parts";
import { API_KEYS } from "@/lib/finance/content";
import type { FinApiTabId } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/**
 * API Keys & Logs. The keys table is the console's own component; the keys in
 * it are samples (as on the KYC console) until key management exists, and the
 * screen says so. The API Playground runs every MICR and card API live. Logs are
 * live: every call the MICR and Card APIs served.
 */
export function FinApiKeysScreen({ current }: { current: FinApiTabId }) {
  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{API_KEYS.title}</h1>
            {current === "keys" ? <SampleMarker /> : null}
          </div>
          {current === "keys" ? <CreateKeyDialog form={API_KEYS.keys.create} label={API_KEYS.createLabel} /> : null}
        </div>

        <nav aria-label={API_KEYS.title} className="w-fit max-w-full overflow-hidden rounded-[14px] bg-[#f4f4f2]">
          <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {API_KEYS.tabs.map((tab) => {
              const active = tab.id === current;
              return (
                <Link
                  key={tab.id}
                  href={tab.id === "keys" ? "/fin/api-keys" : `/fin/api-keys/${tab.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative shrink-0 px-5 py-3.5 text-[15px] whitespace-nowrap transition-colors",
                    active ? "bg-[image:var(--gradient-tab)] font-semibold text-pine" : "font-normal text-[#9a9a9a] hover:text-pine",
                  )}
                >
                  {tab.label}
                  {tab.badge ? (
                    <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-pill bg-lime/35 px-2 py-0.5 text-[11px] leading-4 font-medium text-pine">
                      {tab.badge}
                    </span>
                  ) : null}
                  {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-lime" /> : null}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {current === "keys" ? <KeysTable data={API_KEYS.keys} /> : null}
      {current === "playground" ? <FinApiPlayground keyLabel={API_KEYS.playground.keyLabel} manageKeysHref={API_KEYS.playground.manageKeysHref} /> : null}
      {current === "logs" ? <LiveLogs /> : null}
      {current === "sdks" ? <SdksPanel data={API_KEYS.sdks} /> : null}
    </div>
  );
}
