/**
 * The console dashboard, computed from what really happened in the period: the organisation's
 * verification records (decrypted in memory; only counts leave this module), the API calls the
 * console timed (MetricsService) and the platform health checks. Nothing is sampled or stored
 * here, and an empty period reads as zero, never as an invented figure.
 */
import { networkFlags } from './anonymizer';
import { isPublic, rescoreDeviceSection } from './device.score';
import type { RecordMeta, RecordSections } from './records.service';
import { scoreOf, verdictOf } from './verifications.view';
import type { ScorePolicy } from './workflows';

type Any = Record<string, any>;
export type CallRow = {
  method: string;
  route: string;
  status: number;
  ms: number;
  at: Date;
  /** The workflow of the verification the call served (applicant calls); none for API-key calls. */
  workflowId?: string | null;
};
export type ProbeRow = {
  at: Date;
  ok: boolean;
  ms: number;
  down: string | null;
};
type Rec = { meta: RecordMeta; data: RecordSections };

export const DAY = 86_400_000;
const PROBE_EVERY = 60_000;
/** No health check for this long means the API itself was offline. */
const GAP = 150_000;

/** The calls that ARE checks, named as the operator knows them. */
const CHECK_ROUTES: Record<string, string> = {
  'POST /api/kyc/idv/read': 'Document read',
  'POST /api/kyc/face/match': 'Face match',
  'POST /api/kyc/screen': 'Watchlist screening',
  'POST /api/kyc/poa/analyze': 'Proof of address',
  'POST /api/kyc/device': 'Device & IP',
  'POST /api/kyc/phone/check': 'Phone check',
  'POST /api/kyc/email/check': 'Email check',
};

/** The connection categories, in the order the panel draws them. */
const CONNECTIONS = [
  'Residential',
  'Mobile',
  'Corporate',
  'Datacenter',
  'VPN',
  'Proxy',
  'Tor',
] as const;

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const hourKey = (t: number) =>
  new Date(t).toISOString().slice(5, 13).replace('T', ' ') + ':00';

/** Nearest-rank percentile of an ascending list. */
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    )
  ];
}
const median = (xs: number[]) =>
  xs.length
    ? pct(
        [...xs].sort((a, b) => a - b),
        50,
      )
    : null;
const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

function top(counts: Map<string, number>, n = 5) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}
const bump = (m: Map<string, number>, k: string, by = 1) =>
  m.set(k, (m.get(k) ?? 0) + by);

/** How the applicant was connected, from the device check's network facts. */
function connectionOf(
  dev: Any | undefined,
): (typeof CONNECTIONS)[number] | null {
  const ip = (dev?.ip ?? {}) as Any;
  const rtc = (dev?.webrtc ?? {}) as Any;
  const kind = String(ip.connectionType ?? '').toLowerCase();
  // a local or private network (development, an internal proxy): nothing to report, and a
  // different public address seen through WebRTC means nothing there (the device check agrees)
  if (kind === 'private' || !isPublic(ip.address)) return null;
  const n = networkFlags(ip);
  if (n.tor || rtc.leakedTor) return 'Tor';
  if (n.vpn) return 'VPN';
  if (ip.privateRelay || rtc.leakedIp) return 'Proxy';
  if (n.datacenter || kind === 'hosting' || kind === 'datacenter')
    return 'Datacenter';
  if (kind === 'mobile' || kind === 'cellular') return 'Mobile';
  if (
    [
      'business',
      'corporate',
      'enterprise',
      'education',
      'government',
      'organization',
    ].includes(kind)
  )
    return 'Corporate';
  if (['isp', 'residential', 'broadband', 'fixed'].includes(kind))
    return 'Residential';
  return null; // an unknown kind of network: not counted
}

/** A verdict to count (a redacted record that never got one has no outcome). */
function outcomeOf(meta: RecordMeta) {
  if (meta.status === 'redacted' && !meta.verdict) return null;
  return verdictOf(meta);
}

