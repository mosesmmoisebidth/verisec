import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // eslint-config-next enables only 6 of the 34 jsx-a11y rules, all as
  // warnings. Turn on the full recommended set as errors — accessibility
  // regressions shouldn't be mergeable on a public site.
  // (The plugin itself is already registered by eslint-config-next, so we
  // only re-declare the rules — redefining `plugins` would error.)
  // Rules that `recommended` intentionally disables — deprecated ones like
  // label-has-for — stay off; everything else is promoted to an error.
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules ?? {}).map(
        ([rule, setting]) => {
          const level = Array.isArray(setting) ? setting[0] : setting;
          const isOff = level === "off" || level === 0;
          return [rule, isOff ? setting : "error"];
        },
      ),
    ),
  },

  {
    // `jsx-a11y/label-has-associated-control` cannot see through a component
    // boundary. The builder's rows wrap a real <input type="checkbox"> inside
    // <Switch>, which is exactly what the rule wants — it just cannot tell.
    // Naming the wrapper is the rule's own supported answer; suppressing it
    // per call site would hide a genuinely unlabelled control the next time.
    files: ["src/**/*.tsx"],
    rules: {
      "jsx-a11y/label-has-associated-control": [
        "error",
        { controlComponents: ["Switch"], depth: 3 },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees live here. `claude/optimistic-agnesi-06ad6c` is checked out
    // at ddd7913 — the console as it stood BEFORE the 2026-08-21 purge — so
    // linting it reported 356 errors in 22k lines of deleted UI and buried any
    // real finding in the working tree. Lint the checkout you are in.
    ".claude/**",
  ]),
]);

export default eslintConfig;
