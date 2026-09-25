"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classNames } from "@/lib/utils";

const PHOTOS = [
  { src: "/imagens/BoloChocolate.webp", alt: "Bolo de chocolate artesanal" },
  { src: "/imagens/BoloChocolateCenoura.webp", alt: "Bolo de cenoura com cobertura" },
  { src: "/imagens/TortaDeFrango.webp", alt: "Torta de frango artesanal" },
  { src: "/imagens/Maionese.webp", alt: "Maionese artesanal" },
  { src: "/imagens/GeladinhoDeLeiteNinhoComDoceDeLeite1Jpg.webp", alt: "Gelinhos de leite ninho" },
];

export default function HistoryCarousel() {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % PHOTOS.length), []);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + PHOTOS.length) % PHOTOS.length),
    []
  );

  useEffect(() => {
    const id = setInterval(next, 3500);
    return () => clearInterval(id);
  }, [next]);

  function handleMouseEnter() {
    next();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    if (start === null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next();
      else prev();
    } else {
      next();
    }
    touchStartX.current = null;
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="group relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-[#8B1D22]/20 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
    >
      {PHOTOS.map((photo, i) => (
        <img
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          className={classNames(
            "absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-in-out",
            i === index ? "scale-100 opacity-100" : "scale-105 opacity-0"
          )}
        />
      ))}

      <button
        type="button"
        aria-label="Foto anterior"
        onClick={prev}
        className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 hover:bg-black/55 group-hover:opacity-100"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Próxima foto"
        onClick={next}
        className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 hover:bg-black/55 group-hover:opacity-100"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#8B1D22]/85 to-transparent p-5 pt-12 pb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-creme-200">
          Confeitaria Artesanal
        </p>
        <p className="mt-1 text-lg font-semibold text-white">
          Feito à mão, todos os dias
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5">
        {PHOTOS.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            aria-label={`Ir para a foto ${i + 1}`}
            onClick={() => setIndex(i)}
            className={classNames(
              "h-1.5 rounded-full transition-all duration-500 ease-in-out",
              i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
            )}
          />
        ))}
      </div>
    </div>
  );
}
