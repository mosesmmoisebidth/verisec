import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Global so any module can record to the security audit log without wiring an import each time, and
 * without creating a circular dependency (the auth and kyc modules both record to it).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
