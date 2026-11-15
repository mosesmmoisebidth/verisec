import { isIP } from 'node:net';

/**
 * Parsing for the network lists the anonymity check uses (see anonymizer.ts): Tor's relay directory and the
 * network-owner (ASN) lists. Pure functions, no state, so the bundled seed is built with exactly the same code
 * the running console refreshes with.
 */

export type TorLists = { torV4: string[]; torV6: string[]; torAsOf: string | null };

/** An IPv6 address as eight 4-digit groups ("2a0b:f4c2:0002:..."); null when it is not IPv6. */
export function expand6(ip: string): string[] | null {
  let s = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (isIP(s) !== 6) return null;
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = `${s.slice(0, -v4[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t ? [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t] : h;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

/**
 * The /64 network of an IPv6 address. A Tor relay's exit traffic leaves from an address in its own /64 (one server's
 * allocation), not always the exact address it advertises, so IPv6 exits are matched by network.
 */
export function net64(ip: string): string | null {
  const g = expand6(ip);
  return g ? g.slice(0, 4).join(':') : null;
}

/** "204.8.96.141:444" / "[2620:7:6003::141]:81" / a bare address, as the address alone. */
function hostOf(a: string): string {
  const s = a.trim();
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (br) return br[1];
  const i = s.lastIndexOf(':');
  return i > 0 && s.indexOf(':') === i ? s.slice(0, i) : s;
}

/** 9009, "9009" or "AS9009" as a number; null for anything else. */
export function asnOf(v: unknown): number | null {
  const m = typeof v === 'number' ? [String(v), String(v)] : typeof v === 'string' ? /^\s*(?:AS)?(\d{1,10})\s*$/i.exec(v) : null;
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n < 4294967296 ? n : null;
}

/** An ASN list file ("AS9009 # M247, GB (NordVPN)" per line) as sorted numbers. */
export function parseAsnList(text: string): number[] {
  const out = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*AS(\d{1,10})\b/i.exec(line);
    const n = m ? asnOf(m[1]) : null;
    if (n) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Tor's relay directory (Onionoo /details for running relays with the Exit flag) as exit addresses: every IPv4
 * address an exit was seen leaving from or listens on, and the /64 of every IPv6 address of an exit that allows
 * IPv6 exits. Throws when the answer is not plausibly the whole directory, so a partial answer never replaces a
 * good list.
 */
export function parseTorDirectory(j: unknown): TorLists {
  const relays: Any[] = Array.isArray((j as Any)?.relays) ? (j as Any).relays : [];
  const v4 = new Set<string>();
  const v6 = new Set<string>();
  const add = (a: unknown, ipv6: boolean) => {
    if (typeof a !== 'string') return;
    const host = hostOf(a);
    const fam = isIP(host);
    if (fam === 4) v4.add(host);
    else if (fam === 6 && ipv6) {
      const p = net64(host);
      if (p) v6.add(p);
    }
  };
  for (const r of relays) {
    // the IPv6 exit policy summary is only there when the relay allows IPv6 exits
    const exits6 = !!r?.exit_policy_v6_summary;
    for (const a of Array.isArray(r?.exit_addresses) ? r.exit_addresses : []) add(a, true);
    for (const a of Array.isArray(r?.or_addresses) ? r.or_addresses : []) add(a, exits6);
  }
  if (v4.size < 300 || v4.size > 50_000) throw new Error(`implausible Tor directory (${v4.size} IPv4 exits)`);
  const asOf = typeof (j as Any)?.relays_published === 'string' ? `${(j as Any).relays_published} UTC` : new Date().toISOString();
  return { torV4: [...v4].sort(), torV6: [...v6].sort(), torAsOf: asOf };
}
