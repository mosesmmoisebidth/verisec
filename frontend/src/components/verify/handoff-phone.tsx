"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { DocumentFaceStepClient } from "@/components/verify/document-face-step";
import { FaceLivenessStepClient } from "@/components/verify/face-liveness-step";
import { PhoneShell } from "@/components/verify/phone-shell";
import { watchCameras } from "@/lib/verify/camera-watch";
import { finishHandoff, openHandoff, type HandoffStep } from "@/lib/verify/handoff";
import { recordDevice } from "@/lib/verify/record";
import type { ScreenContext } from "@/lib/verify/types";

type Opened = { kind: "opening" } | { kind: "stopped"; reason: string } | { kind: "ready"; step: HandoffStep; payload: unknown };

/** The phone page of a face step handed over by the computer (see lib/verify/handoff.ts). */
export function HandoffPhoneClient({ liveness, match }: { liveness: ScreenContext; match: ScreenContext }) {
  const [s, setS] = useState<Opened>({ kind: "opening" });

  useEffect(() => {
    let live = true;
    void openHandoff().then((r) => {
      if (!live) return;
      if (!r.ok) {
        setS({ kind: "stopped", reason: r.reason });
        return;
      }
      // this phone is one more device of the verification: its own device check, and the camera it uses
      watchCameras();
      void recordDevice("open");
      setS({ kind: "ready", step: r.step, payload: r.payload });
    });
    return () => {
      live = false;
    };
  }, []);

  if (s.kind === "ready" && s.step === "liveness") return <FaceLivenessStepClient ctx={liveness} phone={{ onPassed: finishHandoff }} />;
  const portrait = s.kind === "ready" ? (s.payload as { portrait?: unknown } | null)?.portrait : undefined;
  if (s.kind === "ready" && typeof portrait === "string") return <DocumentFaceStepClient ctx={match} phone={{ portrait, onPassed: finishHandoff }} />;

  const reason =
    s.kind === "stopped"
      ? s.reason
      : s.kind === "ready"
        ? "This code is missing the document photo. Make a new code on your computer and scan it again."
        : null;
  return (
    <PhoneShell ctx={liveness}>
      {reason ? (
        <p className="m-0 flex items-center gap-2 rounded-well bg-caution-tint/60 px-4 py-3.5 text-read font-medium text-caution">
          <ShieldAlert aria-hidden className="size-5 shrink-0" strokeWidth={1.9} /> {reason}
        </p>
      ) : (
        <p className="m-0 flex items-center gap-2 text-body text-quiet">
          <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.8} /> Opening the face check.
        </p>
      )}
    </PhoneShell>
  );
}
