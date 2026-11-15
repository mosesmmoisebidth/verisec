/**
 * Payment-card display helpers. Formatting only: the Card API has already
 * run Luhn, looked up the BIN and decided whether the card is expired.
 */

import type { CardRead } from "./types";

type Pan = { first6?: string | null; last4?: string | null; length: number };

/** The value of one field exactly as the engine named it (number, valid_thru,
 * holder_name, company_name, valid_from, or anything else it emits). */
export function cardField(card: Pick<CardRead, "fields">, name: string): string | undefined {
  return card.fields?.find((f) => f.name === name && f.value)?.value ?? undefined;
}

/** The engine's confidence for that field, when it gave one. */
export function cardFieldConf(card: Pick<CardRead, "fields">, name: string): number | undefined {
  return card.fields?.find((f) => f.name === name)?.confidence;
}

/** The Luhn checksum over a whole card number (digits only), as card networks use it
 * to catch a mistyped digit. Runs in the page, so the number is never sent. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits.charAt(digits.length - 1 - i));
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** Groups of four, or 4-6-5 for a 15-digit American Express number. */
export function groupPan(pan: string): string {
  if (pan.length === 15) return `${pan.slice(0, 4)} ${pan.slice(4, 10)} ${pan.slice(10)}`;
  return pan.replace(/(.{4})/g, "$1 ").trim();
}

/** First six and last four with bullets between, grouped like the card. */
export function maskedPan(card: Pan): string {
  if (!card.first6 || !card.last4) return "Not read";
  const hidden = Math.max(0, card.length - 10);
  return groupPan(`${card.first6}${"•".repeat(hidden)}${card.last4}`);
}

/** Short form for tables: "•••• 6464". */
export function shortPan(card: Pan): string {
  return card.last4 ? `•••• ${card.last4}` : "Not read";
}

/**
 * The network from the number's prefix alone, for a BIN the table doesn't
 * hold. The table's answer always wins when there is one.
 */
export function networkFromPrefix(digits: string): string | null {
  const p = digits.replace(/\D/g, "");
  const n = (len: number) => Number(p.slice(0, len));
  if (p.length < 2) return null;
  if (p.startsWith("4")) return "Visa";
  if ((n(2) >= 51 && n(2) <= 55) || (p.length >= 4 && n(4) >= 2221 && n(4) <= 2720)) return "Mastercard";
  if (p.startsWith("34") || p.startsWith("37")) return "American Express";
  if (p.startsWith("6011") || p.startsWith("65") || (p.length >= 3 && n(3) >= 644 && n(3) <= 649)) {
    return "Discover";
  }
  if (p.startsWith("62")) return "UnionPay";
  if (p.length >= 4 && n(4) >= 3528 && n(4) <= 3589) return "JCB";
  if (p.startsWith("36") || p.startsWith("38") || p.startsWith("39") || (p.length >= 3 && n(3) >= 300 && n(3) <= 305)) {
    return "Diners Club";
  }
  if (p.startsWith("50") || (n(2) >= 56 && n(2) <= 69)) return "Maestro";
  return null;
}

let regionNames: Intl.DisplayNames | null | undefined;

/** "RW" → "Rwanda", via the platform's own region names. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
