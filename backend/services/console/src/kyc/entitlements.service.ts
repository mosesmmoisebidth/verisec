import { Injectable } from '@nestjs/common';

import { RecordsService, type TxQuery } from './records.service';

/**
 * A monthly verification plan (bought through Polar) gives an organisation a quota of complete verification
 * flows each billing period. The rules, confirmed with the owner:
 *  - the plan covers FULL verification flows only (the hold/settle path), never single API calls;
 *  - a verification spends the plan's quota FIRST; once the quota is used up it falls back to credits
 *    (the settle path draws credits as usual), so nothing is ever blocked while the org still has credits;
 *  - the quota RESETS every period with no rollover.
 *
 * Polar only tells us a payment happened. `grant` is called from the `order.paid` webhook (initial purchase and
 * every renewal) to set/reset the quota; `revoke` from `subscription.revoked` when access should stop. The
 * actual "spend one" happens inside the verification's settle transaction, via `consumeIn`, so a plan unit and
 * the credit hold can never both be taken for the same verification.
 */

export type Entitlement = {
  plan: string | null;
  quota: number;
  used: number;
  remaining: number;
  periodEnd: string | null;
  active: boolean;
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly records: RecordsService) {}

  /** Set (or reset, on renewal) an org's monthly verification quota. `used` goes back to zero for the period. */
  async grant(
    org: string,
    g: { plan: string; quota: number; subscriptionId: string; periodStart?: Date | null; periodEnd?: Date | null },
  ): Promise<void> {
    await this.records.query(
      `INSERT INTO verification_entitlements (org, plan, subscription_id, quota, used, period_start, period_end, status, updated_at)
       VALUES ($1, $2, $3, $4, 0, $5, $6, 'active', now())
       ON CONFLICT (org) DO UPDATE SET
         plan = EXCLUDED.plan,
         subscription_id = EXCLUDED.subscription_id,
         quota = EXCLUDED.quota,
         used = 0,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         status = 'active',
         updated_at = now()`,
      [org, g.plan, g.subscriptionId, Math.max(0, Math.round(g.quota)), g.periodStart ?? null, g.periodEnd ?? null],
    );
  }

  /** Stop a plan (its subscription was revoked): the quota no longer covers verifications, credits take over. */
  async revoke(org: string, subscriptionId?: string): Promise<void> {
    await this.records.query(
      `UPDATE verification_entitlements SET status = 'revoked', updated_at = now()
       WHERE org = $1 AND ($2::text IS NULL OR subscription_id = $2)`,
      [org, subscriptionId ?? null],
    );
  }

  /** Find the org that a subscription belongs to (webhooks about a subscription may not carry the org). */
  async orgOfSubscription(subscriptionId: string): Promise<string | null> {
    const r = await this.records.query<{ org: string }>(
      'SELECT org FROM verification_entitlements WHERE subscription_id = $1 LIMIT 1',
      [subscriptionId],
    );
    return r[0]?.org ?? null;
  }

  /** What the billing page shows: the plan, how much of the month's quota is left, and whether it's active. */
  async status(org: string): Promise<Entitlement | null> {
    const r = await this.records.query<{
      plan: string | null;
      quota: number;
      used: number;
      period_end: Date | null;
      status: string;
    }>(
      'SELECT plan, quota, used, period_end, status FROM verification_entitlements WHERE org = $1',
      [org],
    );
    const e = r[0];
    if (!e) return null;
    const active = e.status === 'active' && (!e.period_end || e.period_end.getTime() > Date.now());
    return {
      plan: e.plan,
      quota: e.quota,
      used: e.used,
      remaining: Math.max(0, e.quota - e.used),
      periodEnd: e.period_end ? e.period_end.toISOString() : null,
      active,
    };
  }

  /**
   * Spend one verification from the plan, inside the caller's transaction (the verification's settle). Returns
   * true when the plan covered it (the caller then charges no credits), false when there is no quota left and
   * credits should be used instead. The row is locked so two verifications settling at once can't overspend.
   */
  async consumeIn(q: TxQuery, org: string): Promise<boolean> {
    const rows = await q<{ quota: number; used: number; period_end: Date | null; status: string }>(
      'SELECT quota, used, period_end, status FROM verification_entitlements WHERE org = $1 FOR UPDATE',
      [org],
    );
    const e = rows[0];
    if (!e || e.status !== 'active') return false;
    if (e.period_end && e.period_end.getTime() <= Date.now()) return false;
    if (e.used >= e.quota) return false;
    await q('UPDATE verification_entitlements SET used = used + 1, updated_at = now() WHERE org = $1', [org]);
    return true;
  }
}
