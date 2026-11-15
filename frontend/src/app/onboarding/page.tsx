import { Wordmark } from "@/components/brand/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata = { title: "Set up your portal · VeriSec" };

/**
 * After sign-up: which portal brought the account here, a few questions for it, how it works and
 * how its data is handled. Every sign-in passes through here; an account that has answered is sent
 * straight on to its portal.
 */
export default function OnboardingPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-cream px-6 py-8 sm:px-10">
      {/* A plain <a> (hard navigation), like the auth pages: the static export has no RSC payload for Link to fetch. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" aria-label="VeriSec home" className="w-fit shrink-0">
        <Wordmark />
      </a>
      <main className="flex flex-1 items-start justify-center py-10 sm:items-center">
        <div className="w-full max-w-[760px]">
          <OnboardingFlow />
        </div>
      </main>
    </div>
  );
}
