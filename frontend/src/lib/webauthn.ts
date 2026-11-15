/**
 * WebAuthn (passkey / security key) browser glue.
 *
 * Zitadel hands us creation/request options with the binary fields (challenge,
 * ids) as base64url strings; the browser's credential API needs them as
 * ArrayBuffers, and hands back ArrayBuffers we must re-encode as base64url for
 * Zitadel. These helpers do exactly that conversion — nothing else.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function b64urlToBuf(s: string): ArrayBuffer {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True when this browser can do WebAuthn at all. */
export function passkeySupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/**
 * True when THIS device has a usable built-in authenticator (Windows Hello with
 * a PIN/face set, Touch ID, etc.). When false, the "This device" option can't
 * work — the person needs to set up Windows Hello, or pick phone / security key.
 */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!passkeySupported()) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** How the user chose to register the passkey (picked in our own UI). */
export type PasskeyChoice = "this-device" | "phone" | "security-key";

/**
 * Register a new passkey against Zitadel's creation options, steered to the
 * authenticator the user picked in our UI (rather than whatever the browser
 * defaults to): this device's Windows Hello / Touch ID, another phone (the QR /
 * cross-device flow), or a plugged-in security key.
 */
export async function createPasskey(options: any, choice: PasskeyChoice = "this-device"): Promise<any> {
  const pk = options?.publicKey ?? options;
  // Route precisely to what the user picked:
  //  - "This device" → `platform` so it uses Windows Hello / Touch ID and does
  //    NOT fall through to the "use another phone" QR flow.
  //  - "Your phone" / "Security key" → `cross-platform`, with a `hint` to tell
  //    the two apart. (Brave hides the SILENT availability check for privacy,
  //    but still honours an explicit, user-clicked create like this one.)
  const attachment = choice === "this-device" ? "platform" : "cross-platform";
  const publicKey: any = {
    ...pk,
    challenge: b64urlToBuf(pk.challenge),
    user: { ...pk.user, id: b64urlToBuf(pk.user.id) },
    excludeCredentials: (pk.excludeCredentials ?? []).map((c: any) => ({ ...c, id: b64urlToBuf(c.id) })),
    authenticatorSelection: {
      ...(pk.authenticatorSelection ?? {}),
      authenticatorAttachment: attachment,
      // `preferred` (discoverable) — this is how real passkey sites request
      // Windows Hello / Touch ID; the non-standard `discouraged` is what makes
      // Windows reject it with "your device can't be used with this site".
      residentKey: "preferred",
      requireResidentKey: false,
    },
  };
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  const r = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bufToB64url(r.attestationObject),
      clientDataJSON: bufToB64url(r.clientDataJSON),
    },
  };
}

/** Prove possession of a passkey against Zitadel's request options (login). */
export async function getPasskeyAssertion(options: any): Promise<any> {
  const pk = options?.publicKey ?? options;
  const cred = (await navigator.credentials.get({
    publicKey: {
      ...pk,
      challenge: b64urlToBuf(pk.challenge),
      // Offer the credential through EVERY transport, so the browser shows the
      // full chooser — this device (Windows Hello / Touch ID), a security key,
      // or another phone (the QR / cross-device flow) — and you pick.
      allowCredentials: (pk.allowCredentials ?? []).map((c: any) => ({
        ...c,
        id: b64urlToBuf(c.id),
        transports: c.transports?.length ? c.transports : ["internal", "hybrid", "usb", "nfc", "ble"],
      })),
    },
  })) as PublicKeyCredential;
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufToB64url(r.authenticatorData),
      clientDataJSON: bufToB64url(r.clientDataJSON),
      signature: bufToB64url(r.signature),
      userHandle: r.userHandle ? bufToB64url(r.userHandle) : null,
    },
  };
}
