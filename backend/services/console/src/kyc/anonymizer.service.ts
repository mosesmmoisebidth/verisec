import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

import { anonymizerStatus, setAnonymizerLists, type AnonymizerLists } from './anonymizer';
import { parseAsnList, parseTorDirectory } from './anonymizer-parse';

const TOR_URL =
  'https://onionoo.torproject.org/details?flag=Exit&running=true&fields=or_addresses,exit_addresses,exit_policy_v6_summary';
const ASN_URL = (k: 'vpn' | 'datacenter') => `https://raw.githubusercontent.com/X4BNet/lists_vpn/main/input/${k}/ASN.txt`;
const UA = 'VeriSec-Console/1.0 (+https://verisec.mmose.me)';
const TOR_EVERY = 30 * 60_000; // Tor exits change through the day
const ASN_EVERY = 12 * 60 * 60_000; // network owners change slowly

/**
 * Keeps the anonymity check's lists current (see anonymizer.ts): Tor's relay directory every half hour, the VPN and
 * hosting network owners twice a day. Only the lists are downloaded; no applicant address ever leaves the server.
 * A list is replaced only by a complete, plausible answer, and every good list is saved, so a failed or blocked
 * download keeps the last good copy (or the bundled one) in force.
 */
@Injectable()
export class AnonymizerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Anonymizer');
  private readonly dir = process.env.ANONYMIZER_STATE_DIR || path.join(process.cwd(), 'data', 'anonymizer');
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly failing = { tor: false, asn: false };

  async onModuleInit(): Promise<void> {
    const tor = await this.load('tor.json');
    if (tor?.torV4?.length) setAnonymizerLists({ torV4: tor.torV4, torV6: tor.torV6 ?? [], torAsOf: tor.torAsOf ?? null });
    const asn = await this.load('asn.json');
    if (asn?.hostingAsns?.length) setAnonymizerLists({ vpnAsns: asn.vpnAsns ?? [], hostingAsns: asn.hostingAsns, asnAsOf: asn.asnAsOf ?? null });
    const s = anonymizerStatus();
    this.log.log(
      `anonymity lists in use: Tor ${s.torV4} IPv4 exits + ${s.torV6} IPv6 networks (${s.torAsOf ?? 'no date'}), ` +
        `${s.vpnAsns} VPN and ${s.hostingAsns} hosting network owners (${s.asnAsOf ?? 'no date'})`,
    );
    this.every(() => this.refreshTor(), 30_000, TOR_EVERY);
    this.every(() => this.refreshAsn(), 45_000, ASN_EVERY);
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
  }

  private every(fn: () => Promise<void>, first: number, period: number) {
    const t = setTimeout(() => {
      void fn();
      const i = setInterval(() => void fn(), period);
      i.unref?.();
      this.timers.push(i);
    }, first);
    t.unref?.();
    this.timers.push(t);
  }

  private async refreshTor(): Promise<void> {
    try {
      const res = await fetch(TOR_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lists = parseTorDirectory(await res.json());
      setAnonymizerLists(lists);
      await this.save('tor.json', lists);
      if (this.failing.tor) this.log.log('Tor relay directory reachable again');
      this.failing.tor = false;
      this.log.debug(`Tor exits refreshed: ${lists.torV4.length} IPv4, ${lists.torV6.length} IPv6 networks`);
    } catch (e) {
      if (!this.failing.tor) this.log.warn(`Tor relay directory not reachable, keeping the saved list: ${(e as Error).message}`);
      this.failing.tor = true;
    }
  }

  private async refreshAsn(): Promise<void> {
    try {
      const get = async (k: 'vpn' | 'datacenter') => {
        const res = await fetch(ASN_URL(k), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`${k} list HTTP ${res.status}`);
        return parseAsnList(await res.text());
      };
      const [vpnAsns, hostingAsns] = await Promise.all([get('vpn'), get('datacenter')]);
      if (vpnAsns.length < 5 || hostingAsns.length < 300) throw new Error(`implausible network lists (${vpnAsns.length} VPN, ${hostingAsns.length} hosting)`);
      const lists: Partial<AnonymizerLists> = { vpnAsns, hostingAsns, asnAsOf: new Date().toISOString().slice(0, 10) };
      setAnonymizerLists(lists);
      await this.save('asn.json', lists);
      if (this.failing.asn) this.log.log('network owner lists reachable again');
      this.failing.asn = false;
    } catch (e) {
      if (!this.failing.asn) this.log.warn(`network owner lists not reachable, keeping the saved lists: ${(e as Error).message}`);
      this.failing.asn = true;
    }
  }

  private async load(name: string): Promise<Partial<AnonymizerLists> | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')) as Partial<AnonymizerLists>;
    } catch {
      return null; // first run or unreadable: the bundled copy stays in force
    }
  }

  private async save(name: string, value: unknown): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(path.join(this.dir, name), JSON.stringify(value));
    } catch (e) {
      this.log.error(`could not save ${name}: ${(e as Error).message}`);
    }
  }
}
