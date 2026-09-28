"use client";

import { useMemo, useState } from "react";
import { useProductStore } from "@/lib/store";
import { classNames, compararTexto, formatCurrency } from "@/lib/utils";

function chipClass(ativo: boolean): string {
  return classNames(
    "flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all",
    ativo ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
  );
}

export default function CardapioRapidoPage() {
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [apenasEsgotados, setApenasEsgotados] = useState(false);

  const nomeCategoria = (id: string) => categories.find((c) => c.id === id)?.name || "Geral";

  const elegiveis = useMemo(
    () => products.filter((p) => p.cardapioRapido === true && p.controlarEstoque === true),
    [products]
  );

  const categorias = useMemo(() => {
    const usadas = new Set(elegiveis.map((p) => p.category_id));
    return categories.filter((c) => usadas.has(c.id)).sort((a, b) => compararTexto(a.name, b.name));
  }, [elegiveis, categories]);

  const esgotadosTotal = elegiveis.filter((p) => !p.is_available).length;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...elegiveis]
      .sort((a, b) => {
        if (a.price !== b.price) return b.price - a.price;
        return compararTexto(a.name, b.name);
      })
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q)) return false;
        if (categoria !== "todas" && p.category_id !== categoria) return false;
        if (apenasEsgotados && p.is_available) return false;
        return true;
      });
  }, [elegiveis, busca, categoria, apenasEsgotados]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Cardápio Rápido</h1>
          <p className="mt-1 text-xs text-neutral-400 sm:text-sm">Acompanhe o estoque dos itens do Cardápio Rápido.</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-300">
          {filtrados.length} itens
        </span>
      </div>

      {elegiveis.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-sm font-semibold text-white">
            Nenhum produto cadastrado no Cardápio Rápido com controle de estoque ativo.
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Marque itens como Cardápio Rápido com controle de estoque na página Cardápio.
          </p>
        </div>
      ) : (
        <>
          <div className="sticky top-14 z-10 -mx-1 space-y-2 bg-neutral-950 px-1 py-2 md:top-0">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto pelo nome..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-white outline-none focus:border-wine-500"
            />

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategoria("todas")} className={chipClass(categoria === "todas")}>
                Todas ({elegiveis.length})
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c.id)}
                  className={chipClass(categoria === c.id)}
                >
                  {c.name} ({elegiveis.filter((p) => p.category_id === c.id).length})
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setApenasEsgotados(!apenasEsgotados)}
              className={classNames(
                "flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all",
                apenasEsgotados ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
              )}
            >
              Apenas Esgotados ({esgotadosTotal})
            </button>
          </div>

          {filtrados.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
              <p className="text-sm font-semibold text-white">Nenhum produto encontrado.</p>
              <p className="mt-1 text-xs text-neutral-400">Ajuste a busca ou os filtros acima.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtrados.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xl">🍰</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="truncate text-xs text-neutral-400">{nomeCategoria(p.category_id)}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-400">
                      {formatCurrency(p.price)}
                      {p.isCustomWeight ? "/kg" : ""}
                    </p>
                  </div>
                  <div
                    className={classNames(
                      "flex flex-shrink-0 flex-col items-center justify-center rounded-lg px-3 py-2",
                      (p.estoque ?? 0) > 0
                        ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40"
                        : "bg-red-500/15 text-red-400 ring-1 ring-red-500/40"
                    )}
                  >
                    <span className="text-[10px] font-semibold opacity-80">Estoque</span>
                    <span className="text-base font-bold leading-tight">{p.estoque ?? 0} un</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
