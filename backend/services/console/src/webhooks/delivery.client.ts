import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * A small client for the webhook delivery server (infra/docker-compose.yml "svix", self-hosted,
 * published on 127.0.0.1 only). Plain REST over fetch: the server signs, queues, retries and keeps
 * the attempt log; this client only carries requests.
 *
 * Nothing from here is passed to the browser as-is. The service maps every answer to its own shapes
 * and every failure to its own words, so the engine never shows in the console or its JSON.
 */

export class DeliveryError extends Error {
  constructor(
    readonly status: number,
    /** The server's error code, for logs only (0 = could not reach it). */
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Delivery status of a message or attempt, as the server numbers it. */
export const DeliveryState = {
  Success: 0,
  Pending: 1,
  Fail: 2,
  Sending: 3,
} as const;
export type DeliveryState = (typeof DeliveryState)[keyof typeof DeliveryState];

export interface DsEndpoint {
  id: string;
  uid?: string | null;
  url: string;
  description: string;
  disabled?: boolean;
  eventTypes?: string[] | null;
  channels?: string[] | null;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface DsEndpointIn {
  uid?: string;
  url: string;
  description?: string;
  disabled?: boolean;
  eventTypes?: string[];
  channels?: string[];
  secret?: string;
  metadata?: Record<string, string>;
}

export interface DsMessageIn {
  eventType: string;
  eventId?: string;
  payload: Record<string, unknown>;
  channels?: string[];
  application?: { name: string; uid: string };
}

export interface DsMessage {
  id: string;
  eventType: string;
  eventId?: string | null;
  timestamp: string;
}

export interface DsAttempt {
  id: string;
  msgId: string;
  endpointId: string;
  responseStatusCode: number;
  responseDurationMs: number;
  status: DeliveryState;
  triggerType: 0 | 1;
  timestamp: string;
}

export interface DsEndpointMessage {
  id: string;
  eventType: string;
  status: DeliveryState;
  nextAttempt?: string | null;
  timestamp: string;
}

interface List<T> {
  data: T[];
  done: boolean;
  iterator?: string | null;
}

@Injectable()
export class DeliveryClient {
  private readonly base: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    this.base = (config.get<string>('SVIX_URL') ?? '').replace(/\/+$/, '');
    this.token = config.get<string>('SVIX_TOKEN') ?? '';
  }

  /** Whether the console has what it needs to reach the delivery server at all. */
  get configured(): boolean {
    return Boolean(this.base && this.token);
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    timeoutMs = 8000,
  ): Promise<T> {
    if (!this.configured)
      throw new DeliveryError(0, 'not_configured', 'delivery server not set');
    let r: Response;
    try {
      r = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new DeliveryError(0, 'unreachable', (e as Error).message);
    }
    const text = await r.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!r.ok) {
      const d = data as { code?: string; detail?: unknown } | null;
      const detail =
        typeof d?.detail === 'string'
          ? d.detail
          : JSON.stringify(d?.detail ?? '').slice(0, 300);
      throw new DeliveryError(r.status, d?.code ?? `http_${r.status}`, detail);
    }
    return data as T;
  }

  /* ------------------------------------------------------------ event types -- */

  /** Creates the event type, or leaves it as it is when it already exists. */
  async ensureEventType(name: string, description: string): Promise<void> {
    try {
      await this.call('POST', '/api/v1/event-type/', { name, description });
    } catch (e) {
      if (e instanceof DeliveryError && e.status === 409) return;
      throw e;
    }
  }

  /* ---------------------------------------------------------- applications -- */

  async ensureApp(uid: string, name: string): Promise<void> {
    await this.call('POST', '/api/v1/app/?get_if_exists=true', { uid, name });
  }

  /* -------------------------------------------------------------- endpoints -- */

  async listEndpoints(app: string): Promise<DsEndpoint[]> {
    try {
      const r = await this.call<List<DsEndpoint>>(
        'GET',
        `/api/v1/app/${enc(app)}/endpoint/?limit=250`,
      );
      return r.data;
    } catch (e) {
      // an organisation that never had an endpoint in this environment has no application yet
      if (e instanceof DeliveryError && e.status === 404) return [];
      throw e;
    }
  }

  getEndpoint(app: string, ep: string): Promise<DsEndpoint> {
    return this.call('GET', `/api/v1/app/${enc(app)}/endpoint/${enc(ep)}`);
  }

  createEndpoint(app: string, input: DsEndpointIn): Promise<DsEndpoint> {
    return this.call('POST', `/api/v1/app/${enc(app)}/endpoint/`, input);
  }

  patchEndpoint(
    app: string,
    ep: string,
    patch: Partial<DsEndpointIn>,
  ): Promise<DsEndpoint> {
    return this.call(
      'PATCH',
      `/api/v1/app/${enc(app)}/endpoint/${enc(ep)}`,
      patch,
    );
  }

  async deleteEndpoint(app: string, ep: string): Promise<void> {
    try {
      await this.call('DELETE', `/api/v1/app/${enc(app)}/endpoint/${enc(ep)}`);
    } catch (e) {
      if (e instanceof DeliveryError && e.status === 404) return;
      throw e;
    }
  }

  /** The previous secret keeps signing (alongside the new one) for 24 hours. */
  async rotateSecret(app: string, ep: string, key: string): Promise<void> {
    await this.call(
      'POST',
      `/api/v1/app/${enc(app)}/endpoint/${enc(ep)}/secret/rotate`,
      { key },
    );
  }

  /* --------------------------------------------------------------- messages -- */

  /** `idempotencyKey`: the same key within the server's window returns the first answer again. */
  sendMessage(
    app: string,
    msg: DsMessageIn,
    idempotencyKey?: string,
  ): Promise<DsMessage> {
    return this.call(
      'POST',
      `/api/v1/app/${enc(app)}/msg/?with_content=false`,
      msg,
      idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
    );
  }

  getMessage(app: string, msgId: string): Promise<DsMessage> {
    return this.call(
      'GET',
      `/api/v1/app/${enc(app)}/msg/${enc(msgId)}?with_content=false`,
    );
  }

  async attemptsByEndpoint(
    app: string,
    ep: string,
    limit: number,
  ): Promise<DsAttempt[]> {
    const r = await this.call<List<DsAttempt>>(
      'GET',
      `/api/v1/app/${enc(app)}/attempt/endpoint/${enc(ep)}/?limit=${limit}&with_content=false`,
    );
    return r.data;
  }

  async messagesByEndpoint(
    app: string,
    ep: string,
    limit: number,
  ): Promise<DsEndpointMessage[]> {
    const r = await this.call<List<DsEndpointMessage>>(
      'GET',
      `/api/v1/app/${enc(app)}/endpoint/${enc(ep)}/msg/?limit=${limit}&with_content=false`,
    );
    return r.data;
  }

  async resend(app: string, msgId: string, ep: string): Promise<void> {
    await this.call(
      'POST',
      `/api/v1/app/${enc(app)}/msg/${enc(msgId)}/endpoint/${enc(ep)}/resend`,
    );
  }
}

const enc = encodeURIComponent;
