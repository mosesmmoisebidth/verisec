import {
  ChevronRight,
  HeartPulse,
  IdCard,
  Link2,
  MailCheck,
  MapPin,
  MapPinHouse,
  MonitorSmartphone,
  Nfc as NfcIcon,
  Radio,
  ScanFace,
  ShieldAlert,
  ShieldQuestion,
  Smartphone,
  UserSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CheckGlyph } from "@/components/ui/component-icon";
import { ActivityTimeline, AttemptsCard, CrossMatchCard, NoAcceptedDocument } from "@/components/verifications/attempts";
import { ChannelAccordion } from "@/components/verifications/channel-accordion";
import { DetailGroups, FlagBadges } from "@/components/verifications/groups";
import {
  BandGauge,
  Card,
  CheckCard,
  EvidenceImage,
  FaceComparison,
  FieldTable,
  StatusBanner,
  AddressCard,
  IdentityHero,
  ProgressStepper,
  StatusMark,
  SummaryStrip,
  TrustBreakdown,
} from "@/components/verifications/evidence";
import { cn } from "@/lib/utils";
import {
  CaptureFrame,
  CheckPill,
  CodeChip,
  Facts,
  NotRun,
  OutcomeTag,
  SectionHeading,
  StatRow,
  Tile,
} from "@/components/verifications/parts";
import type {
  AddressTab,
  AmlTab,
  ContactTab,
  DeviceTab,
  DocumentTab,
  FaceTab,
  NfcTab,
  OverviewTab,
  VerificationDetail,
  VerificationTabId,
} from "@/lib/console/types";

/**
 * The nine tab panels of the verification detail.
 *
 * One `switch`, one body per tab, and every string arrives in the payload. A
 * tab whose payload is `null` did not run — it says so rather than drawing an
 * empty panel, because on this screen a blank AML result and a clean AML result
 * must never look alike.
 */
export function VerificationTabPanel({
  tab,
  record,
}: {
  tab: VerificationTabId;
  record: VerificationDetail;
}) {
  const empty = <EmptyTab tab={tab} record={record} />;
  switch (tab) {
    case "overview":
      return record.overview ? (
        <>
          <TeamChecks checks={record.seal.internalChecks} />
          <Overview data={record.overview} record={record} />
        </>
      ) : (
        empty
      );
    case "document":
      return record.document ? (
        <>
          <TeamChecks checks={record.seal.internalChecks} />
          <Document data={record.document} />
        </>
      ) : (
        empty
      );
    case "face":
      return record.face ? <Face data={record.face} /> : empty;
    case "nfc":
      return record.nfc ? <Nfc data={record.nfc} /> : empty;
    case "aml":
      return record.aml ? <Aml data={record.aml} /> : empty;
    case "device-ip":
      return record.deviceIp ? <Device data={record.deviceIp} /> : empty;
    case "contact":
      return record.contact ? <Contact data={record.contact} /> : empty;
    case "address":
      return record.address ? <Address data={record.address} /> : empty;
    case "timeline":
      return record.timeline ? <ActivityTimeline data={record.timeline} /> : empty;
  }
}

/**
 * One small line for the team: security checks that did not stop the result (the barcode was read and the front and
 * back match) but are worth a look. The checks still ran and took a little off the score.
 */
function TeamChecks({ checks }: { checks?: string[] }) {
  if (!checks?.length) return null;
  return (
    <p role="note" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-pill border border-caution/30 bg-caution-tint/40 px-3 py-1.5 text-micro text-pine">
      <ShieldAlert aria-hidden className="size-3.5 shrink-0 text-caution" strokeWidth={2} />
      <span className="font-medium">
        {checks.length === 1 ? "1 check" : `${checks.length} checks`} for your team: {checks.join(", ")}
      </span>
      <span className="text-slate">(the barcode was read and the front and back match)</span>
    </p>
  );
}

/**
 * A tab whose check did not run, said for that tab: the chip was not scanned, nothing was
 * uploaded, or the check did not run. A redacted record says its data was destroyed instead,
 * because there the check may well have run.
 */
function EmptyTab({ tab, record }: { tab: VerificationTabId; record: VerificationDetail }) {
  if (record.progress?.state === "redacted") return <NotRun art="check" title="Redacted" label={record.emptyLabel} />;
  if (tab === "nfc") return <NotRun art="nfc" title="Chip not scanned" label="The chip in the document has not been read." />;
  if (tab === "address") return <NotRun art="upload" title="Nothing uploaded" label="No proof of address has been uploaded." />;
  return <NotRun art="check" title="Check not run" label={record.emptyLabel} />;
}

