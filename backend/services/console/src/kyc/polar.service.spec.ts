import { createHmac } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('svix', () => ({ Webhook: class Webhook { constructor() { throw new Error('use manual verification in unit tests'); } } }));

import { PolarService } from './polar.service';

const payload = JSON.stringify({ type: 'order.paid', data: { id: 'ord_test_1', metadata: { org: 'org_test' } } });

function signedHeaders(key: Buffer, body = payload, id = 'msg_test_1', timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  };
}

function service(secret: string) {
  const config = {
    get: (name: string) => (name === 'POLAR_WEBHOOK_SECRET' ? secret : undefined),
  } as unknown as ConfigService;
  return new PolarService(config);
}

describe('PolarService webhook verification', () => {
  it('accepts Polar webhook signatures made with the full polar_whs_ secret bytes', () => {
    const secret = 'polar_whs_1234567890abcdefghijklmnopqrstuvwxyz';
    const event = service(secret).verify(Buffer.from(payload), signedHeaders(Buffer.from(secret, 'utf8')));

    expect(event).toEqual({
      id: 'msg_test_1',
      type: 'order.paid',
      data: { id: 'ord_test_1', metadata: { org: 'org_test' } },
    });
  });

  it('accepts Standard Webhooks whsec_ secrets whose suffix is base64 key material', () => {
    const key = Buffer.from('standard-webhook-test-key');
    const secret = `whsec_${key.toString('base64')}`;

    expect(service(secret).verify(payload, signedHeaders(key))).toMatchObject({ id: 'msg_test_1', type: 'order.paid' });
  });

  it('rejects a forged signature and an otherwise valid signature outside the five-minute window', () => {
    const secret = 'polar_whs_1234567890abcdefghijklmnopqrstuvwxyz';
    const verifier = service(secret);
    const now = Math.floor(Date.now() / 1000);
    const forged = { ...signedHeaders(Buffer.from('attacker-key')), 'webhook-signature': 'v1,Zm9yZ2Vk' };
    const stale = signedHeaders(Buffer.from(secret), payload, 'msg_stale', String(now - 301));

    expect(verifier.verify(payload, forged)).toBeNull();
    expect(verifier.verify(payload, stale)).toBeNull();
  });

  it('rejects requests when no webhook secret is configured', () => {
    expect(service('').verify(payload, signedHeaders(Buffer.from('any-key')))).toBeNull();
  });
});
