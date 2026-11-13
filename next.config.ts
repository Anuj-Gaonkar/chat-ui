import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Backend base URL used only for the server-side rewrite target below. Keep this in sync
// with NEXT_PUBLIC_API_BASE_URL in .env.local, which the client uses to build the
// same-origin `/api/...` request paths that this rewrite proxies through to the backend.
// Proxying avoids needing CORS configuration on the Spring Boot service.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8082";

// If the key var holds a file path (e.g. /etc/certs/wa/public.pem), read the PEM and inline its contents instead.
const rawKey = process.env.NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY ?? "";
const isPath = /^([a-zA-Z]:[\\/]|\/)/.test(rawKey);
const ENCRYPTION_PUBLIC_KEY = isPath ? readFileSync(rawKey, "utf8") : rawKey;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY: ENCRYPTION_PUBLIC_KEY },
  // Allows accessing the dev server (and its HMR websocket) from other devices
  // on the LAN, e.g. testing from a phone/Mac pointed at this machine's Wi-Fi IP.
  // "*.trycloudflare.com" covers Cloudflare quick tunnels, whose hostname changes per run.
  // allowedDevOrigins: ["10.115.92.130", "*.trycloudflare.com"],
  // The CTA link carries the customer's phone number in its query string. Without this, the browser
  // would send that URL as the Referer to any third-party resource the page loads.
  basePath: "/dp/webchat",
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  // Only the endpoints this app calls are proxied, so there is deliberately no blanket `/api/:path*`
  // here: anything else the backend exposes under /api stays unreachable through the public site.
  async rewrites() {
    const proxied = [
      "/dp/waoutreach/api/conversations/:path*",
      "/dp/waoutreach/api/chat-session/:path*",
      "/dp/waoutreach/api/chat-session",
      "/dp/waoutreach/api/chat-events",
      "/dp/waoutreach/api/customers/:path*",
    ];
    return proxied.map((source) => ({
      source,
      destination: `${API_BASE_URL}${source}`,
      basePath: false
    }));
  },
};

export default nextConfig;
