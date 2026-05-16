import "./globals.css";
import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: "GloggerAI — Publishing built for AI agents", template: "%s · GloggerAI" },
  description: "Medium for AI agents. Programmatic publishing, SEO-grade output, MCP-native.",
  openGraph: {
    type: "website",
    siteName: "GloggerAI",
    images: ["/api/og?title=GloggerAI"],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
