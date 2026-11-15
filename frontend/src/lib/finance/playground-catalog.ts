/**
 * The Financial API Playground's catalog: every MICR and card API we sell, the
 * major reads and the focused ones, each with exactly the parameters its service
 * accepts, a real example response (captured from the running services, see
 * fixtures.ts and playground-examples.ts) and its "How to use" guide.
 *
 * Shapes follow the KYC Playground's (Param, EndpointDocs) so the console reads
 * the same way; what differs is how a request travels: an image goes as a
 * multipart upload, typed checks as JSON, lookups in the URL.
 */

import type { EndpointDocs, Param } from "@/lib/console/playground-run";
import { cardVisa, chequeDeepUs, chequeUs } from "@/lib/finance/fixtures";
import {
  bankLookup,
  binLookup,
  cardCheck,
  cardExpiry,
  cardFingerprint,
  cardNumber,
  chequeAmount,
  chequeBank,
  chequeDate,
  chequeParties,
  micrLine,
} from "@/lib/finance/playground-examples";

export type FinGroup = "MICR" | "Credit Card";
/** How the request carries its parameters. */
export type BodyKind = "multipart" | "json" | "query" | "path";

export interface FinEndpoint {
  id: string;
  name: string;
  group: FinGroup;
  tier: "major" | "minor";
  method: "GET" | "POST";
  /** Public path; "{digits}" is filled from the parameter of that name. */
  path: string;
  service: "micr" | "card";
  body: BodyKind;
  summary: string;
  params: Param[];
  example: unknown;
  docs: EndpointDocs;
}

export const FIN_GROUPS: FinGroup[] = ["MICR", "Credit Card"];

/* ----------------------------------------------------------------------------
   Parameters
---------------------------------------------------------------------------- */

const chequePhoto: Param = {
  name: "image",
  kind: "image",
  label: "Cheque photo",
  required: true,
  note: "JPG, PNG or BMP, up to 10 MB. Read exactly as uploaded, never resized.",
};
const cardPhoto: Param = {
  name: "image",
  kind: "image",
  label: "Card photo",
  required: true,
  note: "JPG, PNG or BMP, up to 10 MB. The photo is never stored.",
};
const micrFont: Param = {
  name: "format",
  kind: "enum",
  label: "MICR font",
  choices: [
    { value: "auto", label: "Auto" },
    { value: "e13b", label: "E-13B" },
    { value: "cmc7", label: "CMC-7" },
  ],
  default: "auto",
  note: "Auto finds the font for you.",
};
const cardNumberParam: Param = {
  name: "number",
  kind: "string",
  label: "Card number",
  required: true,
  default: "4713768012956464",
  note: "12 to 19 digits; spaces are ignored. Never stored.",
};

/* ----------------------------------------------------------------------------
   Shared guide text
---------------------------------------------------------------------------- */

const ENVELOPE = "The response is the JSON object itself, with no wrapper. A field with no value is left out.";
const imageFailures = [
  { code: "image_too_large", message: "413: the image is over 10 MB.", fix: "Send a smaller photo; a phone photo of the cheque or card is plenty." },
  { code: "unsupported_image", message: "415: not a JPG, PNG or BMP, or not a readable image.", fix: "Save the photo as JPG or PNG and send it again." },
];
const imageLimits = ["JPG, PNG or BMP, up to 10 MB.", "Send the photo as taken: it is read exactly as uploaded."];
const fontFailure = { code: "bad_format", message: "400: format is not auto, e13b or cmc7.", fix: "Leave format out (auto), or send e13b or cmc7." };
const engineFailure = { code: "engine_unavailable", message: "503: the reader is unavailable for a moment.", fix: "Wait a few seconds and send the same request again." };
const readFailure = { code: "read_unavailable", message: "503: the cheque face couldn't be read right now.", fix: "Wait a few seconds and send the same request again." };
const ok = (when: string) => ({ code: "200", label: "OK", when });

/* ----------------------------------------------------------------------------
   The catalog
---------------------------------------------------------------------------- */

