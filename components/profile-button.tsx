"use client";

import Link from "next/link";
import { userById } from "@/lib/mock-data";

export default function ProfileButton({ userId = "u1" }: { userId?: string }) {
  const user = userById(userId);
  return (
    <Link
      href="/settings"
      aria-label="Profile and settings"
      className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
      style={{ backgroundColor: user.avatarColor }}
    >
      {user.initials}
    </Link>
  );
}
