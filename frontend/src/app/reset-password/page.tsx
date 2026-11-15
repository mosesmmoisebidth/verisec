import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { resetPassword } from "@/config/auth";

export const metadata = { title: "Reset password · VeriSec" };

/** Reset password (step 1 of 2) — request a code, wired to the auth API. */
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading title={resetPassword.title} subtitle={resetPassword.subtitle} />
      <ResetRequestForm />
    </AuthShell>
  );
}
