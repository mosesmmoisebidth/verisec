import { isIP } from 'node:net';

import { asnOf, net64 } from './anonymizer-parse';
import { ANON_SEED } from './anonymizer.seed';

/**
 * Is the connection hiding where it really comes from (Tor, a VPN, a hosting network)?
 *
 * The address lists the IP lookup uses are IPv4 only, so on their own they miss every Tor exit, VPN and data centre
 * reached over IPv6. Two checks here work for both: Tor's own relay directory (exit addresses, IPv6 by /64), and the
 * network that owns the address (its ASN), which is the same for every address a VPN or hosting company uses. The
 * lists start from the bundled copy and are replaced while the console runs (AnonymizerService).
 */

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let torV4 = new Set<string>(ANON_SEED.torV4);
let torV6 = new Set<string>(ANON_SEED.torV6);
let vpnAsns = new Set<number>(ANON_SEED.vpnAsns);
let hostingAsns = new Set<number>(ANON_SEED.hostingAsns);
let torAsOf: string | null = ANON_SEED.torAsOf;
let asnAsOf: string | null = ANON_SEED.asnAsOf;

/** iCloud Private Relay's own network: listed as hosting, but a privacy feature, so it never counts. */
const RELAY_ASNS = new Set<number>([36183]);

export type AnonymizerLists = {
  torV4: string[];
  torV6: string[];
  torAsOf: string | null;
  vpnAsns: number[];
  hostingAsns: number[];
  asnAsOf: string | null;
};

/** Replace any of the lists (a refresh, or the copy saved by the last run). */
export function setAnonymizerLists(l: Partial<AnonymizerLists>): void {
  if (l.torV4) torV4 = new Set(l.torV4);
  if (l.torV6) torV6 = new Set(l.torV6);
  if (l.torAsOf !== undefined) torAsOf = l.torAsOf;
  if (l.vpnAsns) vpnAsns = new Set(l.vpnAsns);
  if (l.hostingAsns) hostingAsns = new Set(l.hostingAsns);
  if (l.asnAsOf !== undefined) asnAsOf = l.asnAsOf;
}

export function anonymizerStatus() {
  return { torV4: torV4.size, torV6: torV6.size, torAsOf, vpnAsns: vpnAsns.size, hostingAsns: hostingAsns.size, asnAsOf };
}

/** What Tor's directory and the network owner say about one address (IPv4 or IPv6). */
export function classifyNetwork(ip: unknown, asn: unknown): { torExit: boolean; vpnNetwork: boolean; hostingNetwork: boolean } {
  const addr = typeof ip === 'string' ? ip.trim() : '';
  const fam = addr ? isIP(addr) : 0;
  const torExit = fam === 4 ? torV4.has(addr) : fam === 6 ? torV6.has(net64(addr) ?? '') : false;
  const a = asnOf(asn);
  const owned = a != null && !RELAY_ASNS.has(a);
  return { torExit, vpnNetwork: owned && vpnAsns.has(a), hostingNetwork: owned && hostingAsns.has(a) };
}

/**
 * The connection's anonymity flags as every view, score and rule reads them from a saved report: what was found when
 * the report was made, plus Tor's directory and the network owner judged with today's lists, so reports made before
 * these checks existed are corrected too (Tor exits and VPN networks are hosting addresses, which do not pass to home
 * users). iCloud Private Relay is never marked by its network.
 * `checked`: the address was actually looked up (reports from before the field existed: the lists' date is only set
 * when it was).
 */
export function networkFlags(ip: Any) {
  const relay = !!ip.privateRelay;
  const n = classifyNetwork(ip.address, ip.asn);
  const vpnNetwork = !relay && (n.vpnNetwork || !!ip.vpnNetwork);
  const hostingNetwork = !relay && (n.hostingNetwork || !!ip.hostingNetwork);
  return {
    tor: !!ip.tor || n.torExit,
    vpn: !!ip.vpn || vpnNetwork,
    datacenter: !!ip.datacenter || hostingNetwork,
    vpnNetwork,
    hostingNetwork,
    checked: typeof ip.checked === 'boolean' ? ip.checked : !!ip.listsUpdated,
  };
}
