import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { RecordsService, type TxQuery } from './records.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EntitlementsService } from './entitlements.service';

/** Credits are kept in millionths: 1 credit = $1 of list price = 1,000,000 (a BIN lookup at $0.002 is 2,000). */
export const MICRO = 1_000_000;
/** What every organisation is given once, the first time its account is opened. */
export const STARTER = 5 * MICRO;
export const toMicro = (credits: number) => Math.round(credits * MICRO);

type Account = {
  org: string;
  balance: string;
  held: string;
  budget: string | null;
  hard_stop: boolean;
};

/** One priced thing that ran (a check of a verification, or one API call). */
export type UsageItem = { product: string; item: string; label: string; amount: number };

/** Why credits could not be taken: none left, the monthly budget's hard stop, or the key's own spend cap. */
export class CreditsRefused extends HttpException {
  constructor(
    readonly reason: 'insufficient_credits' | 'budget_reached' | 'spend_cap_reached',
    message: string,
  ) {
    super(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, error: reason, message },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

const fmt = (micro: number) => {
  const c = micro / MICRO;
  return Math.abs(c * 100 - Math.round(c * 100)) < 1e-6
    ? c.toFixed(2)
    : String(+c.toFixed(4));
};

/**
 * Every organisation's credits: one account (balance, and the part held for open verifications) and an
 * append-only ledger of every movement, plus an itemised usage list for the Billing page. Each change runs
 * in one transaction with the account row locked, so two requests can never spend the same credit, and the
 * balance can never go below zero (the database refuses it too). Card top-ups, once wired, are one more kind
 * of ledger entry ('top_up').
 */
@Injectable()
export class CreditsService {
  constructor(
    private readonly records: RecordsService,
    private readonly notes: NotificationsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /* ---------------------------------------------------------------- reading -- */

  async account(org: string) {
    return this.records.tx(async (q) => {
      const a = await this.open(q, org);
      const spent = await this.monthSpent(q, org);
      return {
        balance: +a.balance,
        held: +a.held,
        available: +a.balance - +a.held,
        budget: a.budget === null ? null : +a.budget,
        hardStop: a.hard_stop,
        spentThisMonth: spent,
      };
    });
  }

  /** The ledger, newest first. */
  async activity(org: string, page: number, size: number) {
    const rows = await this.records.query<{
      id: string;
      at: Date;
      kind: string;
      amount: string;
      hold: string;
      balance: string;
      held: string;
      note: string | null;
      ref: string | null;
      key_id: string | null;
      product: string | null;
    }>(
      // a hold's entry names its session; the verification's reference is known once the session exists
      `SELECT l.id, l.at, l.kind, l.amount, l.hold, l.balance, l.held, l.note, COALESCE(h.ref, l.ref) AS ref, l.key_id,
              COALESCE(l.product, CASE WHEN l.kind IN ('hold', 'settle', 'release') THEN 'kyc' END) AS product
       FROM credit_ledger l LEFT JOIN credit_holds h ON l.kind = 'hold' AND h.session_id = l.ref
       WHERE l.org = $1 ORDER BY l.id DESC LIMIT $2 OFFSET $3`,
      [org, size, (page - 1) * size],
    );
    const total = await this.records.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM credit_ledger WHERE org = $1',
      [org],
    );
    return {
      total: total[0]?.n ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        kind: r.kind,
        amount: +r.amount,
        hold: +r.hold,
        balance: +r.balance,
        available: +r.balance - +r.held,
        // a hold is written before its verification has a reference: "VS-1A2B: new verification on Standard KYC v1"
        note:
          r.kind === 'hold' && r.ref && r.note && !r.note.startsWith(r.ref)
            ? `${r.ref}: ${r.note}`
            : r.note,
        ref: r.ref,
        keyId: r.key_id,
        product: r.product,
      })),
    };
  }

  /** This month's usage by component: how many ran, and the credits they took. */
  async usage(org: string) {
    const rows = await this.records.query<{
      product: string;
      item: string;
      label: string;
      n: number;
      amount: string;
    }>(
      `SELECT product, item, max(label) AS label, count(*)::int AS n, sum(amount) AS amount FROM credit_usage
       WHERE org = $1 AND at >= date_trunc('month', now()) GROUP BY product, item ORDER BY n DESC`,
      [org],
    );
    return rows.map((r) => ({
      product: r.product,
      item: r.item,
      label: r.label,
      count: r.n,
      amount: +r.amount,
    }));
  }

  /* ---------------------------------------------------------------- budget -- */

  async setBudget(
    org: string,
    budget: number | null,
    hardStop: boolean,
    actor: string,
  ) {
    await this.records.tx(async (q) => {
      const a = await this.open(q, org);
      // a budget limits what this month can spend, so it can never be more than the month could spend at all
      const most = +a.balance + (await this.monthSpent(q, org));
      if (budget !== null && budget > most)
        throw new BadRequestException(
          `The monthly budget can be at most ${fmt(most)} credits: what your account has this month. Top up to raise it.`,
        );
      await q(
        'UPDATE credit_accounts SET budget = $2, hard_stop = $3, updated_at = now() WHERE org = $1',
        [org, budget, hardStop],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, actor, note) VALUES ($1, 'budget', 0, 0, $2, $3, $4, $5)`,
        [
          org,
          a.balance,
          a.held,
          actor,
          budget === null
            ? 'Monthly budget removed'
            : `Monthly budget set to ${fmt(budget)} credits${hardStop ? ', hard stop on' : ''}`,
        ],
      );
    });
    return this.account(org);
  }

  /* --------------------------------------------------------------- top-ups -- */

  /**
   * Adds credits bought through the payment provider (Polar's `order.paid`). Idempotent on `ref` (the order id):
   * the same order delivered twice adds credits once. Recorded as a 'top_up' ledger entry, like every other
   * movement, so the balance, the activity list and budgets stay consistent with the rest of billing.
   */
  async topUp(
    org: string,
    amount: number,
    meta: { ref: string; note: string; actor?: string },
  ): Promise<{ added: number; balance: number; duplicate: boolean }> {
    const add = Math.max(0, Math.round(amount));
    return this.records.tx(async (q) => {
      const a = await this.open(q, org);
      const seen = await q(
        `SELECT 1 FROM credit_ledger WHERE kind = 'top_up' AND ref = $1 LIMIT 1`,
        [meta.ref],
      );
      if (seen.length) return { added: 0, balance: +a.balance, duplicate: true };
      const balance = +a.balance + add;
      await q(
        'UPDATE credit_accounts SET balance = $2, updated_at = now() WHERE org = $1',
        [org, balance],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, actor, note) VALUES ($1, 'top_up', $2, 0, $3, $4, $5, $6, $7)`,
        [org, add, balance, a.held, meta.ref, meta.actor ?? 'polar', meta.note],
      );
      this.notes.notify({
        org,
        audience: 'billing.view',
        href: '/billing/',
        kind: 'credits.topup',
        tone: 'success',
        title: 'Credits added',
        body: meta.note,
      });
      return { added: add, balance, duplicate: false };
    });
  }

  /* -------------------------------------------------------------- spending -- */

  /** Takes credits now (an API call that succeeded). Refused, nothing is taken. */
  async charge(
    org: string,
    items: UsageItem[],
    meta: { ref?: string; keyId?: string; actor?: string; note: string },
  ) {
    const amount = items.reduce((s, i) => s + i.amount, 0);
    return this.records.tx(async (q) => {
      const a = await this.open(q, org);
      await this.allow(q, a, amount);
      const balance = +a.balance - amount;
      await q(
        'UPDATE credit_accounts SET balance = $2, updated_at = now() WHERE org = $1',
        [org, balance],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, key_id, actor, note, product) VALUES ($1, 'charge', $2, 0, $3, $4, $5, $6, $7, $8, $9)`,
        [
          org,
          -amount,
          balance,
          a.held,
          meta.ref ?? null,
          meta.keyId ?? null,
          meta.actor ?? null,
          meta.note,
          items[0]?.product ?? null,
        ],
      );
      await this.itemise(q, org, items, meta.ref, meta.keyId);
      return { charged: amount, available: balance - +a.held };
    });
  }

  /**
   * Takes one call's price before the call runs (the gateway, the Explorer): balance, budget and, for a key, its spend
   * cap all apply, under the account's lock. The answer is the reservation that a refund names.
   */
  async reserve(
    org: string,
    call: {
      product: string;
      item: string;
      label: string;
      price: number;
      keyId?: string | null;
      spendCap?: number | null;
      requestId?: string;
      actor?: string;
      note: string;
    },
  ): Promise<string> {
    return this.records.tx(async (q) => {
      const a = await this.open(q, org);
      if (call.keyId && call.spendCap) {
        const used = await q<{ used: string }>(
          'SELECT COALESCE(sum(amount), 0) AS used FROM credit_usage WHERE key_id = $1',
          [call.keyId],
        );
        if (+(used[0]?.used ?? 0) + call.price > call.spendCap * MICRO)
          throw new CreditsRefused(
            'spend_cap_reached',
            `This key has used its spend cap of ${call.spendCap.toLocaleString('en')} credits. Raise it on the API Keys page.`,
          );
      }
      await this.allow(q, a, call.price);
      const balance = +a.balance - call.price;
      await q(
        'UPDATE credit_accounts SET balance = $2, updated_at = now() WHERE org = $1',
        [org, balance],
      );
      const id = (
        await q<{ id: string }>(
          `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, key_id, actor, note, product) VALUES ($1, 'charge', $2, 0, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            org,
            -call.price,
            balance,
            a.held,
            call.requestId ?? null,
            call.keyId ?? null,
            call.actor ?? null,
            call.note,
            call.product,
          ],
        )
      )[0]!.id;
      await q(
        'INSERT INTO credit_usage (org, product, item, label, amount, ref, key_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [org, call.product, call.item, call.label, call.price, `res:${id}`, call.keyId ?? null],
      );
      return String(id);
    });
  }

  /**
   * Gives back all or part of a reservation: the whole price when the call did not succeed, the unused part of a call
   * whose price depends on what ran. Once per reservation, never more than was taken (a repeated request does nothing).
   */
  async refund(reservation: string, amount: number) {
    return this.records.tx(async (q) => {
      const r = (
        await q<{
          org: string;
          amount: string;
          product: string | null;
          key_id: string | null;
          note: string | null;
        }>(
          `SELECT org, amount, product, key_id, note FROM credit_ledger WHERE id = $1 AND kind = 'charge'`,
          [reservation],
        )
      )[0];
      if (!r) return null;
      const a = await this.open(q, r.org);
      const done = await q(
        `SELECT 1 FROM credit_ledger WHERE kind = 'refund' AND ref = $1 LIMIT 1`,
        [`res:${reservation}`],
      );
      if (done.length) return { refunded: 0 };
      const back = Math.min(Math.max(0, Math.round(amount)), -+r.amount);
      if (back <= 0) return { refunded: 0 };
      const balance = +a.balance + back;
      const whole = back === -+r.amount;
      await q(
        'UPDATE credit_accounts SET balance = $2, updated_at = now() WHERE org = $1',
        [r.org, balance],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, key_id, note, product) VALUES ($1, 'refund', $2, 0, $3, $4, $5, $6, $7, $8)`,
        [
          r.org,
          back,
          balance,
          a.held,
          `res:${reservation}`,
          r.key_id,
          `${r.note ?? 'Call'}: ${whole ? 'did not succeed, refunded' : 'unused part refunded'}`,
          r.product,
        ],
      );
      if (whole)
        await q('DELETE FROM credit_usage WHERE ref = $1', [`res:${reservation}`]);
      else
        await q(
          'UPDATE credit_usage SET amount = amount - $2 WHERE ref = $1',
          [`res:${reservation}`, back],
        );
      return { refunded: back };
    });
  }

  /** Sets credits aside for a new verification (its workflow's highest price). Refused, nothing is held. */
  async hold(
    org: string,
    sessionId: string,
    amount: number,
    meta: { ref?: string; actor?: string; note: string },
  ) {
    return this.records.tx(async (q) => {
      const a = await this.open(q, org);
      await this.allow(q, a, amount);
      const held = +a.held + amount;
      await q(
        'UPDATE credit_accounts SET held = $2, updated_at = now() WHERE org = $1',
        [org, held],
      );
      await q(
        'INSERT INTO credit_holds (session_id, org, amount, ref) VALUES ($1, $2, $3, $4)',
        [sessionId, org, amount, meta.ref ?? null],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, actor, note) VALUES ($1, 'hold', 0, $2, $3, $4, $5, $6, $7)`,
        [org, amount, a.balance, held, sessionId, meta.actor ?? null, meta.note],
      );
    });
  }

  /**
   * A verification finished (or its time ran out after it started): the checks that ran are charged, never
   * more than was held, and the rest of the hold goes back. Settling twice does nothing.
   */
  async settle(sessionId: string, items: UsageItem[], note: string) {
    return this.records.tx(async (q) => {
      const h = (
        await q<{ org: string; amount: string; ref: string | null }>(
          `SELECT org, amount, ref FROM credit_holds WHERE session_id = $1 AND status = 'open' FOR UPDATE`,
          [sessionId],
        )
      )[0];
      if (!h) return null;
      const a = await this.open(q, h.org);
      const hold = +h.amount;
      // Plan first: if the org's monthly verification quota covers this verification, release the whole hold and
      // charge no credits (a plan unit was spent instead). Only full verification flows ever reach settle, so a
      // plan never touches single API calls. Quota exhausted -> fall through and settle against credits as usual.
      if (await this.entitlements.consumeIn(q, h.org)) {
        const held = +a.held - hold;
        await q(
          'UPDATE credit_accounts SET held = $2, updated_at = now() WHERE org = $1',
          [h.org, held],
        );
        await q(
          `UPDATE credit_holds SET status = 'settled', charged = 0, closed_at = now() WHERE session_id = $1`,
          [sessionId],
        );
        await q(
          `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, note) VALUES ($1, 'settle', 0, $2, $3, $4, $5, $6)`,
          [h.org, -hold, a.balance, held, h.ref, `${note} (covered by plan)`],
        );
        // keep "how many ran" accurate while charging the wallet nothing (the plan paid, not credits)
        await this.itemise(q, h.org, items.map((i) => ({ ...i, amount: 0 })), h.ref ?? sessionId);
        return { org: h.org, charged: 0, released: hold };
      }
      const wanted = items.reduce((s, i) => s + i.amount, 0);
      const charged = Math.min(wanted, hold);
      const balance = +a.balance - charged;
      const held = +a.held - hold;
      await q(
        'UPDATE credit_accounts SET balance = $2, held = $3, updated_at = now() WHERE org = $1',
        [h.org, balance, held],
      );
      await q(
        `UPDATE credit_holds SET status = 'settled', charged = $2, closed_at = now() WHERE session_id = $1`,
        [sessionId, charged],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, note) VALUES ($1, 'settle', $2, $3, $4, $5, $6, $7)`,
        [h.org, -charged, -hold, balance, held, h.ref, note],
      );
      // what was charged, item by item (the last items are trimmed if the hold was smaller than what ran)
      let left = charged;
      const kept: UsageItem[] = [];
      for (const i of items) {
        const take = Math.min(i.amount, left);
        if (take <= 0 && i.amount > 0) continue;
        kept.push({ ...i, amount: take });
        left -= take;
      }
      await this.itemise(q, h.org, kept, h.ref ?? sessionId);
      return { org: h.org, charged, released: hold - charged };
    });
  }

  /** A verification that never ran (its link was not used in time): the hold goes back in full. */
  async release(sessionId: string, note: string) {
    return this.records.tx(async (q) => {
      const h = (
        await q<{ org: string; amount: string; ref: string | null }>(
          `SELECT org, amount, ref FROM credit_holds WHERE session_id = $1 AND status = 'open' FOR UPDATE`,
          [sessionId],
        )
      )[0];
      if (!h) return null;
      const a = await this.open(q, h.org);
      const held = +a.held - +h.amount;
      await q(
        'UPDATE credit_accounts SET held = $2, updated_at = now() WHERE org = $1',
        [h.org, held],
      );
      await q(
        `UPDATE credit_holds SET status = 'released', charged = 0, closed_at = now() WHERE session_id = $1`,
        [sessionId],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, note) VALUES ($1, 'release', 0, $2, $3, $4, $5, $6)`,
        [h.org, -+h.amount, a.balance, held, h.ref, note],
      );
      return { org: h.org, released: +h.amount };
    });
  }

  /** The reference the verification was filed under (known once it is created), for the activity list. */
  async holdRef(sessionId: string, ref: string) {
    await this.records.query(
      'UPDATE credit_holds SET ref = $2 WHERE session_id = $1',
      [sessionId, ref],
    );
  }

  /** Where a verification's credits stand: held ('open'), given back unused ('released'), billed ('settled'), or null (none held). */
  async holdStatus(sessionId: string): Promise<'open' | 'released' | 'settled' | null> {
    const r = await this.records.query<{ status: string }>('SELECT status FROM credit_holds WHERE session_id = $1', [sessionId]);
    return (r[0]?.status as 'open' | 'released' | 'settled' | undefined) ?? null;
  }

  /**
   * A verification whose link was never used gave its hold back; it gets a new link, so the same credits are set
   * aside again (nothing ran, nothing was charged). Refused like a new hold when the credits are not there.
   */
  async reopen(sessionId: string, meta: { actor?: string; note: string }) {
    return this.records.tx(async (q) => {
      const h = (
        await q<{ org: string; amount: string }>(
          `SELECT org, amount FROM credit_holds WHERE session_id = $1 AND status = 'released' FOR UPDATE`,
          [sessionId],
        )
      )[0];
      if (!h) return null;
      const a = await this.open(q, h.org);
      await this.allow(q, a, +h.amount);
      const held = +a.held + +h.amount;
      await q(
        'UPDATE credit_accounts SET held = $2, updated_at = now() WHERE org = $1',
        [h.org, held],
      );
      await q(
        `UPDATE credit_holds SET status = 'open', charged = NULL, closed_at = NULL WHERE session_id = $1`,
        [sessionId],
      );
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, ref, actor, note) VALUES ($1, 'hold', 0, $2, $3, $4, $5, $6, $7)`,
        [h.org, +h.amount, a.balance, held, sessionId, meta.actor ?? null, meta.note],
      );
      return { org: h.org, held: +h.amount };
    });
  }

  /** Open holds, for the sweeper that settles or releases them when their verification ends. */
  openHolds() {
    return this.records.query<{
      session_id: string;
      org: string;
      created_at: Date;
    }>(
      `SELECT session_id, org, created_at FROM credit_holds WHERE status = 'open' ORDER BY created_at LIMIT 500`,
    );
  }

  /* ----------------------------------------------------------------- inside -- */

  /** The organisation's account, locked for this transaction; opened with its starter credits once, ever. */
  private async open(q: TxQuery, org: string): Promise<Account> {
    const made = await q(
      'INSERT INTO credit_accounts (org, balance) VALUES ($1, $2) ON CONFLICT (org) DO NOTHING RETURNING org',
      [org, STARTER],
    );
    if (made.length)
      await q(
        `INSERT INTO credit_ledger (org, kind, amount, hold, balance, held, note) VALUES ($1, 'starter', $2, 0, $2, 0, 'Starter credits')`,
        [org, STARTER],
      );
    return (
      await q<Account>(
        'SELECT org, balance, held, budget, hard_stop FROM credit_accounts WHERE org = $1 FOR UPDATE',
        [org],
      )
    )[0]!;
  }

  /** Whether `amount` more may be spent: enough available credits, and within a hard-stopped monthly budget. */
  private async allow(q: TxQuery, a: Account, amount: number) {
    const available = +a.balance - +a.held;
    const billing = { org: a.org, audience: 'billing.view' as const, href: '/billing/' };
    if (amount > available) {
      this.notes.notify({
        ...billing,
        kind: 'credits.out',
        tone: 'danger',
        title: "You're out of credits",
        body: 'API calls and new verifications are paused until you top up in Usage & Billing.',
      });
      throw new CreditsRefused(
        'insufficient_credits',
        `Not enough credits: this needs ${fmt(amount)} and ${fmt(Math.max(0, available))} ${available === MICRO ? 'is' : 'are'} left. Top up in Usage & Billing.`,
      );
    }
    if (a.hard_stop && a.budget !== null) {
      const committed = (await this.monthSpent(q, a.org)) + +a.held;
      if (committed + amount > +a.budget) {
        this.notes.notify({
          ...billing,
          kind: 'credits.budget',
          tone: 'warning',
          title: "This month's budget is reached",
          body: 'Spending is paused until next month, or until you raise the budget in Usage & Billing.',
        });
        throw new CreditsRefused(
          'budget_reached',
          `This month's budget of ${fmt(+a.budget)} credits is reached. Raise it or turn off the hard stop in Usage & Billing.`,
        );
      }
    }
    // the spend goes through: crossing below one credit is worth a heads-up (once per crossing)
    if (available >= MICRO && available - amount < MICRO)
      this.notes.notify({
        ...billing,
        kind: 'credits.low',
        tone: 'warning',
        title: 'Your credits are running low',
        body: 'Less than 1 credit is left. Top up in Usage & Billing to keep things running.',
      });
  }

  private async monthSpent(q: TxQuery, org: string) {
    const r = await q<{ spent: string }>(
      `SELECT COALESCE(-sum(amount), 0) AS spent FROM credit_ledger WHERE org = $1 AND kind IN ('charge', 'settle') AND at >= date_trunc('month', now())`,
      [org],
    );
    return +(r[0]?.spent ?? 0);
  }

  private async itemise(
    q: TxQuery,
    org: string,
    items: UsageItem[],
    ref?: string | null,
    keyId?: string,
  ) {
    for (const i of items)
      await q(
        'INSERT INTO credit_usage (org, product, item, label, amount, ref, key_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [org, i.product, i.item, i.label, i.amount, ref ?? null, keyId ?? null],
      );
  }
}
