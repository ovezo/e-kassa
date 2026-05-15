import type { NextConfig } from "next";

/** Standard Next server build (API routes, `next dev` / `next start`). No static export. */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
