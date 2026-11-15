import { Injectable, Logger } from '@nestjs/common';

import { RecordsService } from './records.service';

/** What the organisation's applicants see on the hosted verification screens. */
export interface Branding {
  /** The name shown to applicants ("Verify for X"). Falls back to the org name, then "VeriSec". */
  companyName: string | null;
  /** Where a finished applicant is sent back to (a "Return to X" button). https only. */
  returnUrl: string | null;
  /** The logo shown at the top of the flow, as a small data URL (or null for the VeriSec mark). */
  logo: string | null;
}

const EMPTY: Branding = { companyName: null, returnUrl: null, logo: null };

/**
 * Per-organisation branding for the applicant-facing verification flow: the company name and logo
 * the applicant sees, and the URL they return to when they finish. Stored in `org_branding` (one row
 * per tenant) through the shared records Postgres. This is the white-label layer — it never affects
 * the console's own identity (that is Business Info, held in Zitadel).
 */
@Injectable()
export class BrandingService {
  private readonly log = new Logger('Branding');
  private schemaReady = false;

  constructor(private readonly records: RecordsService) {}

  private async ensureSchema(): Promise<boolean> {
    if (this.schemaReady) return true;
    if (!this.records?.ready) return false;
    try {
      await this.records.query(`
        CREATE TABLE IF NOT EXISTS org_branding (
          tenant       text PRIMARY KEY,
          company_name text,
          return_url   text,
          logo         text,
          updated_at   timestamptz NOT NULL DEFAULT now()
        );
      `);
      this.schemaReady = true;
      return true;
    } catch (e) {
      this.log.error(`org_branding table: ${(e as Error).message}`);
      return false;
    }
  }

  /** The organisation's branding (all nulls when nothing is set yet). */
  async get(tenant: string): Promise<Branding> {
    if (!tenant || !(await this.ensureSchema())) return { ...EMPTY };
    const rows = await this.records
      .query<{ company_name: string | null; return_url: string | null; logo: string | null }>(
        'SELECT company_name, return_url, logo FROM org_branding WHERE tenant = $1',
        [tenant],
      )
      .catch(() => []);
    const r = rows[0];
    return r ? { companyName: r.company_name, returnUrl: r.return_url, logo: r.logo } : { ...EMPTY };
  }

  /** Set the company name and/or return URL. `undefined` leaves a field as it is; `null`/'' clears it. */
  async set(tenant: string, patch: { companyName?: string | null; returnUrl?: string | null }): Promise<Branding> {
    await this.ensureSchema();
    const cur = await this.get(tenant);
    const companyName = patch.companyName === undefined ? cur.companyName : (patch.companyName?.trim() || null);
    const returnUrl = patch.returnUrl === undefined ? cur.returnUrl : (patch.returnUrl?.trim() || null);
    await this.records.query(
      `INSERT INTO org_branding (tenant, company_name, return_url, logo, updated_at)
         VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant) DO UPDATE SET company_name = $2, return_url = $3, updated_at = now()`,
      [tenant, companyName, returnUrl, cur.logo],
    );
    return { companyName, returnUrl, logo: cur.logo };
  }

  /** Set or clear the logo (a small data URL, or null to go back to the VeriSec mark). */
  async setLogo(tenant: string, logo: string | null): Promise<Branding> {
    await this.ensureSchema();
    const cur = await this.get(tenant);
    await this.records.query(
      `INSERT INTO org_branding (tenant, company_name, return_url, logo, updated_at)
         VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant) DO UPDATE SET logo = $4, updated_at = now()`,
      [tenant, cur.companyName, cur.returnUrl, logo],
    );
    return { ...cur, logo };
  }
}
