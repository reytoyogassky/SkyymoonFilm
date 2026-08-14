import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SKYMOON | Film & Serial Pilihan",
  description: "Ribuan film dan serial pilihan dengan subtitle bahasa Indonesia.",
  icons: {
    icon: "/assets/sky-mark.png",
    apple: "/assets/sky-mark.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${sora.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#080405] text-white">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}