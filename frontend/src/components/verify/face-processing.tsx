"use client";

import { Loader2 } from "lucide-react";

/**
 * Covers the camera frame while the face check is being decided (from the face component's PROCESSING_REQUEST until
 * its result). The component draws its own "Processing" screen inside the oversized, shifted camera window, which
 * leaves it low and cut off in the frame; this one fills the visible frame itself, so it is centred on every screen.
 */
export function FaceProcessingOverlay() {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <Loader2 aria-hidden className="size-10 animate-spin text-pine" strokeWidth={1.6} />
      <span className="text-body font-medium text-pine">Please wait, checking your face.</span>
      <span className="text-micro text-quiet">This takes a few seconds. Keep this page open.</span>
    </div>
  );
}
