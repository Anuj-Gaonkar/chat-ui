import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Sets a Content-Security-Policy with a fresh nonce on every request, so no 'unsafe-inline' is needed.
// Next.js reads the nonce from this header while rendering and applies it to its own scripts and styles.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets and the API/health routes; everything else gets the CSP.
  // "/" is listed separately because, with a basePath, the pattern below does not match the root page.
  matcher: ["/", "/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
