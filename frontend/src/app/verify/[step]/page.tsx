import { COUNTRIES, DIAL_COUNTRIES } from "@/lib/countries";
import { AddressConfirmClient, AddressUploadClient } from "@/components/verify/address-steps";
import { CodeStepClient, EmailStepClient, PhoneStepClient, ScreeningStepClient } from "@/components/verify/contact-steps";
import { FindingsStepClient } from "@/components/verify/findings-step";
import { notFound } from "next/navigation";

import { DocumentCaptureClient } from "@/components/verify/document-capture";
import { DocumentFaceStepClient } from "@/components/verify/document-face-step";
import { DocumentTypeClient } from "@/components/verify/document-type";
import { FaceLivenessStepClient } from "@/components/verify/face-liveness-step";
import { FlowShell } from "@/components/verify/flow-shell";
import { FlowPanel } from "@/components/verify/panels";
import { ReviewStepClient } from "@/components/verify/review-step";
import { TermsStepClient } from "@/components/verify/terms-step";
import { getScreen, listScreenSlugs } from "@/lib/verify";

/**
 * Document Front + Back are one step run by a single client component that
 * handles both sides — Upload or Camera capture, with live lighting/sharpness
 * checks — and carries the images forward to the read on Confirm Details. Both
 * slugs render it, so a deep link or refresh still lands correctly.
 */
const DOC_CAPTURE = new Set(["document-front", "document-back"]);

/**
 * Every applicant screen, addressed by slug. Most render the server shell +
 * panel; a few are interactive and render a `"use client"` step component that
 * reuses the same shell (terms gating, document capture, confirm-details read).
 */
export async function generateStaticParams() {
  const slugs = await listScreenSlugs();
  return slugs.map((step) => ({ step }));
}

export async function generateMetadata({ params }: { params: Promise<{ step: string }> }) {
  const ctx = await getScreen((await params).step);
  return { title: ctx ? `${ctx.title} · VeriSec` : "Verification · VeriSec" };
}

export default async function VerifyStepPage({ params }: { params: Promise<{ step: string }> }) {
  const step = (await params).step;

  // Document capture pair — one client step for both sides.
  if (DOC_CAPTURE.has(step)) {
    const [front, back] = await Promise.all([getScreen("document-front"), getScreen("document-back")]);
    if (!front || !back) notFound();
    return <DocumentCaptureClient front={front} back={back} />;
  }

  const ctx = await getScreen(step);
  if (!ctx) notFound();

  // Terms — Continue gated on accepting every agreement.
  if (step === "terms") return <TermsStepClient ctx={ctx} />;

  // Choose document — persists the type (passport = one image, cards = two).
  if (step === "document-type") return <DocumentTypeClient ctx={ctx} />;

  // Confirm Details — reads front + back through Regula and shows all the data.
  if (step === "document-review") return <ReviewStepClient ctx={ctx} />;

  // Face Match — passive selfie matched 1:1 against the document portrait, still
  // in the Document stage, before the chip and the full liveness check.
  if (step === "document-face") return <DocumentFaceStepClient ctx={ctx} />;

  // Face Verification — mounts Regula's own <face-liveness> component (blink /
  // active), driven entirely by the engine.
  if (step === "selfie") return <FaceLivenessStepClient ctx={ctx} />;

  // Phone & Email Verification — each number / address is checked for
  // existence before a code is sent, then confirmed with the code, then the
  // applicant is screened (watchlists, connection, contact signals).
  if (step === "phone") return <PhoneStepClient ctx={ctx} countries={DIAL_COUNTRIES} />;
  if (step === "phone-code") return <CodeStepClient ctx={ctx} channel="phone" />;
  if (step === "email") return <EmailStepClient ctx={ctx} />;
  if (step === "email-code") return <CodeStepClient ctx={ctx} channel="email" />;
  if (step === "checking") return <ScreeningStepClient ctx={ctx} />;
  if (step === "findings") return <FindingsStepClient ctx={ctx} />;

  // Proof of Address — the document is read and checked against the ID and the typed
  // address, then the applicant confirms (and may correct) the address.
  if (step === "address-upload") return <AddressUploadClient ctx={ctx} />;
  if (step === "address-confirm") return <AddressConfirmClient ctx={ctx} countries={COUNTRIES} />;

  return (
    <FlowShell ctx={ctx}>
      <FlowPanel ctx={ctx} />
    </FlowShell>
  );
}
