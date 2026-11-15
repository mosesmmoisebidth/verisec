import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, sign, X509Certificate } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';

/**
 * This service's mTLS identity (CN=console.verisec.internal), issued by the VeriSec Internal CA.
 *
 * - Every call to the global API presents this certificate; the API side refuses anything else.
 * - Certificates live 24 hours. We renew when a third of the lifetime is left, over mTLS to the
 *   CA with the current certificate (holding the private key is the proof). An expired certificate
 *   cannot complete a TLS handshake, so after expiry we send step-ca's renew token instead (the
 *   CA's `services` provisioner allows renewal after expiry): a laptop that was off recovers by itself.
 * - The private key never leaves this machine: renewal re-signs the same key.
 */
@Injectable()
export class MtlsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('mTLS');
  private readonly dir: string;
  private readonly caUrl: string;
  private agent: Agent | null = null;
  private timer?: NodeJS.Timeout;
  private notAfter = 0;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('VERISEC_MTLS_DIR') ?? join(process.cwd(), '..', '..', 'infra', 'pki');
    this.caUrl = (config.get<string>('VERISEC_CA_URL') ?? 'https://169.58.135.108:9443').replace(/\/$/, '');
  }

  private path(f: string) {
    return join(this.dir, f);
  }

  /** The HTTP agent that presents our certificate and trusts only the VeriSec root for internal hosts. */
  dispatcher(): Agent | null {
    return this.agent;
  }

  get expiresAt() {
    return new Date(this.notAfter);
  }

  async onModuleInit() {
    try {
      this.load();
    } catch (e) {
      this.log.error(`no client certificate in ${this.dir} (${(e as Error).message}); calls to the global API will be refused`);
      return;
    }
    await this.renewIfDue();
    this.timer = setInterval(() => void this.renewIfDue(), 30 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    void this.agent?.close();
  }

  private load() {
    const cert = readFileSync(this.path('console.crt'), 'utf8');
    const key = readFileSync(this.path('console.key'), 'utf8');
    const leaf = new X509Certificate(cert);
    this.notAfter = Date.parse(leaf.validTo);
    const old = this.agent;
    // Public endpoints (the API behind Caddy) use normal web PKI; our cert + chain go with every handshake.
    // idle connections are kept for a minute, so calls reuse the handshake instead of paying 200-500 ms each time
    this.agent = new Agent({ connect: { cert, key, minVersion: 'TLSv1.3' }, keepAliveTimeout: 60_000, keepAliveMaxTimeout: 300_000 });
    void old?.close();
    this.log.log(`identity ${leaf.subject.replace(/\n/g, ',')} valid until ${leaf.validTo}`);
  }

  private async renewIfDue() {
    const left = this.notAfter - Date.now();
    if (left > 8 * 60 * 60_000) return; // more than a third of the 24h lifetime left
    try {
      const cert = readFileSync(this.path('console.crt'), 'utf8');
      const key = readFileSync(this.path('console.key'), 'utf8');
      const ca = readFileSync(this.path('root_ca.crt'), 'utf8');
      const expired = left <= 0;
      // mTLS to the CA with the current certificate, or the renew token once it has expired; the CA's own TLS is
      // verified against OUR root only.
      const caAgent = new Agent({ connect: expired ? { ca, minVersion: 'TLSv1.2' } : { cert, key, ca, minVersion: 'TLSv1.2' } });
      const res = await fetch(`${this.caUrl}/renew`, {
        method: 'POST',
        dispatcher: caAgent,
        headers: expired ? { Authorization: `Bearer ${this.renewToken(cert, key)}` } : {},
      });
      const body = (await res.json().catch(() => null)) as { crt?: string; ca?: string; message?: string } | null;
      await caAgent.close();
      if (!res.ok || !body?.crt) {
        this.log.error(`renewal refused: HTTP ${res.status}${body?.message ? ` (${body.message})` : ''}`);
        return;
      }
      const bundle = `${body.crt.trim()}\n${(body.ca ?? '').trim()}\n`;
      new X509Certificate(bundle); // sanity: parses
      writeFileSync(this.path('console.crt.new'), bundle, { mode: 0o600 });
      renameSync(this.path('console.crt.new'), this.path('console.crt')); // atomic swap
      this.load();
      this.log.log(expired ? 'expired certificate renewed' : 'certificate renewed');
    } catch (e) {
      this.log.error(`renewal failed: ${(e as Error).message}`);
    }
  }

  /**
   * step-ca's renew token: a 5-minute JWT signed with the certificate's own key, carrying the (expired) chain in the
   * `x5cInsecure` header. The CA checks the chain against its root ignoring the dates, the signature against the leaf,
   * subject = the leaf's CN, issuer = step-ca-client/1.0, audience = its /1.0/renew URL.
   */
  private renewToken(certPem: string, keyPem: string) {
    const chain = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    const [first] = chain;
    if (!first) throw new Error('no certificate to renew');
    const leaf = new X509Certificate(first);
    if (leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('renew token needs a P-256 key');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const url = new URL(this.caUrl);
    const head = b64({ alg: 'ES256', typ: 'JWT', x5cInsecure: chain.map((p) => p.replace(/-----[A-Z ]+-----|\s/g, '')) });
    const claims = b64({
      iss: 'step-ca-client/1.0',
      sub: /CN=([^\n,]+)/.exec(leaf.subject)?.[1] ?? '',
      aud: [`https://${url.hostname}/1.0/renew`, `${url.origin}/1.0/renew`],
      iat: now,
      nbf: now,
      exp: now + 300,
      jti: randomUUID(),
    });
    const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key: keyPem, dsaEncoding: 'ieee-p1363' });
    return `${head}.${claims}.${sig.toString('base64url')}`;
  }
}
