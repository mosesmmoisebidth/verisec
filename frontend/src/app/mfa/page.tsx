import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { mfaChallenge } from "@/config/auth";

export const metadata = { title: "Two-step verification · VeriSec" };

/** MFA challenge — reached when login returns `mfa_required`. */
export default function MfaPage() {
  return (
    <AuthShell>
      <AuthHeading title={mfaChallenge.title} subtitle={mfaChallenge.subtitle} />
      <MfaChallengeForm />
    </AuthShell>
  );
}
