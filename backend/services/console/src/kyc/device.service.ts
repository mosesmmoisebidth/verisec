import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';

import { classifyNetwork } from './anonymizer';
import { scoreDevice } from './device.score';
import { IntelClient } from './intel.client';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { RateLimiter } from './stores';
import { country2 } from './iso-country';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe[89ab])/i;
const isPublicIp = (ip: unknown): ip is string => typeof ip === 'string' && !!isIP(ip) && !PRIVATE.test(ip);
const hint = (v: unknown) => (typeof v === 'string' ? v.replace(/"/g, '').slice(0, 200) : null);
const obj = (v: unknown): Any => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Any) : {});
const short = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 16);

/** OS family names as the UA parser and the Client Hints header spell them. */
const osFamily = (s: string | null | undefined) => {
  const x = (s ?? '').toLowerCase();
  if (!x) return null;
  if (x.includes('android')) return 'android';
  if (x.includes('ios') || x.includes('iphone') || x.includes('ipad')) return 'ios';
  if (x.includes('mac')) return 'mac';
  if (x.includes('windows')) return 'windows';
  if (x.includes('chrome')) return 'chromeos';
  if (x.includes('linux') || x.includes('ubuntu') || x.includes('fedora')) return 'linux';
  return x;
};

/**
 * Device & IP analysis for one verification session.
 *
 * Combines what the browser reports (lib/verify/device-signals.ts, untrusted), what the server
 * sees itself (TCP peer address, request headers), offline IP intelligence on the processing
 * host (/v1/ip/analyze) and history (the same browser seen with other applicants). The result
 * is stored encrypted in the record's "device" section; the applicant is never told anything.
 */
@Injectable()
export class DeviceService {
  private readonly log = new Logger('Device');
  private readonly limiter = new RateLimiter();

  constructor(
    private readonly intel: IntelClient,
    private readonly records: RecordsService,
    private readonly sessions: SessionsService,
  ) {}

  async ipInfo(ip: string): Promise<Any | null> {
    const r = await this.intel.post<Any>('/v1/ip/analyze', { ip }, 10_000);
    if (!r.ok) this.log.warn(`ip intel unavailable: ${r.error?.code ?? 'error'}`);
    return r.ok ? (r.data ?? null) : null;
  }

  /** At most a few reports per session (open, camera) and per address. Never throws. */
  allowed(sid: string, ip: string) {
    return this.limiter.take(`dev:s:${sid}`, 10, 60 * 60_000) && this.limiter.take(`dev:ip:${ip}`, 60, 60 * 60_000);
  }

