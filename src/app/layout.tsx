import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vaulted — Collect what you love",
    template: "%s | Vaulted",
  },
  description:
    "Shop, vault, and ship authenticated collectibles.",
  openGraph: {
    title: "Vaulted — Collect what you love",
    description:
      "Shop, vault, and ship authenticated collectibles.",
    siteName: "Vaulted",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vaulted — Collect what you love",
    description:
      "Shop, vault, and ship authenticated collectibles.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
