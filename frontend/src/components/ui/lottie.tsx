"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

import { cn } from "@/lib/utils";

/**
 * Lightweight Lottie player for the locally-hosted animations in
 * `public/animation_files`. Pass the file stem, e.g. name="lottie_1" loads
 * `/animation_files/lottie_1.json`.
 *
 * Fast by design:
 *  - lottie-web is dynamically imported (client-only, code-split).
 *  - the JSON is fetched lazily — only when the element nears the viewport
 *    (rootMargin 200px), so a page with a dozen animations doesn't pull megs
 *    up front.
 *  - it plays only while on screen and pauses when scrolled away.
 *  - `prefers-reduced-motion` holds the first frame instead of animating.
 *  - a missing file (e.g. lottie_7 not uploaded yet) degrades to a quiet
 *    placeholder instead of throwing.
 */
export function Lottie({
  name,
  className,
  loop = true,
  ariaLabel,
}: {
  name: string;
  className?: string;
  loop?: boolean;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let anim: AnimationItem | null = null;
    let cancelled = false;
    let loaded = false;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const load = async () => {
      loaded = true;
      const lottie = (await import("lottie-web")).default;
      if (cancelled || !hostRef.current) return;
      anim = lottie.loadAnimation({
        container: hostRef.current,
        renderer: "svg",
        loop,
        autoplay: false,
        // ?v bumps when the animation JSONs are re-exported/recolored, so
        // browsers fetch the latest instead of a cached copy.
        path: `/animation_files/${name}.json?v=2`,
        rendererSettings: { progressiveLoad: true },
      });
      anim.addEventListener("DOMLoaded", () => {
        if (cancelled) return;
        setStatus("ready");
        if (reduce) anim?.goToAndStop(0, true);
        else anim?.play();
      });
      anim.addEventListener("data_failed", () => {
        if (!cancelled) setStatus("error");
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!loaded) void load();
            else if (!reduce) anim?.play();
          } else if (loaded && !reduce) {
            anim?.pause();
          }
        }
      },
      { rootMargin: "200px", threshold: 0.01 },
    );
    io.observe(host);

    return () => {
      cancelled = true;
      io.disconnect();
      anim?.destroy();
    };
  }, [name, loop]);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {/* Force lottie-web's injected <svg> to fit the box: it otherwise sizes
          to the container width and overflows on tall animations. */}
      <div
        ref={hostRef}
        className="h-full w-full [&>svg]:!h-full [&>svg]:!w-full"
      />
      {status === "error" && (
        // Quiet placeholder for an animation that isn't uploaded yet (lottie_7).
        <div className="absolute inset-0 grid place-items-center rounded-[inherit]">
          <span className="size-12 animate-pulse rounded-full bg-pine/10" />
        </div>
      )}
    </div>
  );
}
