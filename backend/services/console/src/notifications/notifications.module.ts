import { Global, Module } from '@nestjs/common';

import { NotificationsService } from './notifications.service';

/** Global: sign-in (auth), verifications, credits, keys and team all notify through the one service. */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
