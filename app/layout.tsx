import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "HDFC Bank";
const DESCRIPTION = "Tap to chat with HDFC Bank about your account.";

// Open Graph image URLs must be absolute, and the public hostname here changes every time a
// tunnel (ngrok / cloudflared) restarts - so derive it from the incoming request's headers
// instead of hard-coding it.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: TITLE,
    description: DESCRIPTION,
    // Lets mobile browsers tint the address bar to match the WhatsApp-style header.
    other: { "theme-color": "#008069" },
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: TITLE },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
