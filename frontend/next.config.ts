import type { NextConfig } from "next";

// Local dev: no NEXT_PUBLIC_API_URL set, so requests to "/api/*" are proxied
// to the FastAPI backend (BACKEND_URL, defaulting to localhost:8000) — no CORS needed.
// Production: set NEXT_PUBLIC_API_URL to the deployed API's origin (e.g.
// https://api.creditlens.srikarkodi.dev) and the frontend calls it directly;
// api.py's CORS allowlist must include the frontend's origin in that case.
const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
