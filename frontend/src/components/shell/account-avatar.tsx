"use client";

import { cn } from "@/lib/utils";

/**
 * The signed-in user's avatar: their profile picture when we have one (carried
 * in from Google on sign-in, or a platform upload later), else their initials
 * on the pine chip. The caller sizes and colours the chip via `className`; the
 * image fills it and is clipped to the chip's shape.
 */
/**
 * The classic "no photo" avatar — a filled person silhouette on a soft grey
 * ground. Used where a face-sized placeholder reads better than initials (the
 * Settings profile photo). Colour comes from `text-*`/`bg-*` on the caller.
 */
export function PersonPlaceholder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden className={className} preserveAspectRatio="xMidYMid slice">
      <circle cx="40" cy="31" r="15" fill="currentColor" />
      <path d="M9 80C11 60 24 49 40 49s29 11 31 31Z" fill="currentColor" />
    </svg>
  );
}

export function AccountAvatar({
  avatar,
  initials,
  className,
}: {
  avatar: string | null;
  initials: string;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("relative grid place-items-center overflow-hidden", className)}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a remote avatar
        // URL (Google / uploaded); next/image is unoptimized in the static
        // export anyway, so a plain img is the same bytes with less config.
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}
