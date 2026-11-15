import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Encryption as a service through OpenBao's Transit engine.
 *
 * The key never leaves OpenBao: we send data to be encrypted and get back an opaque
 * "vault:v1:..." string (AES-256-GCM, the version prefix lets the key be rotated without
 * re-encrypting old data). Our token can encrypt and decrypt with one key and nothing else,
 * and every call is written to OpenBao's audit log.
 *
 * Fails closed: when OpenBao is unreachable or sealed, `seal()` returns null and callers
 * must not keep the data at all, rather than keep it unencrypted.
 */
@Injectable()
export class VaultService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Vault');
  private readonly addr: string;
  private readonly token: string;
  private readonly key: string;
  private renewTimer?: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.addr = (config.get<string>('OPENBAO_ADDR') ?? 'http://127.0.0.1:8200').replace(/\/$/, '');
    this.token = config.get<string>('OPENBAO_TOKEN') ?? '';
    this.key = config.get<string>('OPENBAO_TRANSIT_KEY') ?? 'verisec-kyc';
  }

  get configured() {
    return !!this.token;
  }

  async onModuleInit() {
    if (!this.token) {
      this.log.warn('OPENBAO_TOKEN not set: personal data will not be retained (encryption unavailable)');
      return;
    }
    const ok = await this.renew();
    this.log.log(ok ? 'OpenBao ready: reports are encrypted at rest' : 'OpenBao unreachable or sealed: personal data will not be retained until it is back (run infra/openbao/unseal.ps1)');
    // periodic token: renewing keeps it alive; a day is well inside its 30-day period
    this.renewTimer = setInterval(() => void this.renew(), 24 * 60 * 60_000);
    this.renewTimer.unref();
  }

  onModuleDestroy() {
    if (this.renewTimer) clearInterval(this.renewTimer);
  }

  /** Encrypt any JSON value. Null (and nothing kept) when OpenBao is unavailable. */
  async seal(value: unknown): Promise<string | null> {
    if (!this.token) return null;
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
    const r = await this.call(`transit/encrypt/${this.key}`, { plaintext });
    const ct = r?.data?.ciphertext;
    if (typeof ct !== 'string') {
      this.log.error('encrypt failed: data not retained');
      return null;
    }
    return ct;
  }

  /** Decrypt a value produced by `seal`. Null when OpenBao is unavailable or the value is not ours. */
  async open<T = unknown>(ciphertext: string): Promise<T | null> {
    if (!this.token || !ciphertext) return null;
    const r = await this.call(`transit/decrypt/${this.key}`, { ciphertext });
    const pt = r?.data?.plaintext;
    if (typeof pt !== 'string') {
      this.log.error('decrypt failed');
      return null;
    }
    return JSON.parse(Buffer.from(pt, 'base64').toString('utf8')) as T;
  }

  /**
   * A fresh AES-256 data key for one record (envelope encryption). The plaintext key lives
   * only in memory; the record stores the WRAPPED form, which only OpenBao can unwrap.
   */
  async dataKey(): Promise<{ key: Buffer; wrapped: string } | null> {
    const r = await this.call('transit/datakey/plaintext/verisec-db', { bits: 256 });
    const pt = r?.data?.plaintext;
    const ct = r?.data?.ciphertext;
    if (typeof pt !== 'string' || typeof ct !== 'string') return null;
    return { key: Buffer.from(pt, 'base64'), wrapped: ct };
  }

  /** Unwrap a record's data key (audit-logged by OpenBao). */
  async unwrap(wrapped: string): Promise<Buffer | null> {
    const r = await this.call('transit/decrypt/verisec-db', { ciphertext: wrapped });
    const pt = r?.data?.plaintext;
    return typeof pt === 'string' ? Buffer.from(pt, 'base64') : null;
  }

  /** Blind index: a keyed hash computed inside OpenBao, so records can be searched without decrypting. */
  async blindIndex(value: string): Promise<string | null> {
    const norm = value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!norm) return null;
    const r = await this.call('transit/hmac/verisec-index', { input: Buffer.from(norm, 'utf8').toString('base64'), algorithm: 'sha2-256' });
    const h = r?.data?.hmac;
    return typeof h === 'string' ? h.replace(/^vault:v\d+:/, '') : null;
  }

  /** Up and unsealed (the dashboard's minute health check). */
  async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.addr}/v1/sys/health`, { signal: AbortSignal.timeout(5_000) });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  private async renew(): Promise<boolean> {
    return !!(await this.call('auth/token/renew-self', {}));
  }

  private async call(path: string, body: unknown): Promise<any | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5_000);
    try {
      const res = await fetch(`${this.addr}/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vault-Token': this.token },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        this.log.warn(`${path.split('/')[0]}: HTTP ${res.status}${res.status === 503 ? ' (sealed)' : ''}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      this.log.warn(`${path.split('/')[0]}: ${(e as Error).name}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
