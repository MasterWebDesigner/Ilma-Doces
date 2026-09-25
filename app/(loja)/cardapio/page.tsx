"use client";

import { useState } from "react";
import { getCategoryEmoji } from "@/lib/mockData";
import type { Product } from "@/types/database";
import { formatCurrency, formatItemQty, classNames } from "@/lib/utils";
import { useCartStore, useProductStore } from "@/lib/store";

export default function CardapioPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalWeight, setModalWeight] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const visibleCategories = categories.filter((cat) =>
    products.some((p) => p.category_id === cat.id)
  );

  function openProduct(product: Product) {
    setModalWeight(1);
    setSelectedProduct(product);
  }

  const allProducts = products.filter((p) => {
    const matchCat = activeCategory === "all" || p.category_id === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const galleryPhotos = products.filter((p) => p.image_url).slice(0, 8);

  return (
    <main className="bg-white pb-16 pt-20 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="border-b border-neutral-200 py-10 text-center dark:border-neutral-800">
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white">Cardapio</h1>
          <div className="mx-auto mt-3 h-0.5 w-16 bg-wine-600" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-5">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <button
              onClick={() => setActiveCategory("all")}
              className={classNames(
                "text-sm font-semibold uppercase tracking-wide transition-colors",
                activeCategory === "all"
                  ? "text-wine-600 underline underline-offset-4 dark:text-wine-400"
                  : "text-neutral-800 hover:text-wine-600 dark:text-neutral-300 dark:hover:text-wine-400"
              )}
            >
              Todos
            </button>
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={classNames(
                  "text-sm font-semibold uppercase tracking-wide transition-colors",
                  activeCategory === cat.id
                    ? "text-wine-600 underline underline-offset-4 dark:text-wine-400"
                    : "text-neutral-800 hover:text-wine-600 dark:text-neutral-300 dark:hover:text-wine-400"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Buscar doce..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-800 outline-none focus:border-wine-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
        </div>

        {allProducts.length === 0 ? (
          <div className="py-16 text-center text-neutral-400">
            <p>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {allProducts.map((product) => {
              const isEsgotado = product.controlarEstoque && (product.estoque ?? 0) <= 0;
              return (
                <div
                  key={product.id}
                  className="group overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-neutral-900 dark:shadow-none dark:ring-1 dark:ring-neutral-800"
                >
                  <button onClick={() => openProduct(product)} className="block w-full text-left">
                    <div className="relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${isEsgotado ? "opacity-40 grayscale" : ""}`}
                        />
                      ) : (
                        <div className={`flex h-full items-center justify-center text-6xl ${isEsgotado ? "opacity-40 grayscale" : ""}`}>
                          {getCategoryEmoji(product.category_id, categoryById.get(product.category_id))}
                        </div>
                      )}
                      {isEsgotado && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="rounded bg-red-600/90 px-3 py-1 text-xs font-bold text-white">Esgotado</span>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      {product.description && (
                        <div className="absolute bottom-full left-0 right-0 max-h-0 overflow-hidden bg-wine-700 px-4 pb-0 pt-0 text-xs leading-relaxed text-white/95 opacity-0 transition-all duration-300 group-hover:max-h-40 group-hover:pb-3 group-hover:pt-3 group-hover:opacity-100">
                          {product.description}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3 bg-wine-600 px-4 py-3">
                        <h3 className="text-sm font-bold leading-snug text-white">{product.name}</h3>
                        <div className="shrink-0 text-right text-sm font-bold text-white">
                          {formatCurrency(product.price)}
                          {product.isCustomWeight && (
                            <div className="text-xs font-semibold">KG</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div className="flex justify-end px-3 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEsgotado) return;
                        product.isCustomWeight ? openProduct(product) : addItem(product);
                      }}
                      disabled={isEsgotado}
                      className="rounded-full bg-wine-600 px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isEsgotado ? "Esgotado" : product.isCustomWeight ? "Escolher peso" : "Adicionar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {galleryPhotos.length > 0 && (
        <div className="mt-14 border-y border-neutral-100 bg-neutral-50 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4">
            {galleryPhotos.map((p) => (
              <button
                key={`g-${p.id}`}
                onClick={() => openProduct(p)}
                className="h-28 w-28 shrink-0 overflow-hidden sm:h-32 sm:w-32"
                title={p.name}
              >
                <img
                  src={p.image_url!}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedProduct(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800">
              {selectedProduct.image_url ? (
                <img
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  className={`h-full w-full object-cover ${selectedProduct.controlarEstoque && (selectedProduct.estoque ?? 0) <= 0 ? "opacity-40 grayscale" : ""}`}
                />
              ) : (
                <div className={`flex h-full items-center justify-center text-7xl ${selectedProduct.controlarEstoque && (selectedProduct.estoque ?? 0) <= 0 ? "opacity-40 grayscale" : ""}`}>
                  {getCategoryEmoji(selectedProduct.category_id, categoryById.get(selectedProduct.category_id))}
                </div>
              )}
              {selectedProduct.controlarEstoque && (selectedProduct.estoque ?? 0) <= 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded bg-red-600/90 px-4 py-1.5 text-sm font-bold text-white">Esgotado</span>
                </div>
              )}
              <button onClick={() => setSelectedProduct(null)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-neutral-700 hover:bg-white dark:bg-neutral-800 dark:text-neutral-200">X</button>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{selectedProduct.name}</h2>
                <div className="shrink-0 text-right">
                  <span className="text-xl font-bold text-wine-600 dark:text-wine-400">
                    {formatCurrency(selectedProduct.price)}
                  </span>
                  {selectedProduct.isCustomWeight && <span className="ml-1 text-sm font-semibold text-neutral-600 dark:text-neutral-400">/KG</span>}
                </div>
              </div>
              {selectedProduct.description && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{selectedProduct.description}</p>
              )}
              {selectedProduct.isCustomWeight && (
                <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">Escolha o Peso (kg)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max={selectedProduct.controlarEstoque ? selectedProduct.estoque : undefined}
                      value={modalWeight}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        let next = isNaN(v) ? 1 : Math.max(1, Math.round(v * 2) / 2);
                        if (selectedProduct.controlarEstoque) {
                          next = Math.min(next, Math.max(1, selectedProduct.estoque ?? 1));
                        }
                        setModalWeight(next);
                      }}
                      className="w-28 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-bold outline-none focus:border-wine-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                      autoFocus
                    />
                    <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">kg</span>
                    <span className="ml-auto text-lg font-bold text-wine-600 dark:text-wine-400">
                      {formatCurrency(selectedProduct.price * modalWeight)}
                    </span>
                  </div>
                  {selectedProduct.controlarEstoque && (selectedProduct.estoque ?? 0) > 0 && (
                    <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Disponível: {formatItemQty(selectedProduct.estoque ?? 0, true)}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-5">
                {selectedProduct.controlarEstoque && (selectedProduct.estoque ?? 0) <= 0 ? (
                  <span className="block rounded-lg bg-neutral-200 px-5 py-3 text-center text-sm font-semibold text-neutral-500 dark:bg-neutral-800">
                    Esgotado
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      addItem(selectedProduct, selectedProduct.isCustomWeight ? modalWeight : undefined);
                      setSelectedProduct(null);
                    }}
                    className="w-full rounded-lg bg-wine-600 px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                  >
                    {selectedProduct.isCustomWeight
                      ? `Adicionar ${modalWeight.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg — ${formatCurrency(selectedProduct.price * modalWeight)}`
                      : "Adicionar ao Carrinho"}
                  </button>
                )}
              </div>
              {selectedProduct.isCustomWeight && (
                <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2.5 text-[11px] leading-relaxed text-neutral-500 italic dark:bg-neutral-800 dark:text-neutral-400">
                  Por se tratar de um produto 100% artesanal, o peso final do bolo pode sofrer pequenas variações (para mais ou para menos). O valor final exato será confirmado na aprovação do pedido.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
