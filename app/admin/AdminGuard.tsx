"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AdminSidebar from "./sidebar";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, carregando } = useAuth();
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (carregando) return;
    if (isLogin) {
      if (user) router.replace("/admin");
      return;
    }
    if (!user) router.replace("/admin/login");
  }, [carregando, isLogin, user, router]);

  if (isLogin) return <>{children}</>;
  if (carregando || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#8B1D22] border-t-transparent" />
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Validando sessão...
        </p>
      </div>
    );
  }

  return <AdminSidebar>{children}</AdminSidebar>;
}
