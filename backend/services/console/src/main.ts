import { readFileSync } from 'node:fs';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { MetricsService } from './kyc/metrics.service';

async function bootstrap() {
  // Serve HTTPS when a cert is provided (TLS_CERT/TLS_KEY). WebAuthn platform
  // authenticators (Windows Hello / Touch ID) refuse plain-HTTP origins, so the
  // dev site is run over https://localhost — matching production.
  const certPath = process.env.TLS_CERT;
  const keyPath = process.env.TLS_KEY;
  const httpsOptions =
    certPath && keyPath ? { cert: readFileSync(certPath), key: readFileSync(keyPath) } : undefined;

  // rawBody keeps the exact received bytes on req.rawBody (used to verify the Polar webhook signature; parsing
  // and re-serialising JSON would change the bytes and break it). Every other route still gets parsed JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    ...(httpsOptions ? { httpsOptions } : {}),
  });
  // Encrypted documents arrive as JWE in JSON (ID front + back, PoA up to 10 MB); everything else is small.
  app.useBodyParser('json', { limit: '32mb' });
  // Don't advertise the stack, and never let a browser or proxy keep a copy of an API answer
  // (they carry personal data). HSTS pins HTTPS for this origin.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (httpsOptions) res.setHeader('Strict-Transport-Security', 'max-age=63072000');
    next();
  });
  app.use(cookieParser());
  // times every API call for the dashboard (route, status and duration only)
  app.use(app.get(MetricsService).middleware());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Browser origins allowed to call this API with cookies (comma separated); the dev site by default.
  const origins = (process.env.CONSOLE_CORS_ORIGINS ?? 'http://localhost:3000,https://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  const port = process.env.CONSOLE_PORT ?? 3001;
  // Bind address: on a server behind the gateway, only the proxy's network (CONSOLE_HOST); every interface otherwise.
  const host = process.env.CONSOLE_HOST;
  await (host ? app.listen(port, host) : app.listen(port));
  // eslint-disable-next-line no-console
  console.log(`VeriSec console API on ${httpsOptions ? 'https' : 'http'}://localhost:${port}`);
}
void bootstrap();
