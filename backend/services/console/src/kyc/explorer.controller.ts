import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, NotFoundException, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';

import { IntelClient } from './intel.client';
import { KycService } from './kyc.service';
import { RecordsService } from './records.service';
import { OperatorGuard } from './verifications.controller';
import { ExplorerBilling } from './explorer.billing';
import { Need, NeedGuard } from '../auth/roles';

type Params = Record<string, unknown>;

const STATUS: Record<string, number> = { invalid_input: 400, not_found: 404, preparing: 503, unavailable: 503 };

/**
 * AML Explorer for signed-in operators: one place to look up screening entities, vessels, aircraft, companies and
 * their owners, AML news, source documents and the raw data catalog. Every call goes to verisec-api /v1/aml over
 * mutual TLS; only the routes below and their listed parameters are forwarded.
 */
@Controller('api/explorer')
@UseGuards(OperatorGuard, NeedGuard)
// what the person's role must allow (auth/roles.ts)
@Need('run')
// every search uses the organisation's credits at the API's price (explorer.billing.ts)
@UseInterceptors(ExplorerBilling)
export class ExplorerController {
  constructor(
    private readonly intel: IntelClient,
    private readonly kyc: KycService,
    private readonly records: RecordsService,
  ) {}

  /* --------------------------------------------------------------- custom tags (shared by the team) -- */

  /** Custom tags are words a team searches by: each organisation keeps its own set. */
  private static readonly TEAM = 'team';
  private static team(req: Request & { org?: string }) {
    return req.org ?? ExplorerController.TEAM;
  }

  @Get('tags')
  async tags(@Req() req: Request & { org?: string }) {
    return { tags: await this.records.listTags(ExplorerController.team(req)) };
  }

  @Post('tags')
  async addTag(@Body() body: { label?: unknown }, @Req() req: Request & { operator?: string; org?: string }) {
    const label = typeof body?.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .&'’/-]{1,59}$/u.test(label)) throw new BadRequestException("A tag is 2 to 60 letters, digits, spaces or . & ' / -");
    return this.records.addTag(ExplorerController.team(req), label, req.operator ?? 'operator');
  }

  @Delete('tags/:id')
  @HttpCode(204)
  async removeTag(@Param('id') id: string, @Req() req: Request & { org?: string }) {
    if (!/^\d{1,12}$/.test(id)) throw new BadRequestException('Unknown tag.');
    if (!(await this.records.removeTag(ExplorerController.team(req), id))) throw new NotFoundException('Unknown tag.');
  }

  /* --------------------------------------------------------------- wallet names -- */

  /** Who is behind an address, by the names the industry uses ("Tornado Cash", "Lazarus Group"), a category or a chain. */
  @Get('wallet/search')
  walletSearch(@Query() q: Params) {
    return this.forward('wallet/search', q, ['q', 'category', 'chain', 'limit', 'offset']);
  }

  @Get('wallet/entity')
  walletEntity(@Query() q: Params) {
    return this.forward('wallet/entity', q, ['id', 'limit', 'offset']);
  }

  @Get('screen/search')
  screen(@Query() q: Params) {
    return this.forward('screen/search', q, ['q', 'limit', 'offset', 'countries', 'topics', 'datasets', 'schema', 'all']);
  }

  /** Screening on every detail known: the name with a date of birth, nationality or country, ID number and entity type,
   *  scored together so the records that fit all of them come first, each with its reasons. */
  @Get('screen/match')
  async screenMatch(@Query('name') name?: string, @Query('schema') schema?: string, @Query('dob') dob?: string, @Query('country') country?: string | string[], @Query('id') id?: string | string[]) {
    const list = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
    const n = String(name ?? '').trim();
    if (n.length < 2 || n.length > 200) throw new BadRequestException('Enter the name to screen.');
    if (dob && !/^(19|20)\d{2}(-\d{2}(-\d{2})?)?$/.test(dob)) throw new BadRequestException('Enter the date of birth as YYYY, YYYY-MM or YYYY-MM-DD.');
    if (schema && !['Person', 'Company', 'Organization', 'LegalEntity'].includes(schema)) throw new BadRequestException('Unknown entity type.');
    const countries = list(country).filter((c) => /^[A-Za-z]{2}$/.test(c));
    const ids = list(id).filter((x) => /^[A-Za-z0-9 ./-]{2,64}$/.test(x));
    return this.unwrap(await this.intel.post('/v1/aml/screen/match', { name: n, schema: schema || undefined, birth_date: dob || undefined, countries, id_numbers: ids, limit: 25 }, 30_000));
  }

  @Get('screen/entity/:id')
  entity(@Param('id') id: string) {
    if (!/^[A-Za-z0-9:_\-.]{3,120}$/.test(id)) throw new BadRequestException('Unknown record.');
    return this.forward(`screen/entity/${encodeURIComponent(id)}`, {}, []);
  }