/* ----------------------------------------------------------------------------
   Overview, Desktop-33
---------------------------------------------------------------------------- */

/**
 * The icon for a check, chosen for what the check looks at: the ID card, the face scan, a live
 * pulse, the phone, a confirmed mailbox, a person searched against lists, the device, the home
 * address, the chip. Falls back to a neutral shield for a check this list does not know.
 */
function checkIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes("address")) return MapPinHouse;
  if (l.includes("document")) return IdCard;
  if (l.includes("liveness")) return HeartPulse;
  if (l.includes("face")) return ScanFace;
  if (l.includes("phone")) return Smartphone;
  if (l.includes("email")) return MailCheck;
  if (l.includes("watchlist") || l.includes("aml") || l.includes("screen")) return UserSearch;
  if (l.includes("device")) return MonitorSmartphone;
  if (l.includes("nfc") || l.includes("chip")) return NfcIcon;
  return ShieldQuestion;
}

const OUTCOME_WORD: Record<string, string> = { pass: "Passed", fail: "Failed", review: "Review", pending: "Not run" };

function Overview({ data, record }: { data: OverviewTab; record: VerificationDetail }) {
  const seal = record.seal;
  const unfinished = record.progress && record.progress.state !== "completed" && record.progress.state !== "redacted";
  return (
    <div className="flex flex-col gap-4">
      {unfinished && record.progress ? <ProgressStepper progress={record.progress} /> : null}

      <section className="flex flex-col gap-2">
        <SectionHeading>{data.checksTitle}</SectionHeading>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {data.checks.map((check) => {
            const Icon = checkIcon(check.label);
            return (
              <li key={check.label} className="flex items-center gap-2.5 rounded-box border border-hairline bg-page px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-panel text-pine">
                  <Icon aria-hidden className="size-4" strokeWidth={1.8} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 text-micro leading-[15px] font-medium text-pine" title={check.label}>{check.label}</span>
                  <span className={cn("text-[11px]", check.outcome === "pass" ? "text-ramp-2" : check.outcome === "fail" ? "text-danger" : check.outcome === "review" ? "text-caution" : "text-inert")}>
                    {OUTCOME_WORD[check.outcome]}
                  </span>
                </span>
                <StatusMark outcome={check.outcome} />
              </li>
            );
          })}
        </ul>
      </section>

      {seal.breakdown?.length ? (
        <TrustBreakdown parts={seal.breakdown} score={seal.score} raw={seal.raw} rule={seal.provisional ? undefined : seal.rule} policy={seal.policy} provisional={!!seal.provisional} />
      ) : null}

      <Card title={data.factsTitle}>
        <Facts facts={data.facts} columns={3} />
      </Card>
      {data.flags && (
        <section className="flex flex-col gap-2">
          <SectionHeading>Flags</SectionHeading>
          <FlagBadges flags={data.flags} />
        </section>
      )}
      <DetailGroups groups={data.groups} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Document, Desktop-51
---------------------------------------------------------------------------- */

function Document({ data }: { data: DocumentTab }) {
  const tries = data.attempts ?? [];
  // every upload so far was refused: what was expected and what came instead, never an empty document
  if (data.accepted === false)
    return (
      <div className="flex flex-col gap-4">
        <NoAcceptedDocument attempts={tries} />
        <AttemptsCard title="Upload attempts" attempts={tries} />
      </div>
    );
  // more than one upload, or one refused: all of them, the refused ones in red
  const showTries = tries.length > 1 || tries.some((t) => !t.ok || t.warn);
  // live records carry the grouped fields; the older shape falls through to the plain layout below
  if (data.fieldGroups) {
    const mrzLines = data.mrz?.lines.filter(Boolean) ?? [];
    const groups = data.fieldGroups
      .map((g) => ({ ...g, fields: mrzLines.length ? g.fields.filter((f) => !/^mrz strings?$/i.test(f.label)) : g.fields }))
      .filter((g) => g.fields.length);
    return (
      <div className="flex flex-col gap-4">
        <IdentityHero fields={groups.find((g) => g.title === "Personal")?.fields ?? []} portrait={data.portrait} country={data.country} />
        {data.summary?.length ? <SummaryStrip items={data.summary} /> : null}
        {/* a single-page document (passport) gets the full width; a card shows front and back side by side */}
        <div className={cn("grid gap-3", data.captures.length > 1 && "sm:grid-cols-2")}>
          {data.captures.map((c) => (
            <EvidenceImage key={c.label} label={c.label} image={c.image} hidden={c.hidden} height={data.captures.length > 1 ? "h-44" : "h-56"} />
          ))}
        </div>
        <CrossMatchCard data={data.crossMatch} />
        {showTries ? <AttemptsCard title="Upload attempts" attempts={tries} /> : null}
        {groups.length ? (
          groups.map((g) => <FieldTable key={g.title} title={g.title} fields={g.fields} />)
        ) : (
          <NotRun label="No fields were read from this document." />
        )}
        {mrzLines.length ? (
          <Card title="Machine-readable zone" aside={data.mrz?.format ?? undefined}>
            <pre className="m-0 overflow-x-auto rounded-well bg-pine px-3.5 py-3 font-mono text-[12.5px] leading-[20px] tracking-[1.5px] text-lime">
              {mrzLines.join("\n")}
            </pre>
          </Card>
        ) : null}
        {data.checkGroups?.length ? (
          // two columns that fill independently: a short card sits right under the one above it,
          // never leaving a gap beside a tall neighbour
          <div className="columns-1 gap-3 xl:columns-2">
            {data.checkGroups.map((g) => (
              <div key={g.title} className="mb-3 break-inside-avoid">
                <CheckCard title={g.title} checks={g.checks} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {data.captures.map((c) => (
          <CaptureFrame key={c.label} {...c} />
        ))}
      </div>

      <FlagBadges flags={data.flags} />

      <section className="flex flex-col gap-4">
        <SectionHeading>{data.fieldsTitle}</SectionHeading>
        <Facts facts={data.fields} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>{data.metricsTitle}</SectionHeading>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.metrics.map((m) => (
            <CheckPill key={m.label} {...m} />
          ))}
        </div>
      </section>
      <DetailGroups groups={data.groups} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Face, Desktop-52
---------------------------------------------------------------------------- */

function Face({ data }: { data: FaceTab }) {
  const sim = data.similarity;
  const live = data.liveness.tag === "Live person" ? "pass" : data.liveness.tag === "Not run" ? "pending" : "fail";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {data.captures.map((c) => (
          <EvidenceImage key={c.label} label={c.label} image={c.image} hidden={c.hidden} height="h-56" />
        ))}
      </div>

      {(data.attempts?.length ?? 0) > 1 || data.attempts?.some((t) => !t.ok) ? <AttemptsCard title="Face check attempts" attempts={data.attempts} /> : null}

      <FlagBadges flags={data.flags} />

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Card title="Face match">
          {sim.score != null && sim.bands ? (
            <BandGauge value={sim.score} decline={sim.bands.decline} review={sim.bands.review} label={sim.label} />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="text-body text-pine">{sim.label}</span>
              <span className="tnum text-nav font-medium text-pine">{sim.value}</span>
            </div>
          )}
        </Card>
        <Card title="Liveness" aside={data.liveness.tag}>
          <div className="flex items-start gap-3">
            <StatusMark outcome={live} className="size-8" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body font-medium text-pine">{data.liveness.label}</span>
              <span className="text-micro text-muted">{data.liveness.detail}</span>
            </span>
          </div>
        </Card>
      </div>

      {data.spoof.length > 0 && (
      <section className="flex flex-col gap-3">
        <SectionHeading>{data.spoofTitle}</SectionHeading>
        {/* Bars, not a chart: four independent 0–100 confidences that do not sum
            to anything, so stacking or a donut would invent a whole they are not
            parts of. */}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {data.spoof.map((bar, i) => (
            <li key={bar.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-body text-pine">{bar.label}</span>
                <span className="tnum text-micro text-muted">{bar.value}</span>
              </div>
              <div
                role="meter"
                aria-label={bar.label}
                aria-valuenow={bar.value}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-pill bg-well"
              >
                <span
                  className={RAMP[Math.min(i, RAMP.length - 1)]}
                  style={{ display: "block", height: "100%", width: `${bar.value}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
      )}

      {data.comparison ? <FaceComparison data={data.comparison} /> : null}
      {/* the comparison and liveness cards already say the threshold and the check used */}
      {data.attributes.length && !data.comparison ? (
        <SummaryStrip items={data.attributes.map((a) => ({ label: a.term, value: a.detail }))} />
      ) : null}
      {(data.groups ?? []).map((g) =>
        g.facts?.length && !g.checks?.length && !g.raw ? (
          <Card key={g.title} title={g.title}>
            <Facts facts={g.facts} columns={3} />
          </Card>
        ) : (
          <DetailGroups key={g.title} groups={[g]} />
        ),
      )}
    </div>
  );
}

/** One ordered ramp, darkest first, so no two adjacent bars fight. */
const RAMP = ["bg-ramp-3", "bg-ramp-4", "bg-ramp-5", "bg-ramp-6"];

/* ----------------------------------------------------------------------------
   NFC, Desktop-53
---------------------------------------------------------------------------- */

function Nfc({ data }: { data: NfcTab }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-box border border-lime/20 bg-lime-wash px-2.5 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-pine text-lime">
          <Radio aria-hidden className="size-3.5" strokeWidth={1.8} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-body font-medium text-pine">{data.banner.title}</span>
          <span className="text-micro text-muted">{data.banner.detail}</span>
        </span>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeading>{data.checksTitle}</SectionHeading>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {data.checks.map((c) => (
            <CheckPill key={c.label} {...c} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.certificates.map((cert) => (
          <Tile key={cert.title} className="flex flex-col gap-3">
            <h4 className="m-0 text-body font-medium text-pine">{cert.title}</h4>
            <dl className="m-0 flex flex-col gap-2">
              {cert.rows.map((row) => (
                <div key={row.term} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-micro text-muted">{row.term}</dt>
                  <dd className="m-0 min-w-0 truncate text-right text-micro text-pine">
                    {row.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </Tile>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   AML, Desktop-54
---------------------------------------------------------------------------- */

function Aml({ data }: { data: AmlTab }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-box border border-hairline bg-page p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <span className="flex max-w-[46ch] flex-col gap-1">
          <span className="text-body font-medium text-pine">{data.notice.title}</span>
          <span className="text-body text-slate">{data.notice.body}</span>
        </span>
        <span className="shrink-0 self-start rounded-pill bg-lime-tint px-2 py-0.5 text-micro font-medium text-pine">
          {data.notice.tag}
        </span>
      </div>

      <FlagBadges flags={data.flags} />

      {/* Dim and inert on purpose when there is no live result. These are the
          screens the product will run, not results it has, drawing them live
          would put five clear findings on a compliance record that has none. */}
      {!data.groups && (
      <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-3">
        {data.screens.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-center gap-2 rounded-box border border-hairline bg-page px-2.5 py-2.5 text-body text-inert opacity-60"
          >
            <CheckGlyph icon={s.icon} className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{s.label}</span>
          </li>
        ))}
      </ul>
      )}

      <DetailGroups groups={data.groups} />

      {data.matches && data.matches.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading>List entries compared ({data.matches.length})</SectionHeading>
          {data.matches.map((m) => (
            <details
              key={m.title}
              className={cn(
                "group rounded-box border bg-page",
                m.status === "confirmed" ? "border-danger/40" : m.status === "possible" ? "border-caution/40" : "border-hairline",
              )}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" strokeWidth={2} />
                  <span className="min-w-0 truncate text-body font-medium text-pine">{m.title}</span>
                </span>
                <OutcomeTag outcome={m.status === "confirmed" ? "fail" : m.status === "possible" ? "review" : "pass"} />
              </summary>
              <div className="flex flex-col gap-4 border-t border-hairline p-3 sm:p-4">
                <DetailGroups groups={m.groups} />
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Device & IP, Desktop-55
---------------------------------------------------------------------------- */

function Device({ data }: { data: DeviceTab }) {
  return (
    <div className="flex flex-col gap-6">
      {data.facts.length ? (
        <Card>
          <Facts facts={data.facts} columns={3} />
        </Card>
      ) : null}
      {data.flags && (
        <section className="flex flex-col gap-2">
          <SectionHeading>Flags</SectionHeading>
          <FlagBadges flags={data.flags} />
        </section>
      )}
      {data.reasons && data.reasons.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading>What raised the risk score</SectionHeading>
          {data.reasons.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 rounded-box border border-hairline bg-page px-2.5 py-2.5">
              <span className="text-body text-pine">{r.label}</span>
              <span className="tnum shrink-0 rounded-pill bg-caution-tint px-2 py-0.5 text-micro font-medium text-caution">+{r.points}</span>
            </div>
          ))}
        </section>
      )}
      {data.devices?.map((d) => (
        <Card key={d.title} title={d.title} bodyClass="flex flex-col gap-4">
          <DetailGroups groups={d.groups} />
        </Card>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Contact Information, Desktop-56
---------------------------------------------------------------------------- */

function Contact({ data }: { data: ContactTab }) {
  return (
    <div className="flex flex-col gap-4">
      {/* The summary bar. Five figures and the reason codes that produced them,
          on one row, so the decision and its evidence are never a scroll apart. */}
      <div className="flex flex-col gap-3 rounded-card border border-pine/15 bg-page p-4">
        <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
          {data.metrics.map((m) => (
            <span key={m.label} className="flex flex-col gap-0.5 pr-6 not-last:border-r not-last:border-rule">
              <span className="text-micro tracking-[0.4px] text-muted uppercase">{m.label}</span>
              <span className="tnum text-nav font-medium text-pine">{m.value}</span>
            </span>
          ))}
          <span className="flex flex-col gap-1">
            <span className="text-micro tracking-[0.4px] text-muted uppercase">{data.risk.label}</span>
            <span className="w-fit rounded-pill bg-lime px-2 py-0.5 text-micro font-medium text-pine">
              {data.risk.value}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-micro tracking-[0.4px] text-muted uppercase">
              {data.decision.label}
            </span>
            <span className="w-fit rounded-pill bg-pine px-2 py-0.5 text-micro font-medium text-lime">
              {data.decision.value}
            </span>
          </span>
        </div>

        {data.reasons?.length ? (
          <ReasonChips reasons={data.reasons} />
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {data.reasonCodes.map((code) => (
              <li key={code}>
                <CodeChip>{code}</CodeChip>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.channels.map((channel) => (
          <ChannelAccordion key={channel.title} channel={channel} />
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading>{data.consistency.title}</SectionHeading>
        {/* Two across, not the frame's three. At the card's real width three
            cells leave ~45px for a label like "Phone country", which truncates
            to "Pho…", a consistency check that cannot be read is not one. */}
        {data.consistency.pairs.some((p) => p.outcome) ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.consistency.pairs.map((pair) => (
              <li
                key={`${pair.left.label}-${pair.right.label}`}
                className="grid items-center gap-x-3 gap-y-2 rounded-box border border-hairline bg-page p-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,11rem)]"
              >
                <PairValue label={pair.left.label} value={pair.leftValue} />
                <Link2 aria-hidden className="size-3.5 shrink-0 text-muted max-sm:hidden" strokeWidth={2} />
                <PairValue label={pair.right.label} value={pair.rightValue} />
                <span className="flex items-center gap-2">
                  <StatusMark outcome={pair.outcome ?? "pending"} />
                  <span className={cn("text-micro font-medium", OUTCOME_TEXT[pair.outcome ?? "pending"])}>{pair.note}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {data.consistency.pairs.map((pair) => (
              <li
                key={`${pair.left.label}-${pair.right.label}`}
                className="flex items-center gap-2 rounded-box border border-hairline bg-page p-2"
              >
                <Side {...pair.left} />
                <Link2 aria-hidden className="size-3.5 shrink-0 text-lime" strokeWidth={2} />
                <Side {...pair.right} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>{data.velocity.title}</SectionHeading>
        {data.velocity.rows.some((r) => r.note) ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-hairline overflow-hidden rounded-box border border-hairline bg-page p-0">
            {data.velocity.rows.map((row) => (
              <li key={row.label} className="flex items-center gap-3 px-3 py-2.5">
                <StatusMark outcome={row.outcome ?? "pending"} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body text-pine">{row.label}</span>
                  {row.note ? <span className="text-micro break-words text-muted">{row.note}</span> : null}
                </span>
                <span className="tnum shrink-0 text-[18px] leading-none font-medium text-pine">{row.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.velocity.rows.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>{data.explain.title}</SectionHeading>
        <div className="flex flex-col gap-3 rounded-box border border-hairline bg-page p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-pine px-2.5 py-0.5 text-micro font-medium text-lime">
              {data.explain.verdictTag}
            </span>
            <span className="rounded-pill bg-lime px-2.5 py-0.5 text-micro font-medium text-pine">
              {data.explain.riskTag}
            </span>
          </div>
          <p className="m-0 max-w-[70ch] text-body text-pine">{data.explain.summary}</p>
          {data.reasons?.length ? (
            <ReasonChips reasons={data.reasons} />
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {data.explain.codes.map((code) => (
                <li key={code} className="rounded-pill bg-pass-tint px-2.5 py-0.5 text-micro font-medium text-ramp-2">
                  {code}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

const OUTCOME_TEXT: Record<string, string> = { pass: "text-ramp-2", review: "text-caution", fail: "text-danger", pending: "text-muted" };

/** One side of a consistency pair: what it is and its value (or that nobody recorded it). */
function PairValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 rounded-well bg-panel px-2.5 py-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      {value ? (
        <span className="text-body font-medium break-words text-pine [overflow-wrap:anywhere]">{value}</span>
      ) : (
        <span className="text-body text-muted italic">Not available</span>
      )}
    </span>
  );
}

const REASON_TONE: Record<string, string> = {
  pass: "bg-pass-tint text-ramp-2",
  warn: "bg-caution-tint text-caution",
  fail: "bg-danger-tint text-danger",
  na: "bg-inert-tint text-inert",
};

/** Contact signals in plain words, each coloured by what it means. */
function ReasonChips({ reasons }: { reasons: { label: string; tone: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {reasons.map((r) => (
        <li key={r.label} className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium", REASON_TONE[r.tone] ?? REASON_TONE.na)}>
          <span aria-hidden className="size-1.5 rounded-pill bg-current" />
          {r.label}
        </li>
      ))}
    </ul>
  );
}

function Side({ label, icon }: ContactTab["consistency"]["pairs"][number]["left"]) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-well bg-panel px-2 py-1.5">
      <CheckGlyph icon={icon} className="size-3.5 shrink-0 text-muted" />
      <span className="min-w-0 truncate text-micro text-pine">{label}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Address, Desktop-57
---------------------------------------------------------------------------- */

function Address({ data }: { data: AddressTab }) {
  const poa = data.poa;
  if (poa) {
    return (
      <div className="flex flex-col gap-4">
        <StatusBanner {...poa.status} />
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {data.documents.map((doc) => (
            <EvidenceImage key={doc.label} label={doc.label} image={doc.image} hidden={doc.hidden} height="h-64" />
          ))}
          <AddressCard {...poa.address} />
        </div>
        {poa.document.length ? (
          <SummaryStrip items={poa.document.map((f) => ({ label: f.term, value: f.detail }))} />
        ) : null}
        {poa.checks.length ? <CheckCard title="What was checked" checks={poa.checks} /> : null}
        {poa.details.length ? (
          <Card title="Read from the document" aside={`${poa.details.length} item${poa.details.length === 1 ? "" : "s"}`}>
            <dl className="m-0 grid gap-2 sm:grid-cols-2">
              {poa.details.map((d, i) => (
                <div key={`${d.label}-${i}`} className={cn("flex min-w-0 flex-col gap-0.5 rounded-well bg-panel px-2.5 py-2", d.value.length > 42 && "sm:col-span-2")}>
                  <dt className="text-[11px] text-muted">{d.label}</dt>
                  <dd className="m-0 text-body font-medium text-pine [overflow-wrap:anywhere]">{d.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
        {poa.reviewer.length ? <CheckCard title="Reviewer checks (never shown to the applicant)" checks={poa.reviewer} /> : null}
        {poa.integrity.length ? (
          <Card title="Document integrity">
            <Facts facts={poa.integrity} columns={2} />
          </Card>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        {data.documents.map((doc) => (
          <EvidenceImage key={doc.label} label={doc.label} image={doc.image} hidden={doc.hidden} height="h-56" />
        ))}
        <Card title={data.address.label}>
          <p className="m-0 flex items-start gap-2 text-body text-pine">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} />
            {data.address.value || "No address confirmed"}
          </p>
        </Card>
      </div>

      {data.facts.length ? (
        <Card title="Checks on the document">
          <Facts facts={data.facts} />
        </Card>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Timeline, Desktop-58
---------------------------------------------------------------------------- */

/* drawn by ActivityTimeline (attempts.tsx): day by day, every try with its image and result */

