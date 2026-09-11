import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKYYMOVIE | Stream Your Favorites",
  description: "Thousands of movies and series with subtitles.",
  icons: {
    icon: "/assets/skyy-logo.png",
    apple: "/assets/skyy-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
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