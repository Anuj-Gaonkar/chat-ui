import type { NextConfig } from "next";

// Backend base URL used only for the server-side rewrite target below. Keep this in sync
// with NEXT_PUBLIC_API_BASE_URL in .env.local, which the client uses to build the
// same-origin `/api/...` request paths that this rewrite proxies through to the backend.
// Proxying avoids needing CORS configuration on the Spring Boot service.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8082";

const nextConfig: NextConfig = {
  // Allows accessing the dev server (and its HMR websocket) from other devices
  // on the LAN, e.g. testing from a phone/Mac pointed at this machine's Wi-Fi IP.
  // "*.trycloudflare.com" covers Cloudflare quick tunnels, whose hostname changes per run.
  allowedDevOrigins: ["10.115.92.130", "*.trycloudflare.com"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
