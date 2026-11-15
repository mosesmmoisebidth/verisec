import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import {
  IntegrationsCallbackController,
  IntegrationsController,
} from './integrations.controller';
import { IntegrationsService } from './integrations.service';

/**
 * Integrations: the console's per-organisation connections to Slack, Discord, Figma,
 * Google, Telegram and email (run here, free), plus Instagram, TikTok, Google Ads and
 * LinkedIn through Composio. RecordsService (Postgres) and VaultService (OpenBao) are
 * resolved at run time from their own modules, as the webhooks module does.
 */
@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController, IntegrationsCallbackController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