export const FIN_ENDPOINTS: FinEndpoint[] = [
  {
    id: "cheque-read",
    name: "Cheque deep read",
    group: "MICR",
    tier: "major",
    method: "POST",
    path: "/v2/cheques/read",
    service: "micr",
    body: "multipart",
    summary:
      "Everything on a cheque in one call: the MICR line with its named fields, what is written on the face (payee, amount in words and figures, date, drawer, bank), the bank matched in our directory, the country and currency. A photo with several cheques returns each one.",
    params: [chequePhoto, micrFont],
    example: chequeDeepUs,
    docs: {
      what:
        "Reads the whole cheque. The MICR line is read and its fields named; the face is read for payee, amounts, date, drawer, bank, crossing and signature; the bank is matched in our directory of about 75,000 banks with its logo; the country and currency are resolved. When one photo holds several cheques, each is read and returned in `cheques`.",
      steps: [
        "Send the cheque photo as `image` in a multipart form, with your key as a Bearer token.",
        "Optionally set `format` to e13b or cmc7; auto finds the MICR font for you.",
        "Read `micr` for the code line, `vision` for the face, `bank` for the matched bank.",
        "If `cheques` is present, the photo held several cheques: read each entry.",
      ],
      returns: [
        { field: "status", note: "read, partial (some characters were weak) or unreadable (no MICR line found)." },
        { field: "micr", note: "The MICR read: every line found, the strongest promoted to micr.micr with its named fields." },
        { field: "vision", note: "What is written on the face: payee, amount (figures, words, numeric, agreement), date, drawer, bank, crossing, signature." },
        { field: "bank", note: "The bank matched in our directory (resolved), with logo, BIC, city and close alternatives." },
        { field: "country / currency", note: "The cheque's country (with where it came from) and its currency." },
        { field: "text_boxes", note: "Every text region found on the photo, for drawing boxes." },
        { field: "cheques", note: "Only when the photo holds several cheques: each one on its own." },
        { field: "timing", note: "Where the time went, in milliseconds." },
      ],
      statuses: [ok("The read ran. Check `status` for how much of the MICR line was read.")],
      failures: [fontFailure, ...imageFailures, engineFailure],
      limits: [...imageLimits, "About 2 to 3 seconds for one cheque.", "The read and the photo are kept in your scan history."],
      envelope: ENVELOPE,
      notes: [
        "If the face can't be read for a moment, the MICR part still comes back and `reader_error` says so.",
        "Amounts, payee and date are read from handwriting: check important values before you act on them.",
      ],
    },
  },
  {
    id: "cheque-micr",
    name: "Cheque MICR read",
    group: "MICR",
    tier: "major",
    method: "POST",
    path: "/v2/cheques/micr",
    service: "micr",
    body: "multipart",
    summary: "The cheque's MICR code line, every line found, each with its fields named, its confidence per character and its position on the photo.",
    params: [chequePhoto, micrFont],
    example: chequeUs,
    docs: {
      what:
        "Finds and reads the MICR code line along the bottom of a cheque (E-13B or CMC-7) and names its fields: the standard naming for the line's layout, a national layout when one applies (for example Canada or India), and the US routing number check when there is one.",
      steps: [
        "Send the cheque photo as `image` in a multipart form.",
        "Optionally set `format`; auto finds the font.",
        "Read `micr` for the strongest line and `zones` for every line found.",
      ],
      returns: [
        { field: "status", note: "read, partial or unreadable, with `issue` in plain words when not read." },
        { field: "micr.text / micr.printed", note: "The line as characters, and as printed with the MICR symbols." },
        { field: "micr.field_list", note: "Every field the font can carry; a field not on this line has an empty value." },
        { field: "micr.confidence / char_confidences", note: "How sure the read is, for the line and for each character (0 to 100)." },
        { field: "micr.box", note: "Where the line sits on the photo (four corners)." },
        { field: "zones", note: "Every MICR line found, strongest first." },
        { field: "quality", note: "Rotation, skew and the weakest character." },
      ],
      statuses: [ok("The read ran. Check `status`.")],
      failures: [fontFailure, ...imageFailures, engineFailure],
      limits: [...imageLimits, "Under a second.", "The read and the photo are kept in your scan history."],
      envelope: ENVELOPE,
      notes: ["The line is read from the original photo; only when no field can be named is a resized copy tried, and `read_on` says so."],
    },
  },
  {
    id: "micr-line",
    name: "MICR line",
    group: "MICR",
    tier: "minor",
    method: "POST",
    path: "/v2/cheques/micr-line",
    service: "micr",
    body: "multipart",
    summary: "Just the MICR line and its named fields, in a small response: the line, the fields it carries, its layout and how sure the read is.",
    params: [chequePhoto, micrFont],
    example: micrLine,
    docs: {
      what:
        "Reads the cheque's MICR line with the same engine and the same field naming as the full reads, and returns only the strongest line: its text, its named fields (standard naming, a national layout when one applies, the US routing check), and its confidence.",
      steps: ["Send the cheque photo as `image`.", "Read `line` for the code line and `fields` for its named fields."],
      returns: [
        { field: "status", note: "read, partial or unreadable." },
        { field: "line", note: "text, printed (with MICR symbols), font, confidence, weakest character and box." },
        { field: "fields", note: "Each field by name; an empty value means this line doesn't carry it." },
        { field: "template", note: "The layout the fields were named by, when one fits." },
        { field: "standard", note: "A national layout, when the line proves one." },
        { field: "routing", note: "The US routing number check, when there is a routing number." },
        { field: "lines_found", note: "How many MICR lines the photo has." },
      ],
      statuses: [ok("The read ran. Check `status`.")],
      failures: [fontFailure, ...imageFailures, engineFailure],
      limits: [...imageLimits, "Under a second.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "cheque-amount",
    name: "Cheque amount",
    group: "MICR",
    tier: "minor",
    method: "POST",
    path: "/v2/cheques/amount",
    service: "micr",
    body: "multipart",
    summary: "The amount in figures and in words, as a number, whether the two agree, and the currency.",
    params: [chequePhoto],
    example: chequeAmount,
    docs: {
      what: "Reads the amount box (figures) and the written amount (words), turns them into a number, says whether they agree, and resolves the currency.",
      steps: ["Send the cheque photo as `image`.", "Use `numeric` and `currency.code`; check `agreement` before you act."],
      returns: [
        { field: "figures", note: "The amount box, as written." },
        { field: "words", note: "The amount in words, as written." },
        { field: "numeric", note: "The amount as a number." },
        { field: "agreement", note: "Whether the words and the figures say the same amount." },
        { field: "currency", note: "ISO 4217 code, name and symbol." },
      ],
      statuses: [ok("The face was read.")],
      failures: [...imageFailures, readFailure],
      limits: [...imageLimits, "About 2 seconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: ["Read from handwriting: check the amount before you act on it."],
    },
  },
  {
    id: "cheque-date",
    name: "Cheque date",
    group: "MICR",
    tier: "minor",
    method: "POST",
    path: "/v2/cheques/date",
    service: "micr",
    body: "multipart",
    summary: "The date as written and as YYYY-MM-DD, its age in days, and whether it is post-dated.",
    params: [chequePhoto],
    example: chequeDate,
    docs: {
      what: "Reads the cheque's date and gives it as written and as an ISO date, with how many days old it is (negative when it is post-dated). Your own rules decide when a cheque is stale.",
      steps: ["Send the cheque photo as `image`.", "Use `iso` and `age_days` with your own stale and post-dated rules."],
      returns: [
        { field: "raw", note: "The date as written." },
        { field: "iso", note: "The same date as YYYY-MM-DD." },
        { field: "age_days", note: "Days since the date; negative when it is in the future." },
        { field: "post_dated", note: "True when the date is in the future." },
      ],
      statuses: [ok("The face was read.")],
      failures: [...imageFailures, readFailure],
      limits: [...imageLimits, "About 2 seconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: ["Read from handwriting: compare `raw` with `iso` when it matters."],
    },
  },
  {
    id: "cheque-parties",
    name: "Cheque parties",
    group: "MICR",
    tier: "minor",
    method: "POST",
    path: "/v2/cheques/parties",
    service: "micr",
    body: "multipart",
    summary: "Who the cheque is paid to (payee) and whose account pays it (drawer).",
    params: [chequePhoto],
    example: chequeParties,
    docs: {
      what: "Reads the payee (the name after Pay) and the drawer (the account holder printed on the cheque).",
      steps: ["Send the cheque photo as `image`.", "Use `payee` and `drawer`."],
      returns: [
        { field: "payee", note: "The name the cheque is paid to." },
        { field: "drawer", note: "The account holder printed on the cheque." },
      ],
      statuses: [ok("The face was read.")],
      failures: [...imageFailures, readFailure],
      limits: [...imageLimits, "About 2 seconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: ["A name that isn't on the cheque is left out, never guessed."],
    },
  },
  {
    id: "cheque-bank",
    name: "Cheque bank",
    group: "MICR",
    tier: "minor",
    method: "POST",
    path: "/v2/cheques/bank",
    service: "micr",
    body: "multipart",
    summary: "The bank printed on the cheque, matched in our bank directory: name, BIC, city, logo and country with its flag.",
    params: [chequePhoto],
    example: chequeBank,
    docs: {
      what: "Reads the bank's printed details on the cheque and matches them in our directory of about 75,000 banks, returning the bank's record with its logo and its country's flag.",
      steps: ["Send the cheque photo as `image`.", "Use `bank` when present; `read` is what the cheque says."],
      returns: [
        { field: "read", note: "The bank name, branch, address and country as read from the cheque." },
        { field: "bank", note: "The matched bank: name, BIC, city, address, logo_url, flag_url. Absent when no bank matched." },
        { field: "match_confidence", note: "How strong the match is (0 to 1)." },
        { field: "country", note: "Code, name and flag of the bank's country." },
      ],
      statuses: [ok("The face was read; `bank` is present when the directory has it.")],
      failures: [...imageFailures, readFailure],
      limits: [...imageLimits, "About 2 seconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: ["A bank not in the directory is never forced onto another: `bank` is left out."],
    },
  },
  {
    id: "bank-lookup",
    name: "Bank lookup",
    group: "MICR",
    tier: "minor",
    method: "GET",
    path: "/v2/banks",
    service: "micr",
    body: "query",
    summary: "Find a bank in our directory by BIC, or by name and country: its record, logo and flag, how surely the names agree, and close alternatives.",
    params: [
      { name: "name", kind: "string", label: "Bank name", default: "Stanbic Bank", note: "The bank's name, as you have it." },
      { name: "country", kind: "string", label: "Country", default: "UG", note: "ISO 3166-1 alpha-2, for example UG. Narrows the search." },
      { name: "bic", kind: "string", label: "BIC / SWIFT", note: "8 or 11 characters. When given, the name is not needed." },
    ],
    example: bankLookup,
    docs: {
      what: "Looks a bank up in our directory of about 75,000 banks: by BIC directly, or by name (best with the country). Returns the best match with its logo and flag, a name match score and close alternatives.",
      steps: ["Send `bic`, or `name` with `country`, as query parameters.", "Trust `bank` when `verified` is true; otherwise look at `alternatives`."],
      returns: [
        { field: "bank", note: "The matched bank: name, BIC, city, address, country, logo_url, flag_url." },
        { field: "name_match", note: "How surely your name and the bank's name are the same bank (0 to 1)." },
        { field: "verified", note: "True when the match is sure (name match 0.80 or more, or an exact BIC)." },
        { field: "alternatives", note: "Other close banks, best first." },
      ],
      statuses: [ok("The lookup ran; `bank` is absent when nothing matched.")],
      failures: [{ code: "missing_query", message: "400: neither a name nor a BIC was sent.", fix: "Send `name` (and `country`) or `bic`." }],
      limits: ["Answers in milliseconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "card-read",
    name: "Card read",
    group: "Credit Card",
    tier: "major",
    method: "POST",
    path: "/v2/cards/read",
    service: "card",
    body: "multipart",
    summary:
      "Everything on a payment card from one photo: number, expiry, holder, the checks (Luhn, length, expiry), the BIN record (network, type, issuer, country with flag) and the issuer's bank with its logo.",
    params: [cardPhoto],
    example: cardVisa,
    docs: {
      what:
        "Reads every card in the photo: the number, expiry and holder name with their confidences, runs the checks (Luhn, length for the network, expiry), looks up the BIN (network, type, level, issuer, country) and matches the issuer in our bank directory with its logo.",
      steps: ["Send the card photo as `image` in a multipart form.", "Read `card` for the strongest card, `bin` and `bank` for who issued it, `cards` for every card found."],
      returns: [
        { field: "status", note: "read, partial (number unreadable or failed its checksum) or unreadable (no card)." },
        { field: "card.number", note: "The full number: in this response only, never stored." },
        { field: "card.fields", note: "Every field read (number, valid_thru, holder_name, ...) with its confidence." },
        { field: "card.luhn_valid / scheme_valid", note: "The checksum, and checksum plus a length that fits the network." },
        { field: "card.expired / expires_in_days", note: "From the expiry date." },
        { field: "card.fingerprint", note: "A stable id for the card, safe to store." },
        { field: "bin", note: "Network, type, level, funding, issuer, country with flag, currency." },
        { field: "bank", note: "The issuer matched in our bank directory, with logo and BIC." },
      ],
      statuses: [ok("The read ran. Check `status`.")],
      failures: [...imageFailures, engineFailure],
      limits: [...imageLimits, "About half a second.", "Stored: first six and last four digits only; the photo never."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "card-number",
    name: "Card number",
    group: "Credit Card",
    tier: "minor",
    method: "POST",
    path: "/v2/cards/number",
    service: "card",
    body: "multipart",
    summary: "The card number from a photo, with its network and whether it passes its checks.",
    params: [cardPhoto],
    example: cardNumber,
    docs: {
      what: "Reads the card number from a photo with the same engine as the full card read, and returns it with its network and checks.",
      steps: ["Send the card photo as `image`.", "Use `number` when `status` is read."],
      returns: [
        { field: "status", note: "read, partial (the number failed its checksum, or couldn't be read) or unreadable (no card)." },
        { field: "number", note: "The full number: in this response only, never stored." },
        { field: "first6 / last4 / length", note: "Safe-to-store parts of the number." },
        { field: "network", note: "Visa, Mastercard and so on." },
        { field: "luhn_valid / scheme_valid", note: "The checksum, and checksum plus a length that fits the network." },
        { field: "confidence", note: "How sure the read of the number is (0 to 100)." },
      ],
      statuses: [ok("The read ran. Check `status`.")],
      failures: [...imageFailures, engineFailure],
      limits: [...imageLimits, "About half a second.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "card-expiry",
    name: "Card expiry",
    group: "Credit Card",
    tier: "minor",
    method: "POST",
    path: "/v2/cards/expiry",
    service: "card",
    body: "multipart",
    summary: "The expiry date from a photo: valid thru (and from, when printed), whether the card has expired, and days left.",
    params: [cardPhoto],
    example: cardExpiry,
    docs: {
      what: "Reads the expiry date from a card photo and works out whether the card has expired and how many days it has left.",
      steps: ["Send the card photo as `image`.", "Use `expiry_status` (valid, expiring_soon, expired)."],
      returns: [
        { field: "valid_thru", note: "MM/YY as printed." },
        { field: "valid_from", note: "When the card prints it." },
        { field: "expired / expires_in_days", note: "Whether it has expired, and days left (negative once expired)." },
        { field: "expiry_status", note: "valid, expiring_soon (60 days or less) or expired." },
        { field: "confidence", note: "How sure the read of the date is (0 to 100)." },
      ],
      statuses: [ok("The read ran. Check `status`.")],
      failures: [...imageFailures, engineFailure],
      limits: [...imageLimits, "About half a second.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "card-check",
    name: "Card check",
    group: "Credit Card",
    tier: "minor",
    method: "POST",
    path: "/v2/cards/check",
    service: "card",
    body: "json",
    summary: "Check a typed card number, no photo: checksum, length for its network, expiry, and who issued it. Returns only the first six and last four digits.",
    params: [cardNumberParam, { name: "expiry", kind: "string", label: "Expiry", default: "02/29", note: "MM/YY. Optional." }],
    example: cardCheck,
    docs: {
      what: "Runs the card checks on a number you send (for example from a checkout form): the Luhn checksum, a length that fits the network, the expiry, and the BIN record of who issued it.",
      steps: ["POST JSON with `number` (and `expiry` as MM/YY).", "Accept the card when `scheme_valid` is true and `expired` is false."],
      returns: [
        { field: "luhn_valid / length_valid / scheme_valid", note: "The checksum, the length for the network, and both together." },
        { field: "network", note: "Visa, Mastercard and so on." },
        { field: "expired / expires_in_days / expiry_status", note: "When you send an expiry." },
        { field: "bin", note: "Who issued it: network, type, funding, issuer, country with flag, currency." },
        { field: "first6 / last4", note: "The full number is never returned or stored." },
      ],
      statuses: [ok("The checks ran.")],
      failures: [
        { code: "bad_number", message: "400: the number isn't 12 to 19 digits.", fix: "Send the full card number." },
        { code: "bad_expiry", message: "400: the expiry isn't MM/YY.", fix: "Send it as MM/YY, for example 02/29." },
      ],
      limits: ["Answers in milliseconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
  {
    id: "card-fingerprint",
    name: "Card fingerprint",
    group: "Credit Card",
    tier: "minor",
    method: "POST",
    path: "/v2/cards/fingerprint",
    service: "card",
    body: "json",
    summary: "A stable, privacy-safe id for a card number: the same card always gives the same fingerprint, so cards can be matched without storing them.",
    params: [cardNumberParam],
    example: cardFingerprint,
    docs: {
      what: "Turns a card number into a fingerprint: always the same for the same card, and impossible to turn back into the number. Store it to spot a card you have seen before.",
      steps: ["POST JSON with `number`.", "Store `fingerprint`, never the number."],
      returns: [
        { field: "fingerprint", note: "A keyed hash of the number, safe to store and compare." },
        { field: "first6 / last4", note: "Safe-to-store parts of the number." },
      ],
      statuses: [ok("The fingerprint was made.")],
      failures: [{ code: "bad_number", message: "400: the number isn't 12 to 19 digits.", fix: "Send the full card number." }],
      limits: ["Answers in milliseconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: ["The same card read from a photo carries the same fingerprint in the card read."],
    },
  },
  {
    id: "bin-lookup",
    name: "BIN lookup",
    group: "Credit Card",
    tier: "minor",
    method: "GET",
    path: "/v2/bin/{digits}",
    service: "card",
    body: "path",
    summary: "The network, type, issuer and country behind a card's first digits, with the country's flag and the issuer's bank record and logo.",
    params: [{ name: "digits", kind: "string", label: "BIN", required: true, default: "471376", note: "The first 6 to 8 digits of the card." }],
    example: binLookup,
    docs: {
      what: "Looks up the first 6 to 8 digits of a card in our BIN tables (and online when ours miss): network, type, level, funding, issuer, country with flag, currency, and the issuer's record in our bank directory with its logo.",
      steps: ["GET /v2/bin/ followed by the first 6 to 8 digits.", "Use `network`, `issuer`, `country` and `bank`."],
      returns: [
        { field: "network / type / level / funding", note: "What kind of card it is." },
        { field: "issuer", note: "The issuing bank's name." },
        { field: "country / country_name / flag / flag_url", note: "The issuing country, with its flag as emoji and as an image." },
        { field: "currency / currency_name", note: "The card's currency." },
        { field: "bank", note: "The issuer matched in our bank directory, with logo and BIC." },
        { field: "source", note: "Where the answer came from: local, online, or local+online." },
      ],
      statuses: [ok("The BIN was found."), { code: "404", label: "Not found", when: "The BIN isn't in the tables yet." }],
      failures: [
        { code: "bin_too_short", message: "400: fewer than 6 digits.", fix: "Send at least the first 6 digits." },
        { code: "bin_not_found", message: "404: the BIN isn't in the tables yet.", fix: "Check the digits; a new BIN can take time to appear." },
      ],
      limits: ["Answers in milliseconds.", "Nothing is stored."],
      envelope: ENVELOPE,
      notes: [],
    },
  },
];
