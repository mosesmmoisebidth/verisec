/**
 * The facts a workflow rule can test, read from a verification record (decrypted in memory on
 * the server; nothing here is stored or sent to the browser). A fact that is not known yet
 * (the step that produces it has not run) is undefined, and a rule on it does not fire.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- record sections are stored JSON; every value read is checked by type before use */
import { networkFlags } from './anonymizer';
import { isPublic, rescoreDeviceSection } from './device.score';
import { country2 } from './iso-country';
import type { RecordSections } from './records.service';

type Any = Record<string, any>;

export type Facts = {
  'ip.country'?: string;
  'ip.vpn'?: boolean;
  'ip.tor'?: boolean;
  'ip.proxy'?: boolean;
  'ip.datacenter'?: boolean;
  'ip.document_mismatch'?: boolean;
  'device.risk'?: number;
  'document.country'?: string;
  'document.type'?: string;
  age?: number;
  'face.similarity'?: number;
  'aml.hit'?: boolean;
  'email.risk'?: number;
  'phone.risk'?: number;
};

const upper2 = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim())
    ? v.trim().toUpperCase()
    : undefined;
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Whole years since a date of birth (YYYY-MM-DD). */
export function ageFrom(dob: unknown): number | undefined {
  const m =
    typeof dob === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null;
  if (!m) return undefined;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(m[1]);
  const before =
    now.getUTCMonth() + 1 < Number(m[2]) ||
    (now.getUTCMonth() + 1 === Number(m[2]) && now.getUTCDate() < Number(m[3]));
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

export function factsOf(d: RecordSections, otherPeople = 0): Facts {
  const f: Facts = {};
  const dev: Any | undefined = d.device;
  if (dev) {
    const ip: Any = dev.ip ?? {};
    const rtc: Any = dev.webrtc ?? {};
    const pub = isPublic(ip.address);
    f['ip.country'] = upper2(ip.countryCode);
    if (pub) {
      const n = networkFlags(ip);
      const relay = !!ip.privateRelay;
      f['ip.tor'] = n.tor || !!rtc.leakedTor;
      f['ip.datacenter'] = n.datacenter;
      f['ip.proxy'] = !!rtc.leakedIp && !relay;
      // "VPN" in a rule means any way the real connection is hidden: commercial VPNs mostly leave from hosting
      // networks, so a VPN rule catches those, proxies and Tor too (never iCloud Private Relay, a privacy feature)
      f['ip.vpn'] = n.vpn || !!rtc.leakedVpn || !!rtc.leakedDatacenter || f['ip.tor'] || f['ip.proxy'] || (n.datacenter && !relay);
    }
    const c: Any = dev.consistency ?? {};
    if (typeof c.documentMatchesIp === 'boolean')
      f['ip.document_mismatch'] = !c.documentMatchesIp;
    const risk = rescoreDeviceSection(dev, otherPeople).risk as Any | null;
    if (risk) f['device.risk'] = num(risk.score);
  }
  const idn = (d.identity ?? {}) as Any;
  // the browser sends alpha-2 when it can, else what the document printed (alpha-3, ICAO, a name)
  f['document.country'] =
    country2(idn.documentCountry) ?? country2(idn.nationality);
  if (typeof idn.documentType === 'string' && idn.documentType)
    f['document.type'] = idn.documentType;
  f.age = ageFrom(idn.dob);
  const match = ((d.face ?? {}) as Any).match as Any | undefined;
  if (match) f['face.similarity'] = num(match.similarity);
  const scr: Any | undefined = d.screening;
  if (scr) {
    const w = (scr.risk?.watchlist ?? scr.risk?.risk?.watchlist) as
      Any | undefined;
    if (w)
      f['aml.hit'] = (w.confirmed?.length ?? 0) + (w.possible?.length ?? 0) > 0;
    f['email.risk'] = num(scr.findings?.scores?.emailRisk);
    f['phone.risk'] = num(scr.findings?.scores?.phoneRisk);
  }
  return f;
}
