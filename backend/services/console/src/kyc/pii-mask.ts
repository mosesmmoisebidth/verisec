/**
 * A verification's detail as a role WITHOUT "reveal personal data" sees it (Developer): the full document number, the
 * date of birth, the machine-readable zone and the images are hidden; everything else (checks, scores, the decision,
 * the timeline) stays. Applied to the finished detail, so a field never slips through whichever part built it.
 */

// field labels come from whatever the engine read, so they are matched by the words that make a field identifying
const LABEL =
  /(document|passport|personal|national|id(entity)?|card|licen[cs]e|permit|social|tax|registration)\s*(no\.?|num(ber)?|#)|date\s*of\s*birth|birth\s*date|^dob$|machine.?readable|\bmrz\b|optional\s*data|check\s*digit|barcode/i;
// a whole group of the machine-readable zone: every value inside is hidden
const GROUP = /machine.?readable|\bmrz\b/i;
const KEY = /(document|doc|passport|personal|national|id)_?(no|num|number)$|^(dob|date_?of_?birth|birth_?date|mrz|mrz_?lines?)$/i;
const LABEL_KEYS = ['term', 'label', 'name', 'title', 'field', 'fieldName'];
const VALUE_KEYS = ['detail', 'value', 'text', 'display'];

const dots = (n: number) => '•'.repeat(Math.max(4, Math.min(n, 12)));

// only a number field keeps its tail: a date (even written out) never does
const NUMBER_FIELD = /(no\.?|num(ber)?|#)$|_?(no|num|number)$/i;
const DATE_FIELD = /birth|dob|date/i;

function hide(v: unknown, field = ''): unknown {
  if (typeof v === 'number') return dots(4);
  if (typeof v !== 'string' || !v) return v;
  // a document number keeps its last four characters, enough to tell two apart
  const clean = v.replace(/\s+/g, '');
  if (NUMBER_FIELD.test(field.trim()) && !DATE_FIELD.test(field) && /^[A-Z0-9]{5,}$/i.test(clean) && /\d/.test(clean))
    return `${dots(clean.length - 4)}${clean.slice(-4)}`;
  return dots(v.length);
}

const isMrzLine = (s: string) => /^[A-Z0-9<]{28,46}$/.test(s) && s.includes('<<');
const isFileLink = (s: string) => /\/api\/verifications\/[^/]+\/files\//.test(s);

function walk(v: unknown, all = false): unknown {
  if (typeof v === 'string') return isMrzLine(v) ? dots(v.length) : isFileLink(v) ? null : v;
  if (Array.isArray(v)) return v.map((x) => walk(x, all));
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  const label = LABEL_KEYS.map((k) => o[k]).find((x) => typeof x === 'string') as string | undefined;
  const inner = all || (typeof o.title === 'string' && GROUP.test(o.title));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) {
    const scalar = typeof x === 'string' || typeof x === 'number';
    if (typeof x === 'string' && isFileLink(x)) {
      // an image the role may not see: gone, and marked so the screen says why (not "not captured")
      out[k] = null;
      out.hidden = true;
    } else if (KEY.test(k) && scalar) out[k] = hide(x, k);
    else if (VALUE_KEYS.includes(k) && scalar && (all || (label !== undefined && LABEL.test(label)))) out[k] = hide(x, all ? '' : label);
    else out[k] = walk(x, inner);
  }
  return out;
}

export function maskDetail<T>(detail: T): T & { masked: true } {
  return { ...(walk(detail) as T), masked: true };
}
