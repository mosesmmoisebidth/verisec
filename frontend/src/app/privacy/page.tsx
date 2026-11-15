import type { Metadata } from "next";

import { privacyPolicy } from "@/config/legal";
import { SiteFooter } from "@/components/layout/site-footer";
import { LegalPage } from "@/components/sections/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How VeriSec Labs collects, uses, discloses, and protects personal information across our website, KYC Portal, APIs, and SDKs.",
  alternates: { canonical: "/privacy/" },
};

export default function PrivacyPage() {
  return (
    <>
      <LegalPage doc={privacyPolicy} />
      <SiteFooter />
    </>
  );
}
