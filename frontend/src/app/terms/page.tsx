import type { Metadata } from "next";

import { termsOfService } from "@/config/legal";
import { SiteFooter } from "@/components/layout/site-footer";
import { LegalPage } from "@/components/sections/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing access to and use of the VeriSec Labs website, KYC Portal, APIs, SDKs, and related services.",
  alternates: { canonical: "/terms/" },
};

export default function TermsPage() {
  return (
    <>
      <LegalPage doc={termsOfService} />
      <SiteFooter />
    </>
  );
}
