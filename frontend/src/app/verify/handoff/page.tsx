import { notFound } from "next/navigation";

import { HandoffPhoneClient } from "@/components/verify/handoff-phone";
import { getScreen } from "@/lib/verify";

export const metadata = { title: "Face check · VeriSec" };

/** The phone side of a face step handed over by the computer, whose browser has no usable camera. */
export default async function HandoffPage() {
  const [liveness, match] = await Promise.all([getScreen("selfie"), getScreen("document-face")]);
  if (!liveness || !match) notFound();
  return <HandoffPhoneClient liveness={liveness} match={match} />;
}
