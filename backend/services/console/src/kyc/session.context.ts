import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The verification session the current request belongs to, set by the DPoP guard once the
 * request is proven to come from the device that owns the session. Anything issued during
 * the request (e.g. "phone verified" proofs) is bound to it, so it cannot be replayed in
 * another applicant's session.
 */
export const sessionContext = new AsyncLocalStorage<{ sid: string }>();

export function currentSid(): string | undefined {
  return sessionContext.getStore()?.sid;
}
