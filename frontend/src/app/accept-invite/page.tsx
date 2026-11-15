import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Join your team · VeriSec" };

/** A team invitation, opened from its email: choose a password and join. */
export default function AcceptInvitePage() {
  return (
    <AuthShell>
      <AcceptInviteForm />
    </AuthShell>
  );
}