  /** `phoneKey`: the report comes from a phone doing one face step (its own key), not from the device holding it. */
  async analyze(sid: string, browser: Any, req: Request, ip: string, stage: string, phoneKey?: string) {
    const h = req.headers;
    const ua = String(h['user-agent'] ?? '').slice(0, 512);
    const p = new UAParser(ua).getResult();
    const ch = {
      platform: hint(h['sec-ch-ua-platform']),
      platformVersion: hint(h['sec-ch-ua-platform-version']),
      mobile: h['sec-ch-ua-mobile'] === '?1' ? true : h['sec-ch-ua-mobile'] === '?0' ? false : null,
      model: hint(h['sec-ch-ua-model']),
      brands: hint(h['sec-ch-ua']),
    };
    const uaData = obj(browser.uaData);

    // ---- the connection, and any other public address the browser revealed through WebRTC
    const conn = isPublicIp(ip) ? await this.ipInfo(ip) : null;
    const rtcIps = (Array.isArray(obj(browser.webrtc).publicIps) ? (obj(browser.webrtc).publicIps as unknown[]) : []).filter(isPublicIp).slice(0, 4);
    // a different public address only means something when the connection itself is public: on a
    // local or private network (development, an internal proxy) there is nothing to compare it with
    const leaked = isPublicIp(ip) ? (rtcIps.find((x) => x !== ip) ?? null) : null;
    const leakInfo = leaked ? await this.ipInfo(leaked) : null;

    // ---- the record so far (document country, session age)
    const rec = await this.records.get(sid);
    const identity = obj(rec?.data.identity);
    const createdAt = rec?.meta.created_at ? new Date(rec.meta.created_at).getTime() : null;

    // ---- consistency: device settings vs network location vs document vs headers
    const geo = obj(conn?.geo);
    const flags = obj(conn?.flags);
    const net = obj(conn?.network);
    const ipCountry: string | null = geo.countryCode ?? null;
    const locale = obj(browser.locale);
    const tz = typeof locale.timeZone === 'string' ? locale.timeZone : null;
    const relay = !!flags.privateRelay; // relay egress is regional, not the user's exact country
    // ---- anonymity: the address lists only cover IPv4, so Tor's own directory and the network owner (both work for
    // IPv4 and IPv6) are checked too; the network owner never marks iCloud Private Relay
    const own = isPublicIp(ip) ? classifyNetwork(ip, net.asn) : null;
    const tor = !!flags.tor || !!own?.torExit;
    const vpnNetwork = !relay && !!own?.vpnNetwork;
    const hostingNetwork = !relay && !!own?.hostingNetwork;
    const vpn = !!flags.vpn || vpnNetwork;
    const datacenter = !!flags.datacenter || hostingNetwork;
    const leakFlags = obj(leakInfo?.flags);
    const leakOwn = leaked ? classifyNetwork(leaked, obj(leakInfo?.network).asn) : null;
    const leakedTor = !!leakFlags.tor || !!leakOwn?.torExit;
    const leakedVpn = !!leakFlags.vpn || !!leakOwn?.vpnNetwork;
    const leakedDatacenter = !!leakFlags.datacenter || !!leakOwn?.hostingNetwork;
    const tzMatchesIp = ipCountry && tz && !relay ? (geo.countryTimezones ?? []).includes(tz) : null;
    const langs = (Array.isArray(browser.languages) ? browser.languages : []).filter((l: unknown): l is string => typeof l === 'string').slice(0, 12);
    const langMatchesIp = ipCountry && langs.length && !relay ? langs.some((l) => l.toUpperCase().endsWith(`-${ipCountry}`)) : null;
    const docCountry = String(identity.documentCountry ?? '').trim();
    // alpha-2, alpha-3, a travel-document code or a name, all read as alpha-2
    const doc2 = country2(docCountry);
    const docMatchesIp =
      ipCountry && docCountry && !relay
        ? doc2
          ? doc2 === ipCountry
          : docCountry.length > 3
            ? docCountry.toLowerCase() === String(geo.country ?? '').toLowerCase()
            : null
        : null;
    const uaOs = osFamily(p.os.name);
    const hintOs = osFamily(ch.platform ?? uaData.platform);
    const platformMismatch = !!(uaOs && hintOs && uaOs !== hintOs);

    // ---- identity of the device: the session's DPoP key lives non-extractable in this browser,
    // the fingerprint survives a cleared site storage. Both are stored only as blind indexes.
    const jkt = phoneKey ?? this.sessions.keyOf(sid) ?? null;
    const fp = obj(browser.fingerprint);
    const visitorId = typeof fp.visitorId === 'string' && /^[A-Za-z0-9]{8,64}$/.test(fp.visitorId) ? fp.visitorId : null;
    const reuse = await this.records.linkDevice(sid, jkt, visitorId);
    // only other PEOPLE on this device count, never the same applicant's own sessions
    const otherPeople = await this.records.otherPeopleOnDevice(sid);

    // ---- integrity reported by the browser (can be lied about: absence proves nothing)
    const integ = obj(browser.integrity);
    const cap = obj(integ.capture);
    const env = obj(integ.environment);
    const storage = obj(browser.storage);
    const tampering = Array.isArray(env.tampering) ? env.tampering.length : 0;

    const risk = scoreDevice({
      // used for a capture, not merely installed (OBS and others add a camera to every list)
      virtualCamera: cap.virtualCameraUsed === true,
      automation: env.automationDetected === true,
      emulator: env.emulator === true,
      virtualMachine: env.virtualMachine === true,
      tampering,
      tor,
      torBehindWebrtc: leakedTor,
      vpn,
      datacenter,
      privateRelay: relay,
      blocklisted: !!flags.spamhausDrop,
      webrtcLeak: !!leaked && !relay,
      tzMismatch: tzMatchesIp === false,
      docCountryMismatch: docMatchesIp === false,
      langMismatch: langMatchesIp === false,
      platformMismatch,
      incognito: storage.incognitoSuspected === true,
      sameDevice: otherPeople,
      sameFingerprint: otherPeople,
    });

    const gpu = obj(browser.gpu);
    const device = {
      stage: phoneKey ? `phone_${stage}` : stage,
      analyzedAt: new Date().toISOString(),
      risk,
      ip: {
        address: ip,
        country: geo.country ?? null,
        countryCode: ipCountry,
        region: geo.region ?? null,
        city: geo.city ?? null,
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
        accuracy: geo.latitude != null ? 'city' : null,
        asn: net.asn ?? null,
        isp: net.organization ?? null,
        connectionType: net.connectionType ?? (conn || isPublicIp(ip) ? null : 'private'),
        // the address was looked up at all: a private address or an unavailable lookup is "not checked", never a pass
        checked: !!conn,
        tor,
        vpn,
        datacenter,
        torDirectory: !!own?.torExit,
        vpnNetwork,
        hostingNetwork,
        cloudProvider: flags.cloudProvider ?? null,
        privateRelay: relay,
        blocklisted: !!flags.spamhausDrop,
        listsUpdated: obj(conn?.sources).updated ?? null,
      },
      webrtc: { supported: obj(browser.webrtc).supported ?? null, publicIps: rtcIps, leakedIp: leaked, leakedIsp: obj(leakInfo?.network).organization ?? null, leakedCountry: obj(leakInfo?.geo).countryCode ?? null,
        leakedTor, leakedVpn, leakedDatacenter },
      device: {
        type: p.device.type ?? (ch.mobile ? 'mobile' : 'desktop'),
        brand: p.device.vendor ?? null,
        model: ch.model || p.device.model || null,
        os: p.os.name ?? null,
        osVersion: (typeof uaData.platformVersion === 'string' && uaData.platformVersion) || p.os.version || null,
        browser: p.browser.name ?? null,
        browserVersion: (Array.isArray(uaData.fullVersionList) && obj(uaData.fullVersionList.at(-1)).version) || p.browser.version || null,
        engine: p.engine.name ?? null,
        cpu: p.cpu.architecture ?? (typeof uaData.architecture === 'string' ? uaData.architecture : null),
        gpu: typeof gpu.renderer === 'string' ? gpu.renderer.slice(0, 160) : null,
        cores: browser.hardwareConcurrency ?? null,
        memoryGb: browser.deviceMemory ?? null,
        screen: obj(browser.screen).width ? `${obj(browser.screen).width}x${obj(browser.screen).height} @${browser.devicePixelRatio ?? 1}x` : null,
        touch: browser.touchSupport ?? null,
      },
      session: {
        id: sid,
        ageSec: createdAt ? Math.round((Date.now() - createdAt) / 1000) : null,
        deviceId: jkt ? short(`jkt:${jkt}`) : null,
        fingerprint: visitorId,
        fingerprintConfidence: fp.confidence ?? null,
        sameDeviceSessions: reuse.sameDevice,
        sameFingerprintSessions: reuse.sameFingerprint,
        otherPeople,
      },
      consistency: {
        timeZone: tz,
        timeZoneMatchesIp: tzMatchesIp,
        languages: langs,
        languageMatchesIp: langMatchesIp,
        documentCountry: docCountry || null,
        documentMatchesIp: docMatchesIp,
        uaOs,
        hintOs,
        platformMatches: uaOs && hintOs ? !platformMismatch : null,
      },
      headers: {
        userAgent: ua,
        acceptLanguage: String(h['accept-language'] ?? '').slice(0, 200) || null,
        clientHints: ch,
        dnt: h['dnt'] === '1',
        gpc: h['sec-gpc'] === '1',
      },
      raw: browser,
    };

    // one report per device the applicant used (a later stage on the same device replaces the
    // earlier one); the section's top level is the latest report, its risk the worst device's
    const devKey = visitorId ?? device.session.deviceId ?? 'unknown';
    const devices = { ...(obj(obj(rec?.data.device).devices) as Record<string, Any>), [devKey]: device };
    const worst = Object.values(devices).reduce((w: Any, d: Any) => ((d?.risk?.score ?? 0) > (w?.risk?.score ?? -1) ? d : w), device);
    // never "no concerns" for checks that did not run
    const skipped = !isPublicIp(ip) ? 'local or private connection address' : !conn ? 'network lookup unavailable' : null;
    const found = risk.reasons.length ? `${risk.level} risk (${risk.reasons.map((r) => r.code).join(', ')})` : 'no concerns';
    const label = `${phoneKey ? 'Device check of the phone used for the face check' : 'Device check'}: ${found}${skipped ? `; network checks skipped (${skipped})` : ''}`;
    this.log.log(
      `device ${sid} ${stage}: ${skipped ? `network checks skipped (${skipped})` : `${isIP(ip) === 6 ? 'IPv6' : 'IPv4'} AS${net.asn ?? '?'} tor=${tor} vpn=${vpn} datacenter=${datacenter}${relay ? ' privateRelay' : ''}`}, risk ${risk.score}`,
    );
    // a phone doing a face step is one more device of this verification: its risk counts like any device, but it never
    // replaces the report of the device holding the verification at the top (that report decided which steps run)
    const prev = obj(rec?.data.device);
    const top = phoneKey && prev.stage ? prev : device;
    await this.records.put(sid, 'device', { ...top, risk: worst.risk, devices }, { event: { type: 'device', label }, step: `device_${phoneKey ? 'phone' : stage}` });
    return device;
  }
}
