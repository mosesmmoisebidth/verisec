import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { signIn } from "@/config/auth";

export const metadata = { title: "Sign in · VeriSec" };

/**
 * Sign in — wired to the console auth API. The interactive form is a client
 * island (`LoginForm`); the shell + heading stay server-rendered. A successful
 * password lands on the dashboard, or on the MFA challenge when the account has
 * a second factor enrolled.
 */
export default function LoginPage() {
  return (
    <AuthShell>
      <AuthHeading title={signIn.title} subtitle={signIn.subtitle} />
      <LoginForm />
    </AuthShell>
  );
}
