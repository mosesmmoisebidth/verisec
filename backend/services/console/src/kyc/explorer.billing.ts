import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, from, mergeMap, type Observable } from 'rxjs';

import { CreditsRefused, CreditsService } from './credits.service';
import { KeyServiceClient } from './key-service.client';
import type { OperatorRequest } from './verifications.controller';

type Q = Record<string, unknown>;

/** A search in the platform's own AML data (no image engine): the approved price for such lookups, 0.002. */
const DATA_SEARCH = { id: 'aml.data-search', label: 'AML data search', price: 2_000 };

const text = (q: Q, ...names: string[]) => names.some((n) => typeof q[n] === 'string' && (q[n] as string).trim() !== '');
const firstPage = (q: Q) => !q.offset || q.offset === '0';

/**
 * What each Explorer search costs (the user's decision of 2026-10-09: the portal's own tools use credits at the same
 * prices as the API). A search is charged once, on its first page; paging through the results, opening a record,
 * its graph and its tracks, and browsing without a search, are free.
 */
const PRICED: Record<string, (q: Q) => string | null> = {
  'GET /api/explorer/screen/search': (q) => (text(q, 'q') && firstPage(q) ? 'screen.sanctions' : null),
  'GET /api/explorer/screen/match': () => 'screen.sanctions',
  'GET /api/explorer/wallet/search': (q) => (text(q, 'q') && firstPage(q) ? 'screen.crypto' : null),
  'GET /api/explorer/crypto': () => 'screen.crypto',
  'GET /api/explorer/crypto/screen': () => 'screen.crypto',
  'POST /api/explorer/crypto/screen': () => 'screen.crypto',
  'GET /api/explorer/web': (q) => (text(q, 'q') && (!q.page || q.page === '1') ? 'osint.web' : null),
  'GET /api/explorer/check/ip': () => 'screen.ip',
  'GET /api/explorer/intel/ip/analysis': () => 'ip.analyze',
  'GET /api/explorer/intel/phone': () => 'phone.lookup',
  'GET /api/explorer/intel/email/accounts': () => 'email.footprint',
  'GET /api/explorer/intel/username': () => 'osint.username',
  'GET /api/explorer/check/email': () => 'email.verify',
  'GET /api/explorer/vessel': (q) => (text(q, 'imo', 'mmsi', 'name', 'q') ? DATA_SEARCH.id : null),
  'GET /api/explorer/aircraft': (q) => (text(q, 'icao24', 'registration', 'name', 'q') ? DATA_SEARCH.id : null),
  'GET /api/explorer/search': (q) => (text(q, 'q') ? DATA_SEARCH.id : null),
  'GET /api/explorer/filter': (q) => (text(q, 'q') && firstPage(q) ? DATA_SEARCH.id : null),
  'GET /api/explorer/company': (q) => (text(q, 'lei', 'record_id', 'registration', 'name', 'q') ? DATA_SEARCH.id : null),
  'GET /api/explorer/media': (q) => (text(q, 'q') && firstPage(q) ? DATA_SEARCH.id : null),
  'GET /api/explorer/documents': (q) => (text(q, 'q') && firstPage(q) ? DATA_SEARCH.id : null),
  'GET /api/explorer/catalog': (q) => (text(q, 'q') && firstPage(q) ? DATA_SEARCH.id : null),
};

/**
 * Takes an Explorer search's price from the organisation's credits before it runs (402 when there are none) and gives
 * it back when the search fails. On the developer gate without an organisation nothing is charged.
 */
@Injectable()
export class ExplorerBilling implements NestInterceptor {
  constructor(
    private readonly credits: CreditsService,
    private readonly keys: KeyServiceClient,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<OperatorRequest & { route?: { path?: string } }>();
    const org = req.org ?? req.homeOrg;
    const rule = PRICED[`${req.method} ${req.route?.path ?? ''}`];
    const api = rule ? rule({ ...(req.query as Q), ...((req.body as Q) ?? {}) }) : null;
    if (!org || !api) return next.handle();
    const p =
      api === DATA_SEARCH.id
        ? { label: DATA_SEARCH.label, price: DATA_SEARCH.price }
        : await this.keys.price({ org, actor: req.operator ?? 'console', role: 'viewer', mfa: false }, api).catch(() => null);
    if (!p || p.price <= 0) return next.handle();
    let reservation: string;
    try {
      reservation = await this.credits.reserve(org, {
        product: 'kyc',
        item: api,
        label: p.label,
        price: p.price,
        actor: req.operator,
        note: `AML Explorer: ${p.label}`,
      });
    } catch (e) {
      if (e instanceof CreditsRefused) throw new HttpException({ code: e.reason, message: e.message }, 402);
      throw e;
    }
    return next.handle().pipe(
      catchError((e: unknown) =>
        from(this.credits.refund(reservation, p.price).catch(() => undefined)).pipe(
          mergeMap(() => {
            throw e;
          }),
        ),
      ),
    );
  }
}
