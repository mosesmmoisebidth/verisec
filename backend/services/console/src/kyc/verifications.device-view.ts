import { networkFlags } from './anonymizer';
import { isPublic } from './device.score';

/**
 * The Device & IP tab for a live record: a Didit-style summary per device, then every piece
 * of evidence (full IP intelligence, consistency, integrity, and each group of browser
 * signals), then the raw data. Built on the server from the decrypted record; never stored.
 */
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fact = { term: string; detail: string; mono?: boolean };
type Outcome = 'pass' | 'fail' | 'review' | 'pending';
type Check = { label: string; outcome: Outcome; note?: string };
type Group = { title: string; facts?: Fact[]; checks?: Check[]; raw?: string; collapsed?: boolean };
export type Flag = { label: string; severity: 'info' | 'warn' | 'critical' };

const when = (d: string | undefined) => (d ? new Date(d).toLocaleString('en-US') : '');
const val = (v: unknown) => (v === null || v === undefined || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
const f = (term: string, v: unknown, mono = false): Fact | null => (val(v) ? { term, detail: val(v)!, ...(mono ? { mono } : {}) } : null);
const list = (xs: (Fact | null | false | undefined)[]) => xs.filter(Boolean) as Fact[];
const label = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const check = (lbl: string, bad: unknown, note?: string, unknown = false): Check => ({
  label: lbl,
  outcome: unknown ? 'pending' : bad ? 'fail' : 'pass',
  ...(note ? { note } : {}),
});

/** Every leaf of an object as a fact ("screen.width" -> "Screen width"). */
export function flatten(o: unknown, prefix = '', out: Fact[] = []): Fact[] {
  if (o === null || o === undefined) return out;
  if (typeof o !== 'object' || Array.isArray(o)) {
    const v = Array.isArray(o) ? o.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : String(o);
    if (v !== '') out.push({ term: label(prefix) || 'Value', detail: v.slice(0, 400) });
    return out;
  }
  for (const [k, v] of Object.entries(o as Any)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const tzOffset = (m: unknown) => (typeof m === 'number' ? `${m >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}${String(Math.abs(m) % 60).padStart(2, '0')}` : '');

function deviceGroups(dev: Any): Group[] {
  const ip = (dev.ip ?? {}) as Any;
  const d = (dev.device ?? {}) as Any;
  const ses = (dev.session ?? {}) as Any;
  const c = (dev.consistency ?? {}) as Any;
  const h = (dev.headers ?? {}) as Any;
  const rtc = (dev.webrtc ?? {}) as Any;
  const raw = (dev.raw ?? {}) as Any;
  const cap = (raw.integrity?.capture ?? {}) as Any;
  const env = (raw.integrity?.environment ?? {}) as Any;
  const where = [ip.city, ip.region, ip.country].filter(Boolean).join(', ');
  const n = networkFlags(ip);
  // a network check that did not run says so (and why); it is never shown as a pass
  const why = isPublic(ip.address)
    ? 'The network lookup was unavailable'
    : 'Local or private connection address, so the network was not looked up';
  const owner = ip.asn ? ` (AS${ip.asn}${ip.isp ? `, ${ip.isp}` : ''})` : '';
  const anon = [
    n.tor ? 'Tor' : null,
    n.vpn ? 'VPN' : null,
    rtc.leakedTor ? 'Tor (real address via WebRTC)' : null,
    rtc.leakedVpn ? 'VPN (real address via WebRTC)' : null,
  ].filter(Boolean).join(', ');
  const noCam = cap.virtualCameraSuspected == null;
  // on a Tor connection Tor Browser sets these itself (UTC, English, a random exit): shown, never counted (device.score)
  const onTor = (note: string | undefined, why: string) => (n.tor ? [note, `not counted on Tor: ${why}`].filter(Boolean).join('; ') : note);

  const { integrity: _i, fingerprint, webrtc: _w, ...signals } = raw;
  const pick = (k: string) => (signals[k] && typeof signals[k] === 'object' ? flatten(signals[k]) : []);
  const scalars = Object.fromEntries(Object.entries(signals).filter(([, v]) => v === null || typeof v !== 'object' || Array.isArray(v)));

  return [
    {
      title: 'Summary',
      facts: list([
        f('IP', ip.address ? `${ip.address}${where ? ` (${where})` : ''}` : null, true),
        f('Device platform', raw.platform ?? d.type),
        f('Device brand', d.brand),
        f('Device model', d.model),
        f('Device OS', [d.os, d.osVersion].filter(Boolean).join(' ')),
        f('Device browser', [d.browser, d.browserVersion].filter(Boolean).join(' ')),
        f('Device ISP', ip.isp),
        f('Device fingerprint', ses.fingerprint, true),
        {
          term: 'VPN/Tor • Data center',
          detail:
            n.checked || anon || n.datacenter
              ? `VPN/Tor: ${anon || 'No'} • Data center: ${n.datacenter ? ip.cloudProvider ?? 'Yes' : 'No'}`
              : 'Not checked (the network was not looked up)',
        },
        f('User agent', h.userAgent),
        f('Accept language', h.acceptLanguage),
        f('Session identifier', ses.id, true),
        f('Session age', ses.ageSec != null ? `${ses.ageSec} s` : null),
        f('Coordinates accuracy', ip.accuracy ? `${ip.accuracy} level (IP based)` : null),
        f('Timezone', c.timeZone ? `${c.timeZone}${tzOffset(raw.locale?.timezoneOffset) ? ` (${tzOffset(raw.locale?.timezoneOffset)})` : ''}` : null),
        f('Distance', c.documentCountry ? `Document country ${c.documentCountry}, IP country ${ip.countryCode ?? 'unknown'}` : null),
      ]),
    },
    {
      title: 'Checks',
      checks: [
        check(
          'Tor exit node',
          n.tor || rtc.leakedTor,
          !n.tor && rtc.leakedTor ? 'The real address behind the connection is a Tor exit' : !n.checked && !n.tor && !rtc.leakedTor ? why : undefined,
          !n.checked && !n.tor && !rtc.leakedTor,
        ),
        check(
          'VPN',
          n.vpn || rtc.leakedVpn,
          n.vpnNetwork && !ip.vpn
            ? `Network known for VPN servers${owner}`
            : !n.vpn && rtc.leakedVpn
              ? 'The real address behind the connection is a VPN'
              : !n.checked && !n.vpn && !rtc.leakedVpn
                ? why
                : n.vpn
                  ? onTor(undefined, 'this is the Tor exit')
                  : undefined,
          !n.checked && !n.vpn && !rtc.leakedVpn,
        ),
        check(
          'Data centre / hosting network',
          n.datacenter,
          n.datacenter
            ? onTor(ip.cloudProvider ?? (n.hostingNetwork && !ip.datacenter ? `Hosting network${owner}` : undefined), 'this is the Tor exit')
            : (ip.cloudProvider ?? (!n.checked ? why : undefined)),
          !n.checked && !n.datacenter,
        ),
        check('Hijacked-network blocklist', ip.blocklisted, !n.checked && !ip.blocklisted ? why : undefined, !n.checked && !ip.blocklisted),
        {
          label: 'iCloud Private Relay',
          outcome: n.checked ? 'pass' : 'pending',
          note: !n.checked ? why : ip.privateRelay ? 'In use (a privacy feature, not a risk)' : 'Not in use',
        },
        check(
          'WebRTC address matches the connection',
          !!rtc.leakedIp,
          rtc.leakedIp ? `Also seen: ${rtc.leakedIp} (${rtc.leakedIsp ?? 'unknown'}, ${rtc.leakedCountry ?? '?'})` : !isPublic(ip.address) ? why : undefined,
          rtc.supported === false || !isPublic(ip.address),
        ),
        check('Time zone matches IP country', c.timeZoneMatchesIp === false, c.timeZoneMatchesIp === false ? onTor(c.timeZone ?? undefined, 'Tor Browser always reports UTC') : (c.timeZone ?? undefined), c.timeZoneMatchesIp == null),
        check('Languages match IP country', c.languageMatchesIp === false, c.languageMatchesIp === false ? onTor((c.languages ?? []).join(', ') || undefined, 'Tor Browser hides the real languages') : (c.languages ?? []).join(', ') || undefined, c.languageMatchesIp == null),
        check('Document country matches IP country', c.documentMatchesIp === false, c.documentMatchesIp === false ? onTor(c.documentCountry ? `${c.documentCountry} vs ${ip.countryCode ?? '?'}` : undefined, 'Tor picks the exit country') : c.documentCountry ? `${c.documentCountry} vs ${ip.countryCode ?? '?'}` : undefined, c.documentMatchesIp == null),
        check('Headers agree on the operating system', c.platformMatches === false, c.uaOs ? `${c.uaOs} / ${c.hintOs ?? '?'}` : undefined, c.platformMatches == null),
        // used for a capture fails; installed but not used is only noted
        check(
          'Virtual camera used for the capture',
          cap.virtualCameraUsed === true,
          cap.virtualCameraUsed === true
            ? (cap.camerasUsed ?? []).join(', ') || undefined
            : cap.virtualCameraSuspected
              ? `Installed, not used: ${(cap.matchedPatterns ?? []).join(', ')}${(cap.camerasUsed ?? []).length ? `. Camera used: ${(cap.camerasUsed ?? []).join(', ')}` : ''}`
              : (cap.camerasUsed ?? []).length
                ? `Camera used: ${(cap.camerasUsed ?? []).join(', ')}`
                : undefined,
          noCam && cap.virtualCameraUsed == null && !cap.virtualCameraSuspected,
        ),
        check('Automation / headless browser', env.automationDetected, [env.botKind, ...(env.headlessSignals ?? [])].filter(Boolean).join(', ') || undefined),
        check('Emulator', env.emulator, (env.emulatorSignatures ?? []).join(', ') || undefined),
        check('Virtual machine', env.virtualMachine, d.gpu ?? undefined),
        check('Browser not altered', (env.tampering ?? []).length > 0, (env.tampering ?? []).join(', ') || undefined),
        check('Private window', raw.storage?.incognitoSuspected, undefined, raw.storage?.incognitoSuspected == null),
        check('Developer tools closed', env.devtoolsSuspected),
        check('Browser not seen with other applicants', (ses.sameDeviceSessions ?? 0) > 0, `${ses.sameDeviceSessions ?? 0} other session(s)`),
        check('Fingerprint not seen with other applicants', (ses.sameFingerprintSessions ?? 0) > 0, `${ses.sameFingerprintSessions ?? 0} other session(s)`),
      ],
    },
    {
      title: 'IP intelligence',
      facts: list([
        f('IP address', ip.address, true),
        f('Country', ip.country ? `${ip.country} (${ip.countryCode})` : null),
        f('Region', ip.region),
        f('City', ip.city),
        f('Coordinates', ip.latitude != null ? `${ip.latitude}, ${ip.longitude}` : null),
        f('ASN', ip.asn ? `AS${ip.asn}` : null),
        f('Network owner', ip.isp),
        f('Connection type', ip.connectionType),
        f('Cloud provider', ip.cloudProvider),
        f('WebRTC public addresses', (rtc.publicIps ?? []).join(', ') || (rtc.supported === false ? 'WebRTC blocked' : 'None exposed')),
        f('IP lists updated', ip.listsUpdated),
      ]),
    },
    {
      title: 'Hardware & browser',
      facts: list([
        f('Device type', d.type),
        f('Engine', d.engine),
        f('CPU architecture', d.cpu),
        f('CPU cores', d.cores),
        f('Memory', d.memoryGb ? `${d.memoryGb} GB` : null),
        f('GPU', d.gpu),
        f('Screen', d.screen),
        f('Touch screen', d.touch == null ? null : d.touch ? 'Yes' : 'No'),
        f('Cameras', cap.videoInputCount),
        f('Microphones', cap.audioInputCount),
        ...flatten(scalars).filter((x) => !/^User agent$/i.test(x.term)),
      ]),
    },
    { title: 'Screen', facts: pick('screen'), collapsed: true },
    { title: 'Client hints', facts: [...pick('uaData'), ...flatten(h.clientHints ?? {}, 'header')], collapsed: true },
    { title: 'Graphics (WebGL)', facts: pick('gpu'), collapsed: true },
    { title: 'Locale', facts: pick('locale'), collapsed: true },
    { title: 'Network connection', facts: pick('network'), collapsed: true },
    { title: 'Storage & privacy', facts: [...pick('storage'), ...list([f('Do Not Track header', h.dnt ? 'Yes' : 'No'), f('Global Privacy Control header', h.gpc ? 'Yes' : 'No')])], collapsed: true },
    { title: 'Permissions', facts: pick('permissions'), collapsed: true },
    { title: 'Battery', facts: pick('battery'), collapsed: true },
    { title: 'Fingerprint', facts: [...list([f('Device ID (browser key)', ses.deviceId, true)]), ...flatten(fingerprint ?? {})], collapsed: true },
    { title: 'Capture devices', facts: flatten(cap), collapsed: true },
    { title: 'Environment', facts: flatten(env), collapsed: true },
    { title: 'Raw device data', raw: JSON.stringify(raw, null, 2), collapsed: true },
  ].filter((g) => g.raw || (g.facts?.length ?? 0) > 0 || (g.checks?.length ?? 0) > 0) as Group[];
}

export function deviceFlags(dev: Any | null | undefined): Flag[] {
  return ((dev?.risk?.reasons ?? []) as Any[]).map((r) => ({
    label: String(r.label),
    severity: r.points >= 40 ? 'critical' : r.points >= 10 ? 'warn' : 'info',
  }));
}

export function deviceTab(dev: Any) {
  if (!dev.risk) {
    // recorded before device analysis existed: only what the screening step saw
    const s = (dev.atScreening ?? dev) as Any;
    return { facts: list([f('IP', s.ip, true), f('Device', s.deviceId, true), f('Browser', s.userAgent)]) };
  }
  const devices = Object.values((dev.devices ?? {}) as Record<string, Any>);
  const all = devices.length ? devices : [dev];
  const ip = (dev.ip ?? {}) as Any;
  return {
    facts: list([
      f('Risk score', `${dev.risk.score} / 100 (${dev.risk.level}, ${String(dev.risk.action).replace('_', '-')})`),
      f('Devices used', all.length),
      f('Location', [ip.city, ip.region, ip.country].filter(Boolean).join(', ')),
      f('Last checked', when(dev.analyzedAt)),
    ]),
    reasons: ((dev.risk.reasons ?? []) as Any[]).map((r) => ({ label: String(r.label), points: Number(r.points) })),
    flags: deviceFlags(dev),
    devices: all.map((d, i) => ({
      title: `Device ${i + 1}: ${[d.device?.brand, d.device?.model].filter(Boolean).join(' ') || d.device?.os || 'Unknown'} · ${d.device?.browser ?? ''} (${d.stage}, ${d.risk?.score ?? 0}/100)`,
      groups: deviceGroups(d),
    })),
  };
}
