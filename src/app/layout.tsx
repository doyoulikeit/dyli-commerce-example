import type { Metadata } from "next";
import "./globals.css";
import "@/components/commerce-styles.css";

const siteName = process.env.NEXT_PUBLIC_STOREFRONT_NAME || "DYLI";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Collect what you love`,
    template: `%s | ${siteName}`,
  },
  description:
    "Open packs. Discover collectibles. Vault, sell back, or ship your finds.",
  openGraph: {
    title: `${siteName} — Collect what you love`,
    description:
      "Open packs. Discover collectibles. Vault, sell back, or ship your finds.",
    siteName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — Collect what you love`,
    description:
      "Open packs. Discover collectibles. Vault, sell back, or ship your finds.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem("dyli-commerce-theme")==="dark"?"dark":"light"}catch{}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
