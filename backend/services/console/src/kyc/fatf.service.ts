import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

import { fetchFatfLists, type FatfLists } from './fatf-source';
import { countryName } from './iso-country';
import { FATF_JUNE_2026, setHighRisk } from './workflows';

type Snapshot = Pick<FatfLists, 'blacklist' | 'greylist' | 'countries' | 'asOf' | 'source'>;
type Active = Snapshot & { approvedAt: string | null; approvedBy: string | null };
type Pending = FatfLists & { added: string[]; removed: string[]; seenAt: string };
type State = { active: Active | null; pending: Pending | null; dismissed: string[] | null };

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Keeps the FATF high-risk / monitored country list current.
 *
 * FATF has no API and blocks automated requests, so this cannot read the source of record directly. Once a week it
 * reads a maintained mirror (see fatf-source) and compares it to the list in force. A difference is never applied on
 * its own: it is held as a proposal for an operator to confirm, because changing what a compliance workflow screens
 * for is a decision a person makes, not an unattended script. The committed list in workflows.ts is always the
 * fallback, so a bad or missing fetch never changes anything.
 */
@Injectable()
export class FatfService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('FATF');
  private readonly file = process.env.FATF_STATE_FILE || path.join(process.cwd(), 'data', 'fatf-state.json');
  private state: State = { active: null, pending: null, dismissed: null };
  private timer?: NodeJS.Timeout;

  async onModuleInit(): Promise<void> {
    await this.loadState();
    // whatever was last approved is the list in force; with nothing approved, the committed seed stays
    if (this.state.active) setHighRisk(this.state.active.countries);
    // one check shortly after start, then weekly (FATF updates three times a year, so a weekly look is ample)
    setTimeout(() => void this.check(), 20_000).unref?.();
    this.timer = setInterval(() => void this.check(), WEEK);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** The list in force (an approved update, else the committed seed) and any change waiting for a person to confirm. */
  current(): { active: Active; pending: Pending | null; source: string; names: Record<string, string> } {
    const active: Active = this.state.active ?? {
      blacklist: [],
      greylist: [],
      countries: [...FATF_JUNE_2026.countries],
      asOf: { blacklist: null, greylist: null },
      source: 'committed list (workflows.ts)',
      approvedAt: null,
      approvedBy: null,
    };
    const p = this.state.pending;
    const names: Record<string, string> = {};
    for (const c of new Set([...active.countries, ...(p?.countries ?? []), ...(p?.added ?? []), ...(p?.removed ?? [])])) {
      names[c] = countryName(c) ?? c;
    }
    return { active, pending: this.state.pending, source: active.source, names };
  }

  /** Apply the pending change: it becomes the list in force for every workflow and the builder preset. */
  async approve(operator: string): Promise<{ ok: boolean; reason?: string; countries?: string[] }> {
    const p = this.state.pending;
    if (!p) return { ok: false, reason: 'There is no pending FATF change to approve.' };
    this.state.active = {
      blacklist: p.blacklist,
      greylist: p.greylist,
      countries: p.countries,
      asOf: p.asOf,
      source: p.source,
      approvedAt: new Date().toISOString(),
      approvedBy: operator,
    };
    this.state.pending = null;
    this.state.dismissed = null;
    setHighRisk(p.countries);
    await this.saveState();
    this.log.log(`FATF list updated by ${operator}: added [${p.added.join(', ')}] removed [${p.removed.join(', ')}] (${p.countries.length} countries)`);
    return { ok: true, countries: p.countries };
  }

  /** Decline the pending change and remember it, so the same set is not proposed again until it changes. */
  async dismiss(operator: string): Promise<{ ok: boolean; reason?: string }> {
    const p = this.state.pending;
    if (!p) return { ok: false, reason: 'There is no pending FATF change to dismiss.' };
    this.state.dismissed = p.countries;
    this.state.pending = null;
    await this.saveState();
    this.log.log(`FATF proposal dismissed by ${operator}`);
    return { ok: true };
  }

  /** Read the mirror now and record a proposal if it differs from the list in force. Also the weekly job. */
  async check(): Promise<void> {
    let live: FatfLists;
    try {
      live = await fetchFatfLists();
    } catch (e) {
      this.log.warn(`FATF check skipped: ${(e as Error).message}`);
      return;
    }
    const current = this.state.active?.countries ?? [...FATF_JUNE_2026.countries];
    if (this.sameSet(live.countries, current)) {
      if (this.state.pending) {
        this.state.pending = null;
        await this.saveState();
      }
      return;
    }
    if (this.state.dismissed && this.sameSet(live.countries, this.state.dismissed)) return; // already declined this exact set
    const added = live.countries.filter((c) => !current.includes(c));
    const removed = current.filter((c) => !live.countries.includes(c));
    const changed = !this.state.pending || !this.sameSet(this.state.pending.countries, live.countries);
    this.state.pending = { ...live, added, removed, seenAt: new Date().toISOString() };
    if (changed) {
      await this.saveState();
      this.log.warn(`FATF change detected, awaiting confirmation: added [${added.join(', ')}] removed [${removed.join(', ')}]`);
    }
  }

  private sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((x) => b.includes(x));
  }

  private async loadState(): Promise<void> {
    try {
      this.state = JSON.parse(await fs.readFile(this.file, 'utf8')) as State;
    } catch {
      /* first run or unreadable: keep the defaults (the committed seed is in force) */
    }
  }

  private async saveState(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.state, null, 2));
    } catch (e) {
      this.log.error(`could not persist FATF state: ${(e as Error).message}`);
    }
  }
}
