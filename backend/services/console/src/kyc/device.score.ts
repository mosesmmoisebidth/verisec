import { networkFlags } from './anonymizer';

/**
 * Device & IP risk points (IPQS / Castle / Sumsub practice).
 *
 * A VPN on its own never declines anyone: it adds a little risk and the other checks decide.
 * iCloud Private Relay, mobile carriers (CGNAT) and corporate networks score 0.
 *   0-29 allow · 30-59 step-up · 60-84 manual review · 85+ block
 *
 * Some signals are proof of cheating rather than a likelihood ("hard"): a capture taken with a
 * virtual camera, an automated browser, an emulator, a hijacked-network address. Only those
 * may decline a verification on their own (Trust Seal); everything else adds up to a review.
 *
 * Tor hides the connection, like a VPN: it asks for a face check (a workflow rule) and never declines or reviews on
 * its own. Tor Browser also reports UTC and English and leaves from a random exit, so on a Tor connection those
 * mismatches and the network of the exit are not counted again.
 */
export type Reason = {
  code: string;
  points: number;
  label: string;
  hard?: boolean;
};

export type ScoreInput = {
  /** A virtual camera was USED for a capture (installed alone is not a signal). */
  virtualCamera: boolean | null;
  automation: boolean;
  emulator: boolean;
  virtualMachine: boolean;
  tampering: number; // count of overridden browser functions / properties
  tor: boolean;
  torBehindWebrtc: boolean; // the connection is clean but WebRTC revealed a Tor exit address
  vpn: boolean;
  datacenter: boolean;
  privateRelay: boolean;
  blocklisted: boolean;
  webrtcLeak: boolean; // a different public IP seen through WebRTC (proxy / VPN split tunnel)
  tzMismatch: boolean | null;
  docCountryMismatch: boolean | null;
  langMismatch: boolean | null;
  platformMismatch: boolean;
  incognito: boolean | null;
  /** Other PEOPLE (a different name) seen on this browser; the same person's own sessions never count. */
  sameDevice: number;
  sameFingerprint: number;
};

export function scoreDevice(s: ScoreInput) {
  const r: Reason[] = [];
  const add = (
    on: unknown,
    code: string,
    points: number,
    label: string,
    hard = false,
  ) => on && r.push({ code, points, label, ...(hard ? { hard } : {}) });
  add(
    s.virtualCamera,
    'virtual_camera',
    60,
    'A virtual camera was used for the capture',
    true,
  );
  const reuse = Math.max(s.sameDevice, s.sameFingerprint);
  add(
    reuse >= 3,
    'device_reuse_high',
    50,
    `Same device used by ${reuse} other people`,
  );
  add(
    reuse >= 1 && reuse < 3,
    'device_reuse',
    30,
    `Same device used by ${reuse} other ${reuse > 1 ? 'people' : 'person'}`,
  );
  add(s.automation, 'automation', 40, 'Automated or headless browser', true);
  add(s.emulator, 'emulator', 40, 'Device emulator', true);
  add(s.virtualMachine, 'virtual_machine', 40, 'Virtual machine');
  add(s.tampering > 0, 'tampering', 20, 'Browser properties have been altered');
  add(s.tor, 'tor', 35, 'Connection through Tor');
  add(
    !s.tor && s.torBehindWebrtc,
    'tor',
    35,
    'Tor exit address revealed through WebRTC',
  );
  add(
    s.blocklisted,
    'blocklist',
    25,
    'Address on a hijacked-network blocklist',
    true,
  );
  add(
    s.webrtcLeak,
    'proxy_leak',
    25,
    'Real address differs from the connection (proxy)',
  );
  add(
    !s.tor && s.tzMismatch,
    'timezone_mismatch',
    15,
    'Device time zone does not match the IP country',
  );
  add(
    s.platformMismatch,
    'platform_mismatch',
    15,
    'Browser reports a different operating system than its headers',
  );
  add(
    !s.tor && !s.privateRelay && (s.vpn || s.datacenter),
    s.vpn ? 'vpn' : 'datacenter',
    10,
    s.vpn ? 'VPN connection' : 'Hosting or data-centre network',
  );
  add(
    !s.tor && s.docCountryMismatch,
    'country_mismatch',
    5,
    'IP country differs from the document country',
  );
  add(
    !s.tor && s.langMismatch,
    'language_mismatch',
    2,
    'Browser languages do not include the IP country',
  );
  add(s.incognito, 'incognito', 3, 'Private browsing window');
  const score = Math.min(
    100,
    r.reduce((a, x) => a + x.points, 0),
  );
  const action =
    score >= 85
      ? 'block'
      : score >= 60
        ? 'review'
        : score >= 30
          ? 'step_up'
          : 'allow';
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return {
    score,
    level,
    action,
    reasons: r.sort((a, b) => b.points - a.points),
  };
}