/** Uptime over [from, to) from the minute-by-minute health checks, and the incidents in it. */
function uptimeOf(probes: ProbeRow[], from: number, to: number) {
  const ps = probes
    .filter((p) => +p.at >= from && +p.at < to)
    .sort((a, b) => +a.at - +b.at);
  if (!ps.length)
    return {
      percent: null as number | null,
      incidents: [] as { start: string; minutes: number; note: string }[],
    };
  let down = 0;
  const spans: { start: number; end: number; why: string }[] = [];
  for (let k = 0; k < ps.length; k++) {
    const at = +ps[k].at;
    const next =
      k + 1 < ps.length ? +ps[k + 1].at : Math.min(to, at + PROBE_EVERY);
    const slot = Math.min(next - at, PROBE_EVERY); // the time this check speaks for
    if (!ps[k].ok) {
      down += slot;
      spans.push({
        start: at,
        end: at + slot,
        why: ps[k].down || 'A service check failed',
      });
    }
    if (next - at > GAP) {
      down += next - at - PROBE_EVERY;
      spans.push({ start: at + PROBE_EVERY, end: next, why: 'API offline' });
    }
  }
  const total = Math.min(to, +ps[ps.length - 1].at + PROBE_EVERY) - +ps[0].at;
  const merged: typeof spans = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && last.why === s.why && s.start - last.end <= PROBE_EVERY)
      last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return {
    percent: total > 0 ? Math.max(0, 1 - down / total) * 100 : null,
    incidents: merged
      .reverse()
      .slice(0, 5)
      .map((s) => ({
        start: new Date(s.start).toISOString(),
        minutes: Math.max(1, Math.round((s.end - s.start) / 60_000)),
        note: s.why,
      })),
  };
}

