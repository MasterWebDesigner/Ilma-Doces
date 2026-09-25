"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";
import { useOrderStore } from "@/lib/store";
import NotificationToast from "@/components/NotificationToast";
import ThemeToggle from "@/components/ThemeToggle";

const nav = [
  { href: "/admin", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { href: "/admin/agendamentos", label: "Agendamentos", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/admin/produtos", label: "Cardápio", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { href: "/admin/estoque", label: "Estoque / Insumos", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { href: "/admin/precificacao", label: "Precificacao", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { href: "/admin/financeiro", label: "Financeiro", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/admin/vendas", label: "Vendas & Entradas", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/admin/clientes", label: "Clientes", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { href: "/admin/credores", label: "Credores / Fiados", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { href: "/admin/configuracoes", label: "Configuracoes", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function AdminSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const orders = useOrderStore((s) => s.orders);
  const pendingCount = orders.filter((o) => o.status === "pendente" || o.status === "em_producao").length;

  return (
    <div className="admin-shell flex min-h-screen bg-neutral-950 text-neutral-200 dark:bg-neutral-950 dark:text-neutral-200">
      <NotificationToast />
      <aside
        className={classNames(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-transparent bg-[#8B1D22] transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-950",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <div className="flex h-16 items-center border-b border-white/10 px-4 dark:border-zinc-800">
          <button
            onClick={() => setCollapsed(!collapsed)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                  <line x1="9" y1="6" x2="9" y2="6" />
                  <line x1="9" y1="18" x2="9" y2="18" />
                </>
              )}
            </svg>
          </button>
          {!collapsed && (
            <div className="ml-3 overflow-hidden">
              <img
                src="/logo/logo1.png"
                alt="Ilma Doces"
                className="h-10 w-auto object-contain"
              />
              <p className="text-[10px] text-white/70 whitespace-nowrap dark:text-zinc-400">Painel Administrativo</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => {
            const active = item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
            const isPedidos = item.href === "/admin/pedidos";
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={classNames(
                  "relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "px-3",
                  active
                    ? "bg-white text-[#8B1D22] shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-white/90 hover:bg-white/10 hover:text-white dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {!collapsed && (
                  <>
                    <span className="whitespace-nowrap flex-1">{item.label}</span>
                    {isPedidos && pendingCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-[#8B1D22] dark:bg-zinc-700 dark:text-white">
                        {pendingCount}
                      </span>
                    )}
                  </>
                )}
                {collapsed && isPedidos && pendingCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[8px] font-bold text-[#8B1D22] dark:bg-zinc-700 dark:text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 dark:border-zinc-800">
          {!collapsed && (
            <div className="mb-3 flex items-center gap-3 px-1">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white dark:bg-zinc-800">
                ID
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white whitespace-nowrap">Ilma Doces</p>
                <p className="text-[10px] text-white/65 whitespace-nowrap dark:text-zinc-400">ADMINISTRADOR</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 dark:bg-white/10 dark:hover:bg-white/20" />
            <Link
              href="/"
              title={collapsed ? "Voltar a Loja" : undefined}
              className={classNames(
                "flex items-center justify-center gap-2 rounded-lg border border-white/25 text-xs font-medium text-white/90 transition-colors hover:bg-white/15 hover:text-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white",
                collapsed ? "flex-1 px-2 py-2" : "flex-1 px-3 py-2"
              )}
            >
              {collapsed ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
              ) : (
                "Voltar a Loja"
              )}
            </Link>
          </div>
        </div>
      </aside>

      <main
        className={classNames(
          "flex-1 p-8 transition-all duration-300",
          collapsed ? "ml-[68px]" : "ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}
