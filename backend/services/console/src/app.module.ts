import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { KycModule } from './kyc/kyc.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Shared platform secrets live in backend/infra/.env (gitignored).
      envFilePath: [join(process.cwd(), '..', '..', 'infra', '.env')],
    }),
    AuditModule,
    NotificationsModule,
    AuthModule,
    KycModule,
    WebhooksModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