export type DeviceRisk = ReturnType<typeof scoreDevice>;
type Any = Record<string, any>;

const PRIVATE =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe[89ab])/i;
export const isPublic = (ip: unknown) =>
  typeof ip === 'string' && ip.length > 0 && !PRIVATE.test(ip);
const o = (v: unknown): Any => (v && typeof v === 'object' ? v : {});

/**
 * One saved device report scored again with today's rules, from what the report itself kept:
 * the browser's own signals (raw), the connection, WebRTC and the consistency checks. Used for
 * every decision and every view, so a rule fixed later applies to verifications already stored.
 * `otherPeople` is the number of different people (by name) seen on this device.
 */
export function rescoreReport(rep: Any, otherPeople: number): DeviceRisk {
  const raw = o(rep.raw);
  const integ = o(raw.integrity);
  const cap = o(integ.capture);
  const env = o(integ.environment);
  const ip = o(rep.ip);
  const rtc = o(rep.webrtc);
  const c = o(rep.consistency);
  const relay = !!ip.privateRelay;
  // a different public address is only meaningful when the connection itself was public:
  // on a local or private network (development, an internal proxy) there is nothing to compare
  const leak = !!rtc.leakedIp && isPublic(ip.address) && !relay;
  const n = networkFlags(ip);
  return scoreDevice({
    virtualCamera: cap.virtualCameraUsed === true,
    automation: env.automationDetected === true,
    emulator: env.emulator === true,
    virtualMachine: env.virtualMachine === true,
    tampering: Array.isArray(env.tampering) ? env.tampering.length : 0,
    tor: n.tor,
    torBehindWebrtc: leak && !!rtc.leakedTor,
    vpn: n.vpn,
    datacenter: n.datacenter,
    privateRelay: relay,
    blocklisted: !!ip.blocklisted,
    webrtcLeak: leak,
    tzMismatch: c.timeZoneMatchesIp === false,
    docCountryMismatch: c.documentMatchesIp === false,
    langMismatch: c.languageMatchesIp === false,
    platformMismatch: c.platformMatches === false,
    incognito: o(raw.storage).incognitoSuspected === true,
    sameDevice: otherPeople,
    sameFingerprint: otherPeople,
  });
}

/**
 * The device section scored again: every device the applicant used, and the worst of them as
 * the section's risk. Returns the section with its risks replaced (for display) and the worst risk.
 */
export function rescoreDeviceSection(
  dev: Any | null | undefined,
  otherPeople: number,
): { section: Any | null; risk: DeviceRisk | null } {
  if (!dev) return { section: null, risk: null };
  const devices = o(dev.devices);
  const keys = Object.keys(devices);
  const rescored: Record<string, Any> = {};
  for (const k of keys)
    rescored[k] = {
      ...devices[k],
      risk: rescoreReport(devices[k], otherPeople),
    };
  const top = rescoreReport(dev, otherPeople);
  const all = [
    top,
    ...Object.values(rescored).map((d) => d.risk as DeviceRisk),
  ];
  const worst = all.reduce((w, r) => (r.score > w.score ? r : w), top);
  return {
    section: {
      ...dev,
      risk: worst,
      ...(keys.length ? { devices: rescored } : {}),
    },
    risk: worst,
  };
}
