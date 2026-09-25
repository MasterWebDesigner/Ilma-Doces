"use client";

import Link from "next/link";
import { useStoreConfig } from "@/lib/storeConfig";

export default function StoreFooter() {
  const config = useStoreConfig();
  const storeName = config.storeName || "Ilma Doces";

  return (
    <div className="w-full border-t border-white/10 py-4">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-2 px-4 text-center text-xs text-white/60 md:gap-3">
        <span>© 2026 {storeName}. Todos os direitos reservados.</span>
        <span className="hidden text-white/30 sm:inline">|</span>

        <Link href="/politica-de-privacidade" className="underline transition-colors hover:text-white">
          Política de Privacidade
        </Link>
        <span className="text-white/30">|</span>
        <Link href="/termos-de-uso" className="underline transition-colors hover:text-white">
          Termos de Uso
        </Link>
        <span className="hidden text-white/30 sm:inline">|</span>

        <span>
          Desenvolvido por{" "}
          <a
            href="https://masterwd.com.br"
            target="_blank"
            rel="noopener nofollow"
            className="font-bold text-white/90 transition-colors hover:text-white"
          >
            Master Web Designer
          </a>
        </span>
      </div>
    </div>
  );
}
