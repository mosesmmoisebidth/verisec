import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { verifyEmail } from "@/config/auth";

export const metadata = { title: "Verify your email · VeriSec" };

/** Verify email — reached after signup (Zitadel emailed a code). */
export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <AuthHeading title={verifyEmail.title} subtitle={verifyEmail.subtitle} />
      <VerifyEmailForm />
    </AuthShell>
  );
}
