import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

import { IntelClient } from './intel.client';
import { RateLimiter } from './stores';

const MIN = 60_000;

function fail(reason: string, status = HttpStatus.BAD_REQUEST): never {
  throw new HttpException({ ok: false, reason }, status);
}

/**
 * ID document read and selfie-to-portrait match, end to end encrypted.
 *
 * The browser encrypts every image (JWE, see document-crypto.ts). This service cannot read
 * them: it stores each one as-is on the processing host and passes only the resulting
 * tokens on. The images are decrypted in memory next to the engine, nowhere else.
 */
@Injectable()
export class DocumentsService {
  private readonly log = new Logger('Documents');
  private readonly limiter = new RateLimiter();

  constructor(private readonly intel: IntelClient) {}

  private async store(jwe: string): Promise<string> {
    const r = await this.intel.post<{ token: string }>('/v1/vault/documents', { jwe }, 60_000);
    if (!r.ok || !r.data?.token) {
      this.log.warn(`store failed: ${r.error?.code ?? 'unknown'}`);
      fail("We couldn't receive your image. Please try again.");
    }
    return r.data.token;
  }

  /** Returns the engine envelope unchanged, so the Confirm Details parser keeps working. */
  async idvRead(front: string, back: string | undefined, ip: string) {
    if (!this.limiter.take(`idv:${ip}`, 20, 60 * MIN)) fail('Too many attempts. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const t0 = Date.now();
    const [image_token, image_back_token] = await Promise.all([this.store(front), back ? this.store(back) : undefined]);
    const t1 = Date.now();
    const env = await this.intel.post('/v1/idv/read', { image_token, image_back_token, scenario: 'FullProcess' }, 180_000);
    this.log.log(`document read: images sent in ${t1 - t0} ms (${Math.round((front.length + (back?.length ?? 0)) / 1024)} KB), read in ${Date.now() - t1} ms`);
    if (!env.ok && env.error?.code === 'unreachable') fail("We couldn't read your document right now. Please try again.", HttpStatus.BAD_GATEWAY);
    return env;
  }

  /** Returns the face engine's own answer (code, results, detections). */
  async faceMatch(selfie: string, portrait: string, ip: string) {
    if (!this.limiter.take(`fm:${ip}`, 30, 60 * MIN)) fail('Too many attempts. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const [a, b] = await Promise.all([this.store(selfie), this.store(portrait)]);
    const env = await this.intel.post<unknown>(
      '/v1/face/match',
      { images: [{ index: 1, type: 1, token: a }, { index: 2, type: 3, token: b }] },
      90_000,
    );
    if (!env.ok || !env.data) fail("We couldn't compare your photos right now. Please try again.", HttpStatus.BAD_GATEWAY);
    return env.data;
  }
}
