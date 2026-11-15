import { UnauthorizedException } from '@nestjs/common';

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('svix', () => ({ Webhook: class Webhook { constructor() { throw new Error('use manual verification in unit tests'); } } }));

import { CreditsService, toMicro } from './credits.service';
import { EntitlementsService } from './entitlements.service';
import { PolarWebhookController } from './polar.controller';
import { PolarService, type PolarEvent } from './polar.service';
import { RecordsService } from './records.service';
import { MailService } from '../mail/mail.service';

const request = { rawBody: Buffer.from('{"type":"order.paid"}'), headers: {} } as never;
const paid: PolarEvent = {
  id: 'msg_paid_1',
  type: 'order.paid',
  data: { id: 'ord_paid_1', metadata: { org: 'org_test', credits: '25', product: 'Credit pack' } },
};

function controller() {
  const polar = { verify: jest.fn(), invoiceUrl: jest.fn().mockResolvedValue(null), origin: 'https://verisec.dev' } as unknown as PolarService;
  const credits = { topUp: jest.fn() } as unknown as CreditsService;
  const entitlements = { grant: jest.fn(), revoke: jest.fn(), orgOfSubscription: jest.fn() } as unknown as EntitlementsService;
  const records = { query: jest.fn() } as unknown as RecordsService;
  const mail = { sendReceipt: jest.fn().mockResolvedValue(undefined) } as unknown as MailService;
  return {
    instance: new PolarWebhookController(polar, credits, entitlements, records, mail),
    polar: polar as unknown as { verify: jest.Mock },
    credits: credits as unknown as { topUp: jest.Mock },
    entitlements: entitlements as unknown as { grant: jest.Mock; revoke: jest.Mock },
    records: records as unknown as { query: jest.Mock },
  };
}

describe('PolarWebhookController', () => {
  it('rejects an invalid signature before touching the database or ledger', async () => {
    const c = controller();
    c.polar.verify.mockReturnValue(null);

    await expect(c.instance.webhook(request)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(c.records.query).not.toHaveBeenCalled();
    expect(c.credits.topUp).not.toHaveBeenCalled();
  });

  it('credits the organisation from a verified order once and acknowledges duplicate deliveries', async () => {
    const c = controller();
    c.polar.verify.mockReturnValue(paid);
    c.records.query.mockResolvedValueOnce([{ id: paid.id }]).mockResolvedValueOnce([]);
    c.credits.topUp.mockResolvedValue({ added: toMicro(25), balance: toMicro(30), duplicate: false });

    await expect(c.instance.webhook(request)).resolves.toEqual({ ok: true });
    await expect(c.instance.webhook(request)).resolves.toEqual({ ok: true });

    expect(c.credits.topUp).toHaveBeenCalledTimes(1);
    expect(c.credits.topUp).toHaveBeenCalledWith('org_test', toMicro(25), {
      ref: 'ord_paid_1',
      note: 'Credit pack: 25 credits added',
    });
  });

  it('removes the delivery marker when crediting fails so Polar retries can apply it', async () => {
    const c = controller();
    const failure = new Error('ledger unavailable');
    c.polar.verify.mockReturnValue(paid);
    c.records.query.mockResolvedValueOnce([{ id: paid.id }]).mockResolvedValueOnce([]);
    c.credits.topUp.mockRejectedValue(failure);

    await expect(c.instance.webhook(request)).rejects.toBe(failure);
    expect(c.records.query).toHaveBeenNthCalledWith(2, 'DELETE FROM polar_events WHERE id = $1', [paid.id]);
  });
});