  @Get('vessel/track')
  track(@Query() q: Params) {
    return this.forward('vessel/track', q, ['mmsi', 'since', 'until', 'limit', 'latest']);
  }

  @Get('vessel')
  vessel(@Query() q: Params) {
    return this.forward('vessel', q, ['imo', 'mmsi', 'name', 'q', 'limit']);
  }

  @Get('aircraft/track')
  aircraftTrack(@Query() q: Params) {
    return this.forward('aircraft/track', q, ['icao24', 'since', 'until', 'limit', 'latest']);
  }

  /** Tolerant search by name, alias, call sign, registration or owner: exact matches first, then the closest few. */
  @Get('search')
  search(@Query() q: Params) {
    return this.forward('search', q, ['type', 'q', 'limit']);
  }

  /** Faceted browsing of vessels / aircraft: every "f.<field>" filter is forwarded (bounded), plus text and paging. */
  @Get('filter')
  filter(@Query() q: Params) {
    const facetKeys = Object.keys(q).filter((k) => /^f\.[a-z_]{1,40}$/.test(k)).slice(0, 40);
    return this.forward('filter', q, ['type', 'q', 'offset', 'limit', 'facet_top', ...facetKeys]);
  }

  /** Web results about a name (adverse media by default), tagged with AML topics. */
  @Get('web')
  web(@Query() q: Params) {
    return this.forward('web/search', q, ['q', 'mode', 'page']);
  }

  /** Wallet screening: everything the sources say about one exact address, with a verdict. */
  @Get('crypto')
  crypto(@Query('address') address?: string) {
    if (typeof address !== 'string' || address.length > 128 || !/^[\x21-\x7e]+$/.test(address.trim())) throw new BadRequestException('Enter one wallet address.');
    return this.forward('crypto/address', { address: address.trim() }, ['address']);
  }

  /** Verdicts for up to 100 wallet addresses at once (commas, spaces or new lines between them). */
  @Get('crypto/screen')
  cryptoScreen(@Query('addresses') addresses?: string) {
    if (typeof addresses !== 'string' || addresses.length > 16000) throw new BadRequestException('Enter up to 100 wallet addresses.');
    return this.screenWallets(addresses.split(/[\s,;]+/).filter(Boolean));
  }

  @Post('crypto/screen')
  @HttpCode(200)
  cryptoScreenPost(@Body() body: unknown) {
    return this.screenWallets(body && typeof body === 'object' ? (body as { addresses?: unknown }).addresses : undefined);
  }

