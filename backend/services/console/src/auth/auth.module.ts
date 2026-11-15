import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { ZitadelModule } from '../zitadel/zitadel.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { ContactController } from './contact.controller';

@Module({
  imports: [ZitadelModule, MailModule],
  controllers: [AuthController, ContactController],
  providers: [AuthService, CaptchaService],
  exports: [AuthService, CaptchaService],
})
export class AuthModule {}
