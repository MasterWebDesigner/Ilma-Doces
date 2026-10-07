"use client";

import { useEffect, useRef, useState } from "react";
import { EXPENSE_STATUS_COLORS } from "@/lib/store";
import { classNames, formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types/database";

interface Props {
  brindes: Expense[];
  onClose: () => void;
  onSelect?: (desp: Expense) => void;
}

function dataBR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function BrindesDrawer({ brindes, onClose, onSelect }: Props) {
  const [visivel, setVisivel] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisivel(true));
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function fechar() {
    setVisivel(false);
    window.setTimeout(onClose, 200);
  }

  const total = brindes.reduce((s, b) => s + (Number(b.valor) || 0), 0);
  const pagos = brindes.filter((b) => b.status === "Pago").length;
  const ordenados = [...brindes].sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Brindes do mes">
      <div
        onClick={fechar}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${visivel ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl transition-transform duration-300 ease-out ${
          visivel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ═══════ CABEÇALHO ═══════ */}
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Custos de Brindes / Fidelidade</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Brindes do mes</h2>
            </div>
            <button
              onClick={fechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">
              - {formatCurrency(total)}
            </span>
            <span className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300">
              {brindes.length} resgate{brindes.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
              {pagos} pago{pagos === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* ═══════ LISTA ═══════ */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {ordenados.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Nenhum brinde neste mes.</p>
          ) : (
            ordenados.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelect?.(b)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.descricao}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{dataBR(b.data)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-bold text-red-400">- {formatCurrency(b.valor)}</span>
                  <span className={classNames("rounded-full border px-1.5 py-0.5 text-[10px] font-bold", EXPENSE_STATUS_COLORS[b.status])}>
                    {b.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
