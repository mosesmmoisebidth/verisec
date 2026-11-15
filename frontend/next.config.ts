import type { NextConfig } from "next";

/**
 * VeriSec Labs marketing site.
 *
 * Built as a fully static export (`out/`) so it can be served from any
 * static host (Caddy, S3, FTP hosting). Auth pages talk to the FastAPI
 * backend from the client, so no Node server is required.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // `next dev` only: lets a phone open the local site through a Cloudflare quick tunnel (*.trycloudflare.com);
  // without it the dev server refuses its scripts to any origin but localhost. No effect on the static build.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
