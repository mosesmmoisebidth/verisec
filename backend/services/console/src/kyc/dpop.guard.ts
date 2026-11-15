import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { sessionContext } from './session.context';
import { SessionsService, type Authenticated } from './sessions.service';

const PUBLIC = 'kyc:public';
const TENANT = 'kyc:tenant';
/** No session needed (the session bootstrap endpoints). */
export const PublicKyc = () => SetMetadata(PUBLIC, true);
/** Only the tenant's server, with its secret key (creating sessions, reading reports). */
export const TenantOnly = () => SetMetadata(TENANT, true);

type KycRequest = Request & { kycSession?: string; kycHandoff?: Authenticated['handoff'] };

/**
 * Every applicant route requires a DPoP-bound session token plus a fresh proof from the
 * device that owns it (see SessionsService). Tenant routes require the tenant's key.
 */
@Injectable()
export class DpopGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<KycRequest>();
    if (this.reflector.getAllAndOverride<boolean>(TENANT, targets)) {
      if (!this.sessions.isTenant(req.headers.authorization)) {
        throw new HttpException({ ok: false, error: 'unauthorized', reason: 'Tenant key required.' }, HttpStatus.UNAUTHORIZED);
      }
      return true;
    }
    const path = req.originalUrl.split('?')[0];
    const proof = req.headers['dpop'];
    const who = await this.sessions.authenticate(
      req.headers.authorization,
      Array.isArray(proof) ? proof[0] : proof,
      req.method,
      path,
    );
    req.kycSession = who.sid;
    // a phone doing one face step (its routes are already limited; the controller limits what it may record)
    req.kycHandoff = who.handoff;
    return true;
  }
}

/** Runs the handler inside the verified session's context, so what it issues is bound to it. */
@Injectable()
export class SessionContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const sid = ctx.switchToHttp().getRequest<KycRequest>().kycSession;
    if (!sid) return next.handle();
    return new Observable((subscriber) => {
      sessionContext.run({ sid }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
