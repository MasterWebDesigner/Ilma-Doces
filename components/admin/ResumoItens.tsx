"use client";

import { useState } from "react";
import type { ResumoItemPedido } from "@/lib/combo";

interface ResumoItensProps {
  itens: ResumoItemPedido[];
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
      {visiveis.map((item, idx) => (
        <span key={idx} className={`block ${classeItem}`}>
          <span className="block truncate">{item.texto}</span>
          {item.detalhes?.map((detalhe, di) => (
            <span key={di} className="block truncate pl-2 text-[11px] leading-4 opacity-75">
              {detalhe}
            </span>
          ))}
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
