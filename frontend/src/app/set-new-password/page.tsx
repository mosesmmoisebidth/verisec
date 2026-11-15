import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { SetNewPasswordForm } from "@/components/auth/set-new-password-form";
import { setPassword } from "@/config/auth";

export const metadata = { title: "Set a new password · VeriSec" };

/** Reset password (step 2 of 2) — enter the emailed code + a new password. */
export default function SetNewPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading title={setPassword.title} subtitle={setPassword.subtitle} />
      <SetNewPasswordForm />
    </AuthShell>
  );
}
