import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Standard Next server build (API routes, `next dev` / `next start`). No static export. */
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
