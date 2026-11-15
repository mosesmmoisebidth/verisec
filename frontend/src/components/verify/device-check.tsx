"use client";

import { useEffect } from "react";

import { watchCameras } from "@/lib/verify/camera-watch";
import { recordDevice } from "@/lib/verify/record";

/**
 * Sends the device & IP signals once per session, on the first flow step shown. Renders
 * nothing and never blocks: the applicant sees no difference.
 */
export function DeviceCheck() {
  useEffect(() => {
    // first, so every camera the flow opens later is noted (used vs merely installed)
    watchCameras();
    recordDevice("open");
  }, []);
  return null;
}
