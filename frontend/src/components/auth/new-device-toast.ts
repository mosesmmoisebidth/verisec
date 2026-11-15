import { flashToast } from "@/components/ui/toast";

/**
 * Queue the "new device signed in" heads-up. The auth flows hard-navigate on
 * success, so we use flashToast (survives the navigation) — it shows on the
 * next page (the dashboard). It's informational only: the sign-in already
 * succeeded and we've also emailed the account owner an alert.
 */
export function newDeviceToast(deviceName?: string): void {
  flashToast(
    "info",
    "New device signed in",
    deviceName
      ? `We noticed a sign-in from ${deviceName} and emailed you a heads-up.`
      : "We noticed a sign-in from a device we hadn't seen, and emailed you a heads-up.",
  );
}
