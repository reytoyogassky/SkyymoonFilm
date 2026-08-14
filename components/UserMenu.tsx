"use client";

import Link from "next/link";
import Image from "next/image";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/client-store";

export default function UserMenu() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="flex-none w-[38px] h-[38px] rounded-full bg-white/8 border border-white/10" />;
  }

  if (!user) {
    return (
      <Link
        href="/masuk"
        className="flex-none flex items-center gap-[8px] px-4 h-[38px] rounded-full text-[13px] font-bold text-white accent-gradient accent-shadow cursor-pointer transition-transform hover:scale-105"
      >
        <LogIn className="w-[15px] h-[15px]" />
        Masuk
      </Link>
    );
  }

  return (
    <Link
      href="/akun"
      className="flex-none w-[38px] h-[38px] rounded-full overflow-hidden cursor-pointer border border-white/20 transition-transform hover:scale-105"
      title={user.name}
    >
      <Image
        src={user.avatar}
        alt={user.name}
        width={38}
        height={38}
        unoptimized
        className="w-full h-full object-cover"
      />
    </Link>
  );
}