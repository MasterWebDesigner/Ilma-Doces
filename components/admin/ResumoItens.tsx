"use client";

import { useState } from "react";

interface ResumoItensProps {
  itens: string[];
  limite?: number;
  className?: string;
  classeItem?: string;
}

export default function ResumoItens({ itens, limite = 3, className = "", classeItem = "" }: ResumoItensProps) {
  const [expandido, setExpandido] = useState(false);

  if (itens.length === 0) return null;

  const visiveis = expandido ? itens : itens.slice(0, limite);
  const restantes = itens.length - limite;

  return (
    <div className={className}>
      {visiveis.map((texto, idx) => (
        <span key={idx} className={`block truncate ${classeItem}`}>
          {texto}
        </span>
      ))}
      {restantes > 0 && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setExpandido((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setExpandido((v) => !v);
            }
          }}
          className="mt-0.5 inline-block cursor-pointer text-[11px] font-semibold text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {expandido ? "mostrar menos" : `+${restantes} ${restantes === 1 ? "item" : "itens"}`}
        </span>
      )}
    </div>
  );
}
