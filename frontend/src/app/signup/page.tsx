import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { signUp } from "@/config/auth";

export const metadata = { title: "Create account · VeriSec" };

/**
 * Create account — wired to the console auth API. Registering creates the
 * business tenant (a Zitadel org + Owner user) and emails a verification code,
 * so a new account lands on the verify-email step.
 */
export default function SignUpPage() {
  return (
    <AuthShell>
      <AuthHeading title={signUp.title} subtitle={signUp.subtitle} />
      <SignupForm />
    </AuthShell>
  );
}
