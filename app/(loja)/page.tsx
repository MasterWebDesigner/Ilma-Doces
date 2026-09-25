"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useStoreConfig } from "@/lib/storeConfig";
import { useCartStore, useProductStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { getCategoryEmoji } from "@/lib/mockData";
import HistoryCarousel from "@/components/HistoryCarousel";
import StoreFooter from "@/components/StoreFooter";
import type { Product } from "@/types/database";

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function Home() {
  const config = useStoreConfig();
  const whatsappPhone = `55${config.storePhone.replace(/\D/g, "")}`;
  const displayPhone = formatPhoneDisplay(config.storePhone);
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const addItem = useCartStore((s) => s.addItem);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const destaques = useMemo(() => {
    const ordered = [...products].sort((a, b) => {
      const rapido = Number(!!b.cardapioRapido) - Number(!!a.cardapioRapido);
      if (rapido !== 0) return rapido;
      const imgA = a.image_url ? 1 : 0;
      const imgB = b.image_url ? 1 : 0;
      if (imgA !== imgB) return imgB - imgA;
      return a.display_order - b.display_order;
    });
    return ordered.filter((p) => p.is_available !== false).slice(0, 10);
  }, [products]);

  const slidesPerView = 3;
  const maxSlide = Math.max(0, destaques.length - slidesPerView);

  const scrollCarousel = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-slide]");
    const step = card ? card.offsetWidth + 24 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
    setSlideIndex((i) => Math.min(maxSlide, Math.max(0, i + dir)));
  }, [maxSlide]);

  function onScrollCarousel() {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-slide]");
    if (!card) return;
    const step = card.offsetWidth + 24;
    setSlideIndex(Math.min(maxSlide, Math.max(0, Math.round(el.scrollLeft / step))));
  }

  function handleAdd(product: Product) {
    if (product.isCustomWeight) {
      window.location.href = "/cardapio";
      return;
    }
    addItem(product);
  }

  const whatsappOrderText = encodeURIComponent("Ola! Gostaria de fazer um pedido!");
  const instagramPosts = (config.instagramPosts || []).filter((p) => p.active).slice(0, 8);

  return (
    <main className="bg-[#FDFBF7] dark:bg-neutral-950">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#8B1D22] to-[#5C1216] pt-28 pb-20 text-white">
        <div className="absolute inset-0 opacity-[0.08]">
          <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white" />
          <div className="absolute -left-10 bottom-0 h-72 w-72 rounded-full bg-white" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 text-center lg:px-8">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-creme-200">
            Confeitaria Artesanal
          </p>
          <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            Doces que encantam<br />o paladar e o coração
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-stone-200">
            Bolos, sobremesas e gelinhos gourmet feitos com amor e ingredientes selecionados.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/cardapio"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#8B1D22] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-stone-100 hover:shadow-xl"
            >
              Ver Cardápio
            </Link>
            <a
              href={`https://wa.me/${whatsappPhone}?text=${whatsappOrderText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-all duration-300 hover:border-[#25D366] hover:bg-[#25D366] hover:text-white hover:shadow-lg hover:shadow-[#25D366]/20 focus-visible:border-[#25D366] focus-visible:bg-[#25D366] focus-visible:text-white focus-visible:outline-none focus-visible:shadow-lg focus-visible:shadow-[#25D366]/20 active:border-[#1EBE5D] active:bg-[#1EBE5D]"
            >
              Fazer Pedido no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* SOBRE */}
      <section id="sobre" className="bg-white py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="rounded-2xl bg-[#FDFBF7] p-8 dark:bg-neutral-900 sm:p-12">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#8B1D22] dark:text-red-400">
                  Nossa História
                </p>
                <h2 className="text-3xl font-bold text-[#8B1D22] dark:text-white sm:text-4xl">
                  A Paixão pela Confeitaria
                </h2>
                <p className="mt-6 leading-relaxed text-stone-700 dark:text-neutral-300">
                  Há mais de uma década, a Ilma transforma ingredientes nobres e selecionados em
                  experiências inesquecíveis. Cada receita reflete a dedicação de quem entende que a
                  confeitaria artesanal vai muito além do sabor: é a união perfeita entre carinho,
                  tradição e excelência.
                </p>
                <p className="mt-4 leading-relaxed text-stone-700 dark:text-neutral-300">
                  Nosso compromisso está na escolha minuciosa de cada item do preparo — de chocolates
                  nobres a frutas sempre frescas e leite condensado artesanal. Em cada detalhe,
                  entregamos o padrão de qualidade e o afeto que a sua família merece.
                </p>
                <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
                  Afinal, quem é a Ilma?
                </p>
                <p className="mt-1 leading-relaxed text-stone-700 dark:text-neutral-300">
                  É aquela que transforma clientes em amigos.
                </p>
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex min-w-0 flex-1 flex-col justify-start rounded-xl border border-[#8B1D22]/15 bg-white p-4 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                    <p className="text-2xl font-bold text-[#8B1D22] dark:text-red-400 sm:text-3xl lg:text-2xl">
                      10+
                    </p>
                    <p className="mt-1 break-words text-xs text-stone-500 dark:text-neutral-500">
                      Anos de tradição e experiência
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-start rounded-xl border border-[#8B1D22]/15 bg-white p-4 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                    <p className="text-2xl font-bold text-[#8B1D22] dark:text-red-400 sm:text-3xl lg:text-2xl">
                      100%
                    </p>
                    <p className="mt-1 break-words text-xs text-stone-500 dark:text-neutral-500">
                      Satisfação dos nossos clientes
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-start rounded-xl border border-[#8B1D22]/15 bg-white p-4 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                    <p className="text-2xl font-bold text-[#8B1D22] dark:text-red-400 sm:text-3xl lg:text-2xl">
                      Artesanal
                    </p>
                    <p className="mt-1 break-words text-xs text-stone-500 dark:text-neutral-500">
                      Produção diária e sob encomenda
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <HistoryCarousel />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DESTAQUES / CARROSSEL */}
      <section id="destaques" className="bg-white py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#8B1D22] dark:text-red-400">
                Cardápio
              </p>
              <h2 className="text-3xl font-semibold text-[#8B1D22] dark:text-white sm:text-4xl">
                Nossas Especialidades
              </h2>
              <p className="mt-3 max-w-md text-sm text-stone-600 dark:text-neutral-400">
                Os queridinhos da Ilma feitos artesanalmente todos os dias.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Anterior"
                onClick={() => scrollCarousel(-1)}
                disabled={slideIndex <= 0}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#8B1D22]/35 text-[#8B1D22] transition-all hover:bg-[#8B1D22] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Próximo"
                onClick={() => scrollCarousel(1)}
                disabled={slideIndex >= maxSlide}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#8B1D22]/35 text-[#8B1D22] transition-all hover:bg-[#8B1D22] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {destaques.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-stone-200/80 bg-[#FDFBF7] p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-stone-500 dark:text-neutral-400">
                Em breve teremos destaques deliciosos no cardápio.
              </p>
              <Link
                href="/cardapio"
                className="mt-4 inline-flex rounded-full bg-[#8B1D22] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#721519]"
              >
                Ver cardápio completo
              </Link>
            </div>
          ) : (
            <>
              <div
                ref={scrollerRef}
                onScroll={onScrollCarousel}
                className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {destaques.map((product) => {
                  const catName = categoryById.get(product.category_id) || "Especialidade";
                  const isEsgotado = product.controlarEstoque && (product.estoque ?? 0) <= 0;
                  return (
                    <article
                      key={product.id}
                      data-slide
                      className="group w-[min(100%,300px)] shrink-0 snap-start overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-neutral-800">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${isEsgotado ? "opacity-40 grayscale" : ""}`}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-5xl">
                            {getCategoryEmoji(product.category_id, catName)}
                          </div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-[#8B1D22]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8B1D22] backdrop-blur-sm dark:bg-red-950/70 dark:text-red-300">
                          {catName}
                        </span>
                        {isEsgotado && (
                          <span className="absolute right-3 top-3 rounded bg-[#8B1D22] px-2 py-1 text-[10px] font-bold text-white">
                            Esgotado
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 p-5">
                        <h3 className="text-sm font-bold text-stone-900 dark:text-white">{product.name}</h3>
                        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-stone-500 dark:text-neutral-400">
                          {product.description || "Feito artesanalmente com ingredientes selecionados."}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-lg font-bold text-[#8B1D22] dark:text-red-400">
                            {formatCurrency(product.price)}
                            {product.isCustomWeight && (
                              <span className="ml-1 text-xs font-semibold text-stone-500">/kg</span>
                            )}
                          </p>
                          <button
                            type="button"
                            disabled={isEsgotado}
                            onClick={() => handleAdd(product)}
                            className="rounded-full bg-[#8B1D22] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#721519] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-red-800 dark:hover:bg-red-900"
                          >
                            {isEsgotado ? "Esgotado" : product.isCustomWeight ? "Escolher" : "Adicionar"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {maxSlide > 0 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  {Array.from({ length: maxSlide + 1 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Ir para item ${i + 1}`}
                      onClick={() => {
                        const el = scrollerRef.current;
                        const card = el?.querySelector<HTMLElement>("[data-slide]");
                        if (!el || !card) return;
                        const step = card.offsetWidth + 24;
                        el.scrollTo({ left: i * step, behavior: "smooth" });
                        setSlideIndex(i);
                      }}
                      className={`h-2 rounded-full transition-all ${
                        slideIndex === i ? "w-6 bg-[#8B1D22] dark:bg-red-500" : "w-2 bg-stone-300 hover:bg-stone-400 dark:bg-neutral-700"
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="mt-8 text-center">
                <Link
                  href="/cardapio"
                  className="inline-flex rounded-full border border-[#8B1D22] px-6 py-2.5 text-sm font-semibold text-[#8B1D22] transition hover:bg-[#8B1D22] hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-800 dark:hover:text-white"
                >
                  Ver cardápio completo
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* INSTAGRAM */}
      <section id="instagram" className="bg-[#FDFBF7] py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 text-center lg:px-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#8B1D22] dark:text-red-400">
            {config.storeInstagram || "@ilmadoces"}
          </p>
          <h2 className="text-3xl font-semibold text-[#8B1D22] dark:text-white">
            Siga no Instagram
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-stone-600 dark:text-neutral-400">
            Confira nossos bastidores, novidades e os doces mais desejados da Ilma Doces.
          </p>

          <a
            href={`https://instagram.com/${config.storeInstagram?.replace("@", "") || "ilmadoces"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#8B1D22] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#721519] hover:shadow-xl dark:bg-red-800 dark:hover:bg-red-900"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
            </svg>
            {config.storeInstagram || "@ilmadoces"}
          </a>

          {instagramPosts.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-stone-200/80 bg-white p-10 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-stone-500 dark:text-neutral-400">
                Em breve, novos conteúdos no nosso Instagram.
              </p>
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {instagramPosts.map((post) => (
                <a
                  key={post.id}
                  href={post.url || `https://instagram.com/${config.storeInstagram?.replace("@", "") || "ilmadoces"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="relative aspect-square overflow-hidden bg-stone-100 dark:bg-neutral-800">
                    {post.imageUrl ? (
                      <img
                        src={post.imageUrl}
                        alt={post.title || "Post Ilma Doces"}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl text-[#8B1D22]/40">🍰</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#8B1D22]/80 via-[#8B1D22]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 translate-y-3 p-4 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      <span className="inline-flex rounded-full bg-[#8B1D22] px-4 py-2 text-xs font-semibold text-white shadow">
                        Ver no Instagram →
                      </span>
                    </div>
                  </div>
                  {post.title && (
                    <p className="truncate px-4 py-3 text-left text-xs font-semibold text-stone-800 dark:text-neutral-200">
                      {post.title}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ENDERECO */}
      <section id="endereco" className="bg-white py-20 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-4 flex justify-center lg:justify-start">
                <img
                  src="/logo/logo2.png"
                  alt="Ilma Doces Confeitaria Artesanal"
                  className="h-14 w-auto max-w-full object-contain"
                />
              </div>
              <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[#FDFBF7] shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="space-y-5 p-6 sm:p-8">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
                      Endereço
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-stone-700 dark:text-neutral-300">
                      Rua Guarani, 370 - Conceição - Diadema/SP
                    </p>
                  </div>
                  <div className="h-px bg-stone-200 dark:bg-neutral-800" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
                      Horário de Funcionamento
                    </p>
                    <p className="mt-1 text-sm text-stone-700 dark:text-neutral-300">
                      Terça a Sábado: {config.openingHour?.replace(":", "h")} às {config.closingHour?.replace(":", "h")}
                    </p>
                  </div>
                  <div className="h-px bg-stone-200 dark:bg-neutral-800" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
                      WhatsApp
                    </p>
                    <p className="mt-1 text-sm text-stone-700 dark:text-neutral-300">{displayPhone}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-stone-200/80 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:px-8">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Rua+Guarani+370+Conceicao+Diadema+SP"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-full bg-[#8B1D22] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#721519] dark:bg-red-800 dark:hover:bg-red-900"
                  >
                    Como Chegar
                  </a>
                  <a
                    href={`https://wa.me/${whatsappPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-full border border-[#8B1D22]/35 px-5 py-2.5 text-xs font-semibold text-[#8B1D22] transition hover:bg-[#8B1D22] hover:text-white dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-800"
                  >
                    Falar no WhatsApp
                  </a>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[#FDFBF7] shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <iframe
                title="Mapa Ilma Doces"
                src="https://maps.google.com/maps?q=Rua%20Guarani,%20370,%20Concei%C3%A7%C3%A3o,%20Diadema%20-%20SP&t=&z=16&ie=UTF8&iwloc=&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                className="min-h-[320px] w-full rounded-2xl lg:min-h-[420px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#8B1D22] text-xs text-white/70">
        <StoreFooter />
      </footer>
    </main>
  );
}
