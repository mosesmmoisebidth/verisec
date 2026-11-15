import { KycEvents } from './kyc-events';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ZitadelModule } from '../zitadel/zitadel.module';

import { ExplorerController } from './explorer.controller';
import { PlaygroundController } from './playground.controller';
import { DemoController } from './demo.controller';
import { DemoStore } from './demo.store';
import { FingerprintClient } from './fingerprint.client';
import { IntelClient } from './intel.client';
import { KeysController, KeysGuard } from './keys.controller';
import { KycController } from './kyc.controller';
import { KycMailService } from './kyc-mail.service';
import { KycService } from './kyc.service';
import { MetricsService } from './metrics.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { PoaService } from './poa.service';
import { VaultService } from './vault.service';
import { MtlsService } from './mtls.service';
import { SessionsService } from './sessions.service';
import { RecordsService } from './records.service';
import { OperatorGuard, VerificationsController } from './verifications.controller';
import { DocumentsService } from './documents.service';
import { DeviceService } from './device.service';
import { BillingController } from './billing.controller';
import { CreditsService } from './credits.service';
import { BillingSweeper } from './billing.sweeper';
import { GatewayController } from './gateway.controller';
import { KeyServiceClient } from './key-service.client';
import { ExplorerBilling } from './explorer.billing';
import { TeamController } from './team.controller';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { FatfController } from './fatf.controller';
import { FatfService } from './fatf.service';
import { AnonymizerService } from './anonymizer.service';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { PolarService } from './polar.service';
import { EntitlementsService } from './entitlements.service';
import { PolarWebhookController } from './polar.controller';

@Module({
  imports: [AuthModule, ZitadelModule, MailModule],
  controllers: [KycController, VerificationsController, ExplorerController, PlaygroundController, DemoController, KeysController, WorkflowsController, BillingController, GatewayController, TeamController, NotificationsController, FatfController, BrandingController, AccountController, PolarWebhookController],
  providers: [KeysGuard, DeviceService, RecordsService, OperatorGuard, DocumentsService, SessionsService, MtlsService, IntelClient, KycMailService, KycService, PoaService, VaultService, MetricsService, WorkflowsService, KycEvents, CreditsService, BillingSweeper, KeyServiceClient, ExplorerBilling, FatfService, AnonymizerService, BrandingService, AccountService, PolarService, EntitlementsService, DemoStore, FingerprintClient],
})
export class KycModule {}
