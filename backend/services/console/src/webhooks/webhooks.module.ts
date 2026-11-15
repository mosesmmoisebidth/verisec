import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DeliveryClient } from './delivery.client';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Webhooks (/api/webhooks) and the event outbox.
 *
 * Global so any module can inject `WebhooksService` and call `emit()` without importing this one
 * (KycModule would otherwise import it while it reads KycModule's records store: a cycle). The
 * records store (RecordsService, KycModule) is looked up at runtime for the same reason.
 * AuthModule: the operator guard confirms console sessions with it.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [DeliveryClient, WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
