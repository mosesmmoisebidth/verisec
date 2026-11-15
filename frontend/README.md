
# VeriSec console — `development`

The product app that lives behind login. **The UI was stripped on 2026-08-21** so it
could be rebuilt from the Figma files instead of layered on top of the old
implementation.

## What is here right now

```
src/app/layout.tsx    fonts + the runtime backend locator script
src/app/page.tsx       the ONLY route: /, renders nothing yet
src/app/globals.css    Tailwind import + a minimal reset, no tokens
src/lib/utils.ts       the shadcn `cn()` helper
public/config.js       runtime backend locator (deployment config)
public/.htaccess       cPanel rewrite rules for the static export

No store, no route table, no views, no components, no sample data.

## What was removed, and where to find it

Everything below is at commit **`d444944`** on `development`:

- the console shell and all 25 views (dashboard, verifications, workflows,
  verify pipeline, tools, billing, team, settings, …)
- the 21-screen applicant flow and its `.va` stylesheet block
- the auth screens (login, signup, verify-email, forgot/reset password)
- the client store (`src/app/_store.tsx`) and the URL⇄state route table
  (`src/lib/routes.ts`)
- the API client (`src/lib/api.ts`), domain types, i18n tables and every
  sample-data module
- the QR encoder (`src/lib/qr.ts`) — dependency-free, byte mode, level M,
  versions 1-10, if it is ever wanted again
- `public/samples/**` and `public/assets/**` demo imagery

An in-flight dashboard rewrite that computed metrics from real run history is on
branch `wip/dashboard-analytics-2026-08-21` (`f776d0a`), not on `development`.

The VeriSec brand palette is **not** in this repo any more. It lives in
`verisec-web/src/app/globals.css`, and the console's old token block is in this
file's history at `d444944`.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:3200 via the repo's launch config

`next.config.ts` has three build modes — the default dev/`next start` server with
a `/api` proxy to `BACKEND_URL`, `NEXT_BUILD_TARGET=standalone`, and
`NEXT_EXPORT=1` for the static export. None of that was touched by the purge.

## Branches

| Branch | What lives here |
|---|---|
| `main` | the prelaunch waitlist site (static HTML) |
| `development` | this app |

Do not merge one into the other — they are unrelated apps sharing a repo.

# VeriSec Labs Marketing Site

Public site for VeriSec Labs, built from the "VeriSec Labs" Figma file.
Eight pages: home, solutions, solutions/kyc, developers, pricing, contact,
login and signup.

## Branches in this repo

| Branch | Contains |
| ------------- | --------------------------------------------------------- |
| `main` | **this** the public marketing site (Next.js, exported) |
| `development` | the VeriVision product app (dashboard/console) |

The two branches hold different applications, so don't merge one into the
other work on whichever branch matches what you're changing.

## Getting started

nvm use # Node 22 (see .nvmrc)
pnpm dev # http://localhost:3100

## Stack

- **Next.js 16** (App Router, Turbopack) with **static export** `next build`
  emits a plain `out/` folder deployable to any static host (Caddy, S3, FTP).
- **React 19**, **TypeScript** (strict + `noUncheckedIndexedAccess`)
- **Tailwind CSS v4** design tokens live in `src/app/globals.css` under
  `@theme` (no `tailwind.config`)
- **shadcn/ui** (Base UI primitives) for form/accordion a11y
- **motion** available for animation (marquee is pure CSS)
- **Google Sans Flex** via `next/font/google` self-hosted at build time,
  no runtime Google request

## Commands

pnpm dev # dev server
pnpm build # static export -> out/
pnpm lint # eslint
pnpm typecheck # tsc --noEmit
pnpm format # prettier --write

## Structure

src/
  app/ # routes only thin pages that compose sections
    page.tsx # home
    pricing/ # pricing
    solutions/ # product index
    solutions/kyc/ # KYC detail page
    developers/ # developer docs hub
    contact/ # contact + demo booking
    login/ signup/ # auth pages (client forms -> FastAPI)
  components/
    brand/ # logo mark/wordmark, third-party glyphs
    layout/ # header (pill nav), footer, container/panel, headings
    sections/ # page sections (hero shell, pricing, faq, …)
    auth/ # auth shell, fields, forms
    dev/ # code blocks with copy + language tabs
    motion/ # Reveal (scroll/mount animation)
    ui/ # shadcn primitives, PillButton, form fields
  config/ # ALL site copy one file per page
  lib/ # utils (cn), api.ts (FastAPI client)
public/
  brand/logo.svg # VS monogram
  images/ # auth texture

**Editing copy never touches components** change `src/config/*.ts`
(`site`, `home`, `pricing`, `auth`, `solutions`, `developers`, `contact`).

## Motion

Heroes are full-bleed (`HeroShell` in `components/sections/hero.tsx`): the
panel spans the viewport, a faint grid and two slow-drifting lime blobs sit
behind the content, and the bottom melts into white. Content animates in
through `<Reveal>` `mode="mount"` for hero copy, scroll-triggered
elsewhere, with staggered `delay` across card grids. Every animation is
disabled under `prefers-reduced-motion`.

## Design tokens

| Token | Value | Use |
| --------- | --------- | --------------------------------- |
| `lime` | `#BFEB58` | primary actions, highlights |
| `pine` | `#0E3228` | headings, dark panels, dark pills |
| `surface` | `#F2F2F2` | light grey panels/cards |
| `cream` | `#F5F9EB` | auth page background |
| `ink` | `#231F20` | logo / near-black |
| `panel` | `#FBFBFB` | off-white cards |

Radii: inputs 16px (`rounded-2xl`), cards 14px (`rounded-card`),
pricing 20px, section panels 30px (`rounded-panel`), pills full.

## SEO

`src/config/seo.ts` is the single source for the site origin, sitemap routes
and the social-preview image.

- Set **`NEXT_PUBLIC_SITE_URL`** at build time to the production origin. It
  feeds `metadataBase`, every canonical URL, `sitemap.xml` and `robots.txt`.
  The default is `https://verisec.dev`, so confirm the real domain.
- `sitemap.ts` and `robots.ts` **must** keep
  `export const dynamic = "force-static"`. Without it `next build` fails
  under `output: 'export'`.
- The OG image is a committed `public/og.png` (1200x630). Static hosts serve
  that with a real `image/png` type. Next's `ImageResponse` route emits an
  extensionless file with no `Content-Type`, which breaks link previews.

## Deploying

Upload **all of `out/`**, not just `*.html` and `_next/`. The export includes
`__next*.txt` RSC payload files that drive client-side navigation, and
omitting them turns every in-app link into a full page reload. Use
`rsync -a --delete` or `lftp mirror --delete` rather than a hand-picked list.

Also confirm the host sends gzip/Brotli. The home and developers pages are
around 220 KB uncompressed versus roughly 30 KB on the wire.

## Backend

Auth forms post to the VeriSec FastAPI backend from the browser. Set
`NEXT_PUBLIC_API_BASE_URL` at build time; exact route paths are marked
`TODO(backend)` in `src/lib/api.ts` pending confirmation.
