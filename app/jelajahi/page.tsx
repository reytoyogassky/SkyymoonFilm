import type { Metadata } from "next";
import { Suspense } from "react";
import JelajahiContent from "./content";
import PageLoader from "@/components/PageLoader";

export const metadata: Metadata = {
  title: "Jelajahi Film & Series",
  description:
    "Jelajahi ribuan film dan series terbaru dari Indonesia dan manca negara. Filter berdasarkan genre, negara, dan rating. Nonton gratis subtitle Indonesia.",
  keywords: ["jelajah film", "browse film", "cari film", "daftar film", "film terbaru"],
  openGraph: {
    title: "Jelajahi Film & Series - SKYYMOVIE",
    description: "Jelajahi ribuan film dan series terbaru dari Indonesia dan manca negara.",
    url: "https://skyymovie.up.railway.app/jelajahi",
  },
  alternates: {
    canonical: "https://skyymovie.up.railway.app/jelajahi",
  },
};

export default function JelajahiPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <JelajahiContent />
    </Suspense>
  );
}
