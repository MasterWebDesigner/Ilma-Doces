"use client";

import Link from "next/link";
import { useCartStore } from "@/lib/store";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/", label: "HOME" },
  { href: "/#sobre", label: "SOBRE" },
  { href: "/cardapio", label: "CARDAPIO" },
  { href: "/#instagram", label: "INSTAGRAM" },
  { href: "/#endereco", label: "ENDERECO" },
];

export default function Header() {
  const { items, setOpen } = useCartStore();
  const cartCount = items.reduce((s, i) => s + (i.is_brinde ? 1 : i.quantity), 0);

  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-[#8B1D22]">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 lg:px-8">
        <Link href="/" className="flex items-center">
          <img
            src="/logo/logo1.png"
            alt="Ilma Doces Confeitaria Artesanal"
            className="h-14 w-auto object-contain"
          />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-xs font-semibold uppercase tracking-wide text-white transition-opacity hover:opacity-80"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-opacity hover:opacity-80" />
          <button
            onClick={() => setOpen(true)}
            className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-80"
          >
            Carrinho
            {cartCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
