import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch } from 'undici';

import { MtlsService } from './mtls.service';

/** The global intelligence API's response envelope (verisec-api /v1/*). */
export type Envelope<T = any> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string } | null;
};

/**
 * Thin client for the global intelligence API on Contabo (phone lookup, Twilio
 * Verify OTP, yente sanctions/PEP screening, IP reputation, proof of address).
 * Never throws: a network failure comes back as `{ ok: false }` so callers decide
 * what the applicant sees. Request bodies carry personal data, so they are never
 * logged, and they only travel over TLS 1.3 with mutual authentication: we present
 * our certificate (CN=console.verisec.internal) and the API side refuses anyone else.
 */
@Injectable()
export class IntelClient {
  private readonly log = new Logger('Intel');
  private readonly base: string;

  constructor(
    config: ConfigService,
    private readonly mtls: MtlsService,
  ) {
    this.base = (config.get<string>('VERISEC_INTEL_URL') ?? 'https://api.verisec.mmose.me').replace(/\/$/, '');
    if (!this.base.startsWith('https://')) {
      throw new Error('VERISEC_INTEL_URL must be https: personal data is never sent in clear text');
    }
  }

  async get<T = any>(path: string, timeoutMs = 20_000): Promise<Envelope<T>> {
    return this.request<T>('GET', path, undefined, timeoutMs);
  }

  /** `headers`: extra request headers, e.g. X-VeriSec-Caller-IP so the engine reports the real caller's address. */
  async post<T = any>(path: string, body: unknown, timeoutMs = 20_000, headers: Record<string, string> = {}): Promise<Envelope<T>> {
    return this.request<T>('POST', path, body, timeoutMs, headers);
  }

  /** Any method with extra headers: the key service needs PATCH and the caller's identity on every call. */
  async send<T = any>(method: 'GET' | 'POST' | 'PATCH', path: string, body: unknown, timeoutMs = 20_000, headers: Record<string, string> = {}): Promise<Envelope<T>> {
    return this.request<T>(method, path, body, timeoutMs, headers);
  }

  /** The engines answer over mTLS (the dashboard's minute health check; nothing is processed). */
  async reachable(): Promise<boolean> {
    const dispatcher = this.mtls.dispatcher();
    if (!dispatcher) return false;
    try {
      const res = await fetch(`${this.base}/v1/health`, { dispatcher, signal: AbortSignal.timeout(5_000) });
      await res.body?.cancel().catch(() => undefined);
      // any answer but a refusal or a server failure means the engines' gateway is up
      return res.status < 500 && res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body: unknown, timeoutMs: number, extra: Record<string, string> = {}): Promise<Envelope<T>> {
    const dispatcher = this.mtls.dispatcher();
    if (!dispatcher) return { ok: false, error: { code: 'no_identity', message: 'client certificate not loaded' } };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: { ...extra, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
        dispatcher,
      });
      if (res.status === 403) this.log.error(`${path}: our certificate was refused by the API`);
      const json = (await res.json().catch(() => null)) as Envelope<T> | null;
      if (!json) return { ok: false, error: { code: 'bad_response', message: `HTTP ${res.status}` } };
      return json;
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      this.log.warn(`${path} failed: ${(e as Error).name}${cause ? ` (${cause})` : ''}`);
      return { ok: false, error: { code: 'unreachable', message: (e as Error).message } };
    } finally {
      clearTimeout(timer);
    }
  }
}
