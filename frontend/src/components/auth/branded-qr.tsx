"use client";

import { useEffect, useRef } from "react";

/**
 * A scannable QR dressed as VeriSec.
 *
 * The DATA is exactly what's passed in — the real `otpauth://` URI — so any
 * authenticator app reads it and works. The LOOK is ours: pine rounded dots,
 * dot-style finder eyes, and the lime "V" badge in the centre. High error
 * correction keeps it scannable with the badge overlaid.
 *
 * `qr-code-styling` touches the DOM, so it's imported lazily on the client only.
 */

// The lime rounded-square badge with the pine VeriSec mark, as an inline SVG
// data URI (the mark is the LogoMark path, scaled + centred in a 100×100 tile).
const BADGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="26" fill="#bfeb58"/><g transform="translate(28.5,26.5) scale(0.0805)" fill="#0e3228"><path d="M314.589 542.322C274.668 561.604 228.032 554.489 197.136 523.409C187.002 513.151 180.133 500.953 172.832 488.416L119.235 396.345L79.1904 326.453L1.04265 188.885C-1.72964 183.988 1.35061 177.519 6.46395 177.519L72.3829 177.581C74.57 177.581 76.6029 178.844 77.8042 180.907L240.599 465.129C240.846 465.56 241.123 465.93 241.431 466.299C248.608 474.616 256.401 482.194 267.306 482.594C285.603 483.303 299.803 469.564 303.777 452.53C307.473 436.79 302.853 424.53 294.813 410.545L125.549 115.728C113.351 94.5351 112.088 67.644 121.853 45.8969C132.973 21.1619 158.17 0.646909 185.646 0.523696L299.618 0C302.421 0 304.917 2.03309 305.779 5.08261L321.581 60.6824C322.936 65.4261 319.825 70.3238 315.42 70.3238H193.594C191.53 70.3546 188.634 71.4327 187.587 72.4184C186.324 73.6505 185.677 78.7023 186.694 80.4888L365.845 391.293C395.694 443.074 368.802 516.016 314.527 542.352L314.589 542.322Z"/><path d="M390.487 372.714L371.266 339.138L426.28 243.371L456.56 190.02C461.457 180.101 469.774 176.99 480.155 177.052L545.181 177.452L407.275 418.118C402.808 401.022 398.711 386.421 390.456 372.714H390.487Z"/></g></svg>`,
)}`;

export function BrandedQR({
  data,
  size = 208,
  label = "Two-factor QR code",
  level = "H",
}: {
  data: string;
  size?: number;
  label?: string;
  /** Error correction. "Q" still covers the badge and makes a long link's code less dense. */
  level?: "Q" | "H";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void (async () => {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      if (cancelled || !ref.current) return;
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        type: "svg",
        data,
        margin: 8,
        qrOptions: { errorCorrectionLevel: level },
        dotsOptions: { type: "rounded", color: "#0e3228" },
        // Circular "donut" finder eyes — an outer ring + a solid centre dot —
        // exactly like the VeriSec QR in public/qr/qr-epassport.png.
        cornersSquareOptions: { type: "dot", color: "#0e3228" },
        cornersDotOptions: { type: "dot", color: "#0e3228" },
        backgroundOptions: { color: "#fbfcfa" },
        image: BADGE,
        imageOptions: { crossOrigin: "anonymous", margin: 3, imageSize: 0.28, hideBackgroundDots: true },
      });
      ref.current.innerHTML = "";
      qr.append(ref.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, size, level]);

  return <div ref={ref} className="grid place-items-center" aria-label={label} role="img" />;
}
