import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

const SITE_URL = "https://skyymovie.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SKYYMOVIE - Nonton Film & Series Gratis Subtitle Indonesia",
    template: "%s | SKYYMOVIE",
  },
  description:
    "Nonton film dan series terbaru subtitle Indonesia secara gratis. Ribuan koleksi film action, drama, horror, komedi dari Indonesia dan manca negara. Streaming berkualitas tinggi.",
  keywords: [
    "nonton film",
    "nonton series",
    "streaming film gratis",
    "film subtitle indonesia",
    "nonton movie online",
    "film indonesia",
    "series terbaru",
    "download film",
    "nonton gratis",
    "streaming online",
    "film action",
    "drama korea",
    "anime subtitle indonesia",
  ],
  authors: [{ name: "SKYYMOVIE" }],
  creator: "SKYYMOVIE",
  publisher: "SKYYMOVIE",
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: "SKYYMOVIE",
    title: "SKYYMOVIE - Nonton Film & Series Gratis Subtitle Indonesia",
    description:
      "Nonton film dan series terbaru subtitle Indonesia secara gratis. Ribuan koleksi film berkualitas tinggi.",
    images: [
      {
        url: `${SITE_URL}/assets/skyy-logo.png`,
        width: 1200,
        height: 630,
        alt: "SKYYMOVIE",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SKYYMOVIE - Nonton Film & Series Gratis",
    description:
      "Nonton film dan series terbaru subtitle Indonesia secara gratis.",
    images: [`${SITE_URL}/assets/skyy-logo.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: "/assets/skyy-logo.png",
    apple: "/assets/skyy-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-[#0A0E27] text-[#FFFFFF]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