export function dashboardOf(i: {
  days: number;
  now: number;
  /** UTC midnight of the first day in the period. */
  start: number;
  /** Verifications created in the period, newest first. */
  current: Rec[];
  /** Other people seen on each completed verification's device (the device check's rule). */
  otherPeople: Map<string, number>;
  /** Each verification's workflow policy, when it has one. */
  policies?: Map<string, ScorePolicy>;
  /** The period before, from plain columns. */
  prev: { total: number; approved: number; decided: number };
  /** API calls from the start of the period before. */
  calls: CallRow[];
  probes: ProbeRow[];
  /** The period's webhook messages by outcome (none when the organisation has no endpoint). */
  webhooks?: { delivered: number; retried: number; failed: number } | null;
  /** Workflow names by id (the organisation's own). */
  workflowNames?: Map<string, string>;
}) {
  const { days, now, start, current } = i;
  const prevStart = start - days * DAY;
  const dates = Array.from({ length: days }, (_, k) => dayKey(start + k * DAY));

  /* ---- verifications ---- */
  const outcomes = {
    approved: 0,
    review: 0,
    declined: 0,
    abandoned: 0,
    inProgress: 0,
  };
  const perDay = new Map(dates.map((d) => [d, { total: 0, approved: 0 }]));
  const failing = new Map<string, number>();
  const declines = new Map<string, number>();
  const connections = new Map<string, number>();
  let mismatched = 0;
  let compared = 0;
  let decided = 0;
  const completion: number[] = [];
  let oldestWaiting: number | null = null;

  for (const { meta, data } of current) {
    const v = outcomeOf(meta);
    const day = perDay.get(dayKey(+new Date(meta.created_at)));
    if (day) {
      day.total += 1;
      if (v === 'Approved') day.approved += 1;
    }
    if (v === 'Approved') outcomes.approved += 1;
    else if (v === 'Needs review') outcomes.review += 1;
    else if (v === 'Declined') outcomes.declined += 1;
    else if (v === 'Abandoned') outcomes.abandoned += 1;
    else if (v === 'In progress') outcomes.inProgress += 1;
    if (v === 'Needs review' || v === 'In progress') {
      const age = now - +new Date(meta.created_at);
      oldestWaiting = Math.max(oldestWaiting ?? 0, age);
    }

    if (meta.status === 'completed') {
      if (v === 'Approved' || v === 'Needs review' || v === 'Declined')
        decided += 1;
      if (meta.completed_at)
        completion.push(
          +new Date(meta.completed_at) - +new Date(meta.created_at),
        );
      const s = scoreOf(data, i.otherPeople.get(meta.id) ?? 0, i.policies?.get(meta.id) ?? null);
      for (const p of s.parts)
        // failed, sent to review, or required but never ran
        if (p.knockout || p.review || p.score === null) bump(failing, p.label);
      if (s.reviews.includes('Proof of address needs review'))
        bump(failing, 'Proof of address');
      if (v === 'Declined') for (const k of s.knockouts) bump(declines, k);
    }

    const dev = data.device;
    if (dev) {
      const c = connectionOf(dev);
      if (c) bump(connections, c);
      const risk = rescoreDeviceSection(dev, i.otherPeople.get(meta.id) ?? 0)
        .risk as Any | null;
      const isMismatch =
        Array.isArray(risk?.reasons) &&
        risk.reasons.some((x: Any) => x?.code === 'country_mismatch');
      if (isMismatch) mismatched += 1;
      if (
        isMismatch ||
        typeof (dev.consistency as Any | undefined)?.documentMatchesIp ===
          'boolean'
      )
        compared += 1;
    }
  }

  /* ---- API calls ---- */
  const cur = i.calls.filter((c) => +new Date(c.at) >= start);
  const before = i.calls.filter(
    (c) => +new Date(c.at) >= prevStart && +new Date(c.at) < start,
  );
  const msCur = cur.map((c) => c.ms);

  const bucket = (key: (t: number) => string) => {
    const m = new Map<string, number[]>();
    for (const c of cur) {
      const k = key(+new Date(c.at));
      (m.get(k) ?? m.set(k, []).get(k)!).push(c.ms);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, xs]) => {
        const s = xs.sort((a, b) => a - b);
        return { label, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99) };
      });
  };
  // a day per point once there are two days of calls; until then, an hour per point
  let latency = bucket(dayKey);
  let latencyUnit: 'day' | 'hour' = 'day';
  if (latency.length < 2) {
    latency = bucket(hourKey);
    latencyUnit = 'hour';
  }

  const errorsPerDay = dates.map((d) => {
    const xs = cur.filter((c) => dayKey(+new Date(c.at)) === d);
    const n = xs.length || 1;
    return {
      date: d,
      calls: xs.length,
      c4xx:
        Math.round(
          (xs.filter((c) => c.status >= 400 && c.status < 500).length / n) *
            1000,
        ) / 10,
      c5xx:
        Math.round((xs.filter((c) => c.status >= 500).length / n) * 1000) / 10,
    };
  });

  const byRoute = new Map<string, CallRow[]>();
  for (const c of cur) {
    const k = `${c.method} ${c.route}`;
    (byRoute.get(k) ?? byRoute.set(k, []).get(k)!).push(c);
  }
  const endpoints = [...byRoute.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([key, xs]) => {
      const s = xs.map((x) => x.ms).sort((a, b) => a - b);
      const [method, route] = key.split(' ');
      return {
        method: method,
        path: route.replace(/^\/api/, ''),
        calls: xs.length,
        p50: pct(s, 50),
        p95: pct(s, 95),
        p99: pct(s, 99),
        c4xx:
          (xs.filter((x) => x.status >= 400 && x.status < 500).length /
            xs.length) *
          100,
        c5xx: (xs.filter((x) => x.status >= 500).length / xs.length) * 100,
      };
    });

  const checkCalls = cur.filter((c) => CHECK_ROUTES[`${c.method} ${c.route}`]);
  const checkMs = checkCalls.map((c) => c.ms).sort((a, b) => a - b);
  const perCheck = new Map<string, number[]>();
  for (const c of checkCalls) {
    const label = CHECK_ROUTES[`${c.method} ${c.route}`];
    (perCheck.get(label) ?? perCheck.set(label, []).get(label)!).push(c.ms);
  }
  const slowestChecks = [...perCheck.entries()]
    .map(([label, xs]) => ({ label, avgMs: mean(xs)! }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 5);

  const uptimeNow = uptimeOf(i.probes, start, now + 1);
  const uptimeBefore = uptimeOf(i.probes, prevStart, start);

  return {
    days,
    from: new Date(start).toISOString(),
    generatedAt: new Date(now).toISOString(),
    kpis: {
      verifications: { value: current.length, prev: i.prev.total },
      passRate: {
        value: decided ? (outcomes.approved / decided) * 100 : null,
        prev: i.prev.decided ? (i.prev.approved / i.prev.decided) * 100 : null,
      },
      medianMs: { value: median(msCur), prev: median(before.map((c) => c.ms)) },
      uptime: { value: uptimeNow.percent, prev: uptimeBefore.percent },
    },
    volume: dates.map((d) => ({ date: d, ...perDay.get(d)! })),
    outcomes: { total: current.length, ...outcomes },
    failingChecks: top(failing),
    declineReasons: top(declines),
    connections: CONNECTIONS.map((label) => ({
      label,
      count: connections.get(label) ?? 0,
    })),
    ipMismatch: { mismatched, compared },
    latency: { unit: latencyUnit, points: latency },
    errors: { calls: cur.length, points: errorsPerDay },
    uptime: uptimeNow,
    webhooks: i.webhooks ?? { delivered: 0, retried: 0, failed: 0 },
    // one row per workflow that ran in the period: uses, its calls' latency, time from link to result
    workflows: perWorkflow(current, cur, i.workflowNames),
    workflowOptions: [...(i.workflowNames ?? new Map<string, string>()).entries()].map(([id, name]) => ({ id, name })),
    endpoints,
    queues: {
      unfinished: outcomes.inProgress,
      abandoned: outcomes.abandoned,
      flagged: outcomes.review,
      oldestWaitingMs: oldestWaiting,
    },
    workflow: {
      uses: current.length,
      avgMs: mean(msCur),
      p95Ms: msCur.length
        ? pct(
            [...msCur].sort((a, b) => a - b),
            95,
          )
        : null,
      avgCompletionMs: mean(completion),
    },
    processing: checkMs.length
      ? { p50: pct(checkMs, 50), p95: pct(checkMs, 95), p99: pct(checkMs, 99) }
      : null,
    completionMedianMs: median(completion),
    slowestChecks,
    activity: current
      .filter((r) => outcomeOf(r.meta))
      .slice(0, 8)
      .map(({ meta, data }) => {
        const raw: unknown = data.identity?.name;
        const name = typeof raw === 'string' ? raw.trim() : '';
        return {
          id: meta.id,
          name: name || null,
          ref: meta.reference,
          workflow: meta.workflow_id ? (i.workflowNames?.get(meta.workflow_id) ?? null) : null,
          score:
            meta.status === 'completed' && typeof meta.score === 'number'
              ? meta.score
              : null,
          verdict: outcomeOf(meta)!,
        };
      }),
  };
}

