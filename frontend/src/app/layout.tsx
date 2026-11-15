import type { Metadata } from "next";
import { Google_Sans_Flex } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/toast";
import { JsonLd } from "@/components/seo/json-ld";
import { ogImage, siteUrl } from "@/config/seo";
import { globalJsonLd, keywords } from "@/config/structured-data";

const description =
  "Turn a document photo, a selfie, and one API call into a trusted decision. VeriSec unifies KYC, NFC, face biometrics and AML into a single Trust Seal per applicant.";

const googleSansFlex = Google_Sans_Flex({
  subsets: ["latin"],
  weight: "variable",
  // the grade axis (GRAD): sturdier strokes at the same widths (see body in globals.css)
  axes: ["GRAD"],
  display: "swap",
  variable: "--font-google-sans-flex",
  // Next has no built-in fallback metrics for this (new) font, so the
  // automatic adjustment is off. Instead we ship a hand-tuned
  // "Google Sans Flex Fallback" face in globals.css, measured in-browser,
  // which keeps the swap from shifting layout.
  adjustFontFallback: false,
  fallback: ["Google Sans Flex Fallback", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  // Required for canonical + OG URLs to resolve absolutely.
  metadataBase: new URL(siteUrl),
  // A bare string, not a `{ default, template }` pair. Every console and flow
  // page sets its own absolute title ("Team · VeriSec"); a template would
  // append the suite name again and make every tab read
  // "Team · VeriSec · VeriSec Labs".
  title: "VeriSec Labs: Verify Anyone, Anywhere in Seconds",
  description,
  applicationName: "VeriSec Labs",
  keywords,
  authors: [{ name: "VeriSec Labs", url: siteUrl }],
  creator: "VeriSec Labs",
  publisher: "VeriSec Labs",
  category: "technology",
  alternates: { canonical: "/" },
  // Index everything public, and let Google show full snippets and large images.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "VeriSec Labs",
    title: "VeriSec Labs: Verify Anyone, Anywhere in Seconds",
    description,
    url: "/",
    locale: "en_US",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "VeriSec Labs: Verify Anyone, Anywhere in Seconds",
    description,
    images: [ogImage.url],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Anchor links scroll smoothly; opt route transitions out of it.
      data-scroll-behavior="smooth"
      className={`${googleSansFlex.variable} h-full antialiased`}
    >
      <head>
        {/* Runtime backend locator. Sets window.__RECOG_CONFIG__ (apiBase,
            livenessBase) BEFORE the app bundle, so a static export can be
            repointed at a different backend by editing one file on the host
            with no rebuild. Deployment config, not UI, see public/config.js
            and next.config.ts. Nothing reads it yet; the API layer will. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/config.js" />
        {/* Organisation, website, product and service structured data (schema.org). */}
        <JsonLd data={globalJsonLd} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
