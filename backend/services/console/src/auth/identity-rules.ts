/**
 * What a sign-up's names must look like: a real first name (one name), a real last name, a real business name.
 * The sign-up page checks the same rules first (frontend/src/lib/identity-rules.ts); the console checks them again
 * here, so a request that skips the page is refused all the same. Each check returns the sentence to show under the
 * field, or null.
 */

/** Values people type to get past a form, never a real name. */
const PLACEHOLDERS = new Set([
  "test", "testing", "tester", "tests", "asdf", "asdfg", "qwerty", "qwert", "dummy", "demo", "sample", "example",
  "name", "names", "firstname", "first", "lastname", "last", "surname", "user", "username", "admin", "administrator",
  "null", "undefined", "none", "nil", "na", "n/a", "abc", "abcd", "abcdef", "xxx", "xxxx", "xyz", "foo", "bar",
  "foobar", "baz", "fake", "anonymous", "anon", "nobody", "someone", "somebody", "unknown", "noname", "lorem",
  "ipsum", "hello", "hi", "aaa", "zzz", "qwe", "asd", "zxc", "me", "myself", "person", "guest", "temp",
]);
const BUSINESS_PLACEHOLDERS = new Set([
  ...PLACEHOLDERS,
  "company", "business", "my company", "my business", "the company", "company name", "business name", "org",
  "organisation", "organization", "my org", "startup", "my startup", "test company", "test business", "lorem ipsum",
  "inc", "ltd", "llc", "corp",
]);
const KEYBOARD_RUNS = /asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm/i;
// one name: letters (any script), with an inner hyphen or apostrophe ("Mary-Jane", "O'Neil")
const ONE_NAME = /^\p{L}+(?:['’-]\p{L}+)*$/u;
const LATIN = /^[A-Za-z'’-]+$/;

function nameProblem(value: string, label: string): string | null {
  const lower = value.toLowerCase();
  if (value.length < 2) return `Enter your ${label} (at least 2 letters).`;
  if (value.length > 30) return `That ${label} is too long.`;
  if (value.includes("@") || /\d/.test(value)) return `Enter your ${label}, not an email or a number.`;
  if (!ONE_NAME.test(value)) return `Use letters only for your ${label}.`;
  if (PLACEHOLDERS.has(lower)) return `Enter your real ${label}.`;
  if (/(\p{L})\1\1/u.test(lower) || KEYBOARD_RUNS.test(lower)) return `Enter your real ${label}.`;
  if (LATIN.test(value) && value.length > 3 && !/[aeiouy]/i.test(value)) return `Enter your real ${label}.`;
  return null;
}

/** First name: exactly one real name. */
export function firstNameProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Enter your first name.";
  if (/\s/.test(v)) return "Enter one first name only (your last name has its own field).";
  return nameProblem(v, "first name");
}

/** Last name: one to three real names ("Smith", "van Berg", "Nakamura-Lee"). */
export function lastNameProblem(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return "Enter your last name.";
  const parts = v.split(" ");
  if (parts.length > 3) return "That last name is too long.";
  for (const p of parts) {
    // short particles inside a surname ("van", "de", "da", "al") are real
    if (parts.length > 1 && /^\p{L}{1,3}$/u.test(p) && p !== parts[parts.length - 1]) continue;
    const problem = nameProblem(p, "last name");
    if (problem) return problem;
  }
  return null;
}

/** Business name: a real organisation's name, not an email, a link or a placeholder. */
export function businessProblem(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  const lower = v.toLowerCase();
  if (!v) return "Enter your business name.";
  if (v.length < 2) return "Enter your business name (at least 2 characters).";
  if (v.length > 80) return "That business name is too long.";
  if (v.includes("@") || /:\/\/|^www\./i.test(v)) return "Enter your business name, not an email or a web address.";
  if (!/^[\p{L}\p{N} &.,'’()\/+-]+$/u.test(v)) return "Use letters, numbers and simple punctuation only.";
  if ((v.match(/\p{L}/gu) ?? []).length < 2) return "A business name needs at least 2 letters.";
  if (BUSINESS_PLACEHOLDERS.has(lower)) return "Enter your real business name.";
  if (/(.)\1\1\1/u.test(lower) || KEYBOARD_RUNS.test(lower.replace(/\s/g, ""))) return "Enter your real business name.";
  return null;
}

/** Work email: a real mailbox format. */
export function emailProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Enter your work email.";
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return "Enter a valid email address.";
  const [local, domain] = v.toLowerCase().split("@");
  if (!local || !domain || domain.startsWith(".") || domain.includes("..") || local.startsWith(".") || local.endsWith("."))
    return "Enter a valid email address.";
  return null;
}