export type DashboardMetrics = ReturnType<typeof dashboardOf>;

function perWorkflow(current: Rec[], calls: CallRow[], names?: Map<string, string>) {
  const runs = new Map<string, { uses: number; completion: number[] }>();
  for (const { meta } of current) {
    const k = meta.workflow_id ?? '';
    const w = runs.get(k) ?? runs.set(k, { uses: 0, completion: [] }).get(k)!;
    w.uses += 1;
    if (meta.status === 'completed' && meta.completed_at) w.completion.push(+new Date(meta.completed_at) - +new Date(meta.created_at));
  }
  const ms = new Map<string, number[]>();
  for (const c of calls) if (c.workflowId) (ms.get(c.workflowId) ?? ms.set(c.workflowId, []).get(c.workflowId)!).push(c.ms);
  return [...runs.entries()]
    .map(([id, w]) => {
      const xs = [...(ms.get(id) ?? [])].sort((a, b) => a - b);
      return {
        id: id || null,
        name: id ? (names?.get(id) ?? 'A deleted workflow') : 'Before workflows',
        uses: w.uses,
        avgMs: mean(xs),
        p95Ms: xs.length ? pct(xs, 95) : null,
        avgCompletionMs: mean(w.completion),
      };
    })
    .sort((a, b) => b.uses - a.uses);
}