  private async screenWallets(addresses: unknown) {
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 100 ||
        addresses.some((a) => typeof a !== 'string' || a.length > 128 || !/^[\x21-\x7e]+$/.test(a.trim()))) {
      throw new BadRequestException('Enter up to 100 wallet addresses, each up to 128 characters.');
    }
    return this.unwrap(await this.intel.post('/v1/aml/crypto/screen', { addresses: addresses.map((a: string) => a.trim()) }, 30_000));
  }

  @Get('graph/node')
  graphNode(@Query() q: Params) {
    return this.forward('graph/node', q, ['id', 'lei', 'record_id', 'source']);
  }

  @Get('graph/neighbors')
  graphNeighbors(@Query() q: Params) {
    return this.forward('graph/neighbors', q, ['id', 'lei', 'record_id', 'source', 'direction', 'limit', 'offset']);
  }

  @Get('graph/exposure')
  graphExposure(@Query() q: Params) {
    return this.forward('graph/exposure', q, ['id', 'lei', 'record_id', 'source', 'direction', 'depth', 'limit']);
  }

  @Get('graph/stats')
  graphStats() {
    return this.forward('graph/stats', {}, []);
  }

  /** The KYC flow's own checks, for one IP address or one email domain. */
  /** Location, internet provider and abuse reports (outside providers: usually fast, sometimes seconds). */
  @Get('check/ip')
  async checkIp(@Query('ip') ip?: string) {
    if (!ip || !/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new BadRequestException('Enter an IPv4 or IPv6 address.');
    return this.unwrap(await this.intel.post('/v1/screen/ip', { ip }, 30_000));
  }

  /** The anonymity analysis from the platform's own lists: Tor, VPN, data centre, cloud, relay, blocklist, ASN. */
  @Get('intel/ip/analysis')
  async intelIpAnalysis(@Query('ip') ip?: string) {
    if (!ip || !/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new BadRequestException('Enter an IPv4 or IPv6 address.');
    return this.unwrap(await this.intel.post('/v1/ip/analyze', { ip }, 30_000));
  }

  /**
   * Phone: format and country, line status, type and carrier, SMS pumping risk, SIM swap, call forwarding. With a name
   * (and optionally a date of birth and country) the carrier is also asked whether that identity is registered to the
   * number (identity match; carrier coverage is limited to a few countries).
   */
  @Get('intel/phone')
  async intelPhone(
    @Query('phone') phone?: string,
    @Query('first_name') firstName?: string,
    @Query('last_name') lastName?: string,
    @Query('dob') dob?: string,
    @Query('country') country?: string,
  ) {
    const p = String(phone ?? '').replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(p)) throw new BadRequestException('Enter a phone number with its country code, for example +250788123456.');
    const word = (v?: string) => (v && /^[\p{L}'’. -]{1,60}$/u.test(v.trim()) ? v.trim() : undefined);
    return this.unwrap(
      await this.intel.post(
        '/v1/phone/lookup',
        {
          phone: p.startsWith('+') ? p : `+${p}`,
          first_name: word(firstName),
          last_name: word(lastName),
          date_of_birth: dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : undefined,
          country: country && /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : undefined,
        },
        45_000,
      ),
    );
  }

  /** The sites an email address has an account on (checked through each site's sign-up and recovery forms). */
  @Get('intel/email/accounts')
  async intelEmailAccounts(@Query('email') email?: string) {
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter an email address.');
    return this.unwrap(await this.intel.post('/v1/email/footprint', { email }, 150_000));
  }

  /** Public profiles that use a username, across several hundred sites. A shared username is a lead, not proof. */
  @Get('intel/username')
  async intelUsername(@Query('username') username?: string) {
    if (!username || !/^[A-Za-z0-9._-]{2,40}$/.test(username)) throw new BadRequestException('Enter a username of letters, digits, dots, dashes or underscores.');
    return this.unwrap(await this.intel.post('/v1/osint/username', { username, top: 150 }, 200_000));
  }

  /**
   * The applicant flow's own email check (format, temporary-address list, the domain's mail servers, then the mail
   * server asked about this exact mailbox without sending anything). A domain that accepts mail says nothing about
   * one address on it; only the mailbox answer does, and it is reported as proven, refused or not confirmable.
   */
  @Get('check/email')
  async checkEmail(@Query('email') email?: string) {
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter an email address.');
    const c = await this.kyc.emailLookup(email);
    return {
      mailbox: {
        email: c.email,
        domain: c.domain,
        syntax_ok: c.syntaxOk,
        disposable: c.disposable,
        free_provider: c.freeProvider,
        has_mail_server: c.hasMailServer,
        mail_servers: c.mailServers ?? [],
        mailbox: c.mailbox,
        suggestion: c.suggestion ?? null,
      },
    };
  }

  @Get('aircraft')
  aircraft(@Query() q: Params) {
    return this.forward('aircraft', q, ['icao24', 'registration', 'name', 'q', 'limit']);
  }

  @Get('company')
  company(@Query() q: Params) {
    return this.forward('company', q, ['lei', 'record_id', 'registration', 'name', 'q', 'limit']);
  }

  @Get('media')
  media(@Query() q: Params) {
    return this.forward('media/search', q, ['q', 'topic', 'country', 'since', 'limit', 'offset']);
  }

  @Get('documents')
  documents(@Query() q: Params) {
    return this.forward('docs/search', q, ['q', 'limit', 'offset']);
  }

  @Get('catalog/:view')
  catalogRows(@Param('view') view: string, @Query() q: Params) {
    if (!/^t_[a-z0-9_]{1,80}$/.test(view)) throw new BadRequestException('Unknown table.');
    return this.forward(`catalog/${view}`, q, ['limit', 'offset']);
  }

  @Get('catalog')
  catalog(@Query() q: Params) {
    return this.forward('catalog', q, ['q', 'limit', 'offset']);
  }

  private unwrap(r: { ok: boolean; data?: unknown; error?: { code?: string; message?: string } | null }) {
    if (!r.ok) {
      const code = r.error?.code ?? 'unavailable';
      throw new HttpException({ message: r.error?.message ?? 'Please try again shortly.', code }, STATUS[code] ?? 502);
    }
    return r.data;
  }

  private async forward(path: string, query: Params, allowed: string[]) {
    const qs = new URLSearchParams();
    for (const k of allowed) {
      // a repeated parameter (?countries=ru&countries=ua) arrives as an array: keep every value (bounded)
      const values = Array.isArray(query[k]) ? (query[k] as unknown[]).slice(0, 20) : [query[k]];
      for (const v of values) if (typeof v === 'string' && v.trim() && v.length <= (path.startsWith('graph/') && (k === 'id' || k === 'record_id') ? 300 : 200)) qs.append(k, v.trim());
    }
    const search = qs.toString();
    const r = await this.intel.get(`/v1/aml/${path}${search ? `?${search}` : ''}`, 30_000);
    if (!r.ok) {
      const code = r.error?.code ?? 'unavailable';
      throw new HttpException({ message: r.error?.message ?? 'Please try again shortly.', code }, STATUS[code] ?? 502);
    }
    return r.data;
  }
}
