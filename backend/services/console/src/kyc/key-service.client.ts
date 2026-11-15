import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, type KeyObject } from 'node:crypto';

import { IntelClient } from './intel.client';
import { assertionFor, type KeyCaller } from './keys.controller';

/** One priced product API, as the key service (the gateway's owner) lists it. Prices are in millionths of a credit. */
export type ApiPrice = {
  id: string;
  method: string;
  path: string;
  product: string;
  permission: string;
  price: number;
  label: string;
  dynamic: boolean;
};

const APIS_TTL = 10 * 60_000;

/**
 * The console's side of the key service for things other than the API Keys page: the priced API list (the one price
 * list the gateway charges from, used here for the Explorer and the Billing page) and the short-lived tokens that let
 * the Playground call the APIs as one of the account's keys. Every request is signed as the person it is for.
 */
@Injectable()
export class KeyServiceClient {
  private readonly signer: KeyObject | null;
  private apisCache: { at: number; list: ApiPrice[] } | null = null;
  private readonly tokens = new Map<string, { token: string; exp: number }>();

  constructor(
    private readonly intel: IntelClient,
    config: ConfigService,
  ) {
    const pem = config.get<string>('KEYS_ASSERTION_KEY');
    this.signer = pem ? createPrivateKey(Buffer.from(pem, 'base64').toString('utf8')) : null;
  }

  private async call<T>(who: KeyCaller, method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    if (!this.signer) throw new HttpException({ code: 'unavailable', message: 'API keys are not available right now.' }, 503);
    const raw = body === undefined ? '' : JSON.stringify(body);
    const env = await this.intel.send<T>(method, path, body, 20_000, {
      'X-VeriSec-Assertion': assertionFor(this.signer, who, method, path, raw),
    });
    if (env.ok) return env.data as T;
    const code = env.error?.code ?? 'unavailable';
    const status = code === 'not_found' ? 404 : code === 'forbidden' || code === 'beyond_role' ? 403 : code === 'key_not_active' ? 409 : 503;
    throw new HttpException({ code, message: env.error?.message ?? 'API keys are not available right now.' }, status);
  }

  /** Every priced API (cached ten minutes; the list is the same for every account). */
  async apis(who: KeyCaller): Promise<ApiPrice[]> {
    if (this.apisCache && Date.now() - this.apisCache.at < APIS_TTL) return this.apisCache.list;
    const cat = await this.call<{ apis?: ApiPrice[] }>(who, 'GET', '/v1/keys/catalog');
    const list = Array.isArray(cat.apis) ? cat.apis : [];
    if (list.length) this.apisCache = { at: Date.now(), list };
    return list;
  }

  async price(who: KeyCaller, id: string): Promise<ApiPrice | null> {
    return (await this.apis(who)).find((a) => a.id === id) ?? null;
  }

  /** The account's API-key calls since a moment, for the dashboard's API charts (none when the key service is away). */
  async calls(org: string, since: Date): Promise<{ method: string; path: string; status: number; ms: number; at: string }[]> {
    try {
      const r = await this.call<{ calls?: { method: string; path: string; status: number; ms: number; at: string }[] }>(
        { org, actor: 'dashboard', role: 'viewer', mfa: false },
        'GET',
        `/v1/keys/calls?since=${encodeURIComponent(since.toISOString())}`,
      );
      return Array.isArray(r.calls) ? r.calls : [];
    } catch {
      return [];
    }
  }

  /** A Playground token for one of the account's keys (reused until a minute before it ends). */
  async playgroundToken(who: KeyCaller, keyId: string): Promise<string> {
    const k = `${who.org}|${keyId}`;
    const hit = this.tokens.get(k);
    if (hit && hit.exp - 60 > Date.now() / 1000) return hit.token;
    const r = await this.call<{ token: string; expires_at: number }>(who, 'POST', `/v1/keys/${encodeURIComponent(keyId)}/playground-token`, {});
    this.tokens.set(k, { token: r.token, exp: r.expires_at });
    return r.token;
  }
}
