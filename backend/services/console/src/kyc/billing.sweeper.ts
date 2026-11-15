import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { checksRan } from './billing-items';
import { CreditsService } from './credits.service';
import { RecordsService } from './records.service';
import { WorkflowsService } from './workflows.service';

const EVERY = 5 * 60_000;
/** How long a started verification may sit untouched before it counts as ended (the resume window). */
const IDLE = 7 * 24 * 3600_000;

/**
 * Closes the credit holds of verifications that ended without the finishing step: a link never opened before
 * it expired gets its hold back in full; one that was started and then abandoned (its resume window over, or a new
 * link it was given not used in time) is charged for the checks that ran. A finished verification is settled when it finishes; this also catches one
 * whose settling failed then. Every step is idempotent (a hold settles or releases once).
 */
@Injectable()
export class BillingSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Billing');
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly credits: CreditsService,
    private readonly records: RecordsService,
    private readonly workflows: WorkflowsService,
  ) {}

  onModuleInit() {
    this.first = setTimeout(() => void this.sweep(), 30_000);
    this.first.unref();
    this.timer = setInterval(() => void this.sweep(), EVERY);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  async sweep() {
    if (this.running) return;
    this.running = true;
    let settled = 0;
    let released = 0;
    try {
      for (const h of await this.credits.openHolds()) {
        const s = (
          await this.records.query<{
            status: string;
            reference: string;
            link_expires_at: Date | null;
            bound_key: string | null;
            resume_until: Date | null;
            updated_at: Date;
            opened: boolean;
          }>(
            "SELECT status, reference, link_expires_at, bound_key, resume_until, updated_at, steps ? 'opened' AS opened FROM kyc_sessions WHERE id = $1",
            [h.session_id],
          )
        )[0];
        const now = Date.now();
        if (!s) {
          // still being created (a hold is placed just before its session): leave it a minute
          if (now - +new Date(h.created_at) < 60_000) continue;
          if (await this.credits.release(h.session_id, 'Released: the verification was not created')) released++;
          continue;
        }
        // a link that expired with no device holding the verification: never opened at all (nothing ran, the hold
        // goes back), or opened before and then given a new link nobody used (what ran on it is charged)
        const linkGone =
          !s.bound_key && !!s.link_expires_at && +new Date(s.link_expires_at) < now;
        const unused = linkGone && !s.opened;
        const ended =
          s.status !== 'in_progress' ||
          (linkGone && s.opened) ||
          (!!s.bound_key &&
            ((!!s.resume_until && +new Date(s.resume_until) < now) ||
              now - +new Date(s.updated_at) > IDLE));
        if (s.status === 'in_progress' && unused) {
          if (await this.credits.release(h.session_id, `${s.reference}: link not used before it expired`)) released++;
        } else if (ended) {
          const [rec, w] = await Promise.all([
            this.records.get(h.session_id).catch(() => null),
            this.workflows.forSession(h.session_id),
          ]);
          const items = rec && w ? checksRan(w.definition, rec.data) : [];
          const note =
            s.status === 'in_progress'
              ? `${s.reference}: verification ended without finishing`
              : `${s.reference}: verification finished`;
          if (await this.credits.settle(h.session_id, items, note)) settled++;
        }
      }
      if (settled || released)
        this.log.log(`credit holds: ${settled} settled, ${released} released`);
    } catch (e) {
      this.log.warn(`credit holds sweep: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
