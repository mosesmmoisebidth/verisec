import { cn } from "@/lib/utils";

/**
 * VeriSec "VS" monogram. Inherits `currentColor` so it can render in
 * ink on light surfaces and lime/white on dark panels.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 546 553"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-10 w-auto", className)}
    >
      <path
        d="M314.589 542.322C274.668 561.604 228.032 554.489 197.136 523.409C187.002 513.151 180.133 500.953 172.832 488.416L119.235 396.345L79.1904 326.453L1.04265 188.885C-1.72964 183.988 1.35061 177.519 6.46395 177.519L72.3829 177.581C74.57 177.581 76.6029 178.844 77.8042 180.907L240.599 465.129C240.846 465.56 241.123 465.93 241.431 466.299C248.608 474.616 256.401 482.194 267.306 482.594C285.603 483.303 299.803 469.564 303.777 452.53C307.473 436.79 302.853 424.53 294.813 410.545L125.549 115.728C113.351 94.5351 112.088 67.644 121.853 45.8969C132.973 21.1619 158.17 0.646909 185.646 0.523696L299.618 0C302.421 0 304.917 2.03309 305.779 5.08261L321.581 60.6824C322.936 65.4261 319.825 70.3238 315.42 70.3238H193.594C191.53 70.3546 188.634 71.4327 187.587 72.4184C186.324 73.6505 185.677 78.7023 186.694 80.4888L365.845 391.293C395.694 443.074 368.802 516.016 314.527 542.352L314.589 542.322Z"
        fill="currentColor"
      />
      <path
        d="M390.487 372.714L371.266 339.138L426.28 243.371L456.56 190.02C461.457 180.101 469.774 176.99 480.155 177.052L545.181 177.452L407.275 418.118C402.808 401.022 398.711 386.421 390.456 372.714H390.487Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
  label = "VeriSec",
}: {
  className?: string;
  markClassName?: string;
  label?: string;
}) {
  return (
    // Size and colour sit on the OUTER span so a call site can override both
    // with one `className`. The marketing header wants 2.1rem/black; the
    // console rail wants `--text-wordmark`/pine. Keeping them inside the inner
    // span would make the console unable to reach them without a descendant
    // selector, and `cn()` now knows `wordmark` is a font size, so
    // `text-wordmark` correctly replaces `text-[2.1rem]` rather than colliding
    // with the colour.
    <span
      className={cn(
        "flex items-center gap-3 text-[2.1rem] leading-none font-bold tracking-tight text-black",
        className,
      )}
    >
      <LogoMark className={cn("h-10 text-ink", markClassName)} />
      <span>{label}</span>
    </span>
  );
}
