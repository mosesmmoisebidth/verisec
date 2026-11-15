import { BlockList, isIP } from 'node:net';
import type { Request } from 'express';

/**
 * The applicant's real IP address.
 *
 * X-Forwarded-For is written by whoever sends the request, so it is only believed when the
 * connection itself comes from one of OUR proxies (KYC_TRUSTED_PROXIES: comma-separated IPs or
 * CIDRs, e.g. the load balancer). Then the chain is walked from the right, skipping our own
 * proxies, and the first address we did not add is the client. Otherwise the TCP peer address
 * is the answer, whatever the headers claim.
 */
const trusted = new BlockList();
let configured = false;
for (const raw of (process.env.KYC_TRUSTED_PROXIES ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  const [addr, bits] = raw.split('/');
  const fam = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
  if (!isIP(addr)) continue;
  if (bits) trusted.addSubnet(addr, Number(bits), fam);
  else trusted.addAddress(addr, fam);
  configured = true;
}

const norm = (ip: string) => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
const isTrusted = (ip: string) => configured && !!isIP(ip) && trusted.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');

export function clientIp(req: Request): string {
  const peer = norm(req.socket.remoteAddress ?? '');
  if (!isTrusted(peer)) return peer;
  const xff = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map(norm).filter((x) => isIP(x));
  for (let i = chain.length - 1; i >= 0; i--) if (!isTrusted(chain[i])) return chain[i];
  return peer;
}
