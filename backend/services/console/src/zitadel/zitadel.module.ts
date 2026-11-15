import { Module } from '@nestjs/common';

import { ZitadelService } from './zitadel.service';

@Module({
  providers: [ZitadelService],
  exports: [ZitadelService],
})
export class ZitadelModule {}
