"use client";

import { useState } from "react";
import type { MixCaixa } from "@/types/database";
import { alterarQtdMix, criarMixVazio, mixCompleto, totalDoMix } from "@/lib/combo";

interface ComboPickerProps {
  total: number;
  sabores: string[];
  mixes: MixCaixa[];
  onChange: (mixes: MixCaixa[]) => void;
  passo?: number;
}

export default function ComboPicker({ total, sabores, mixes, onChange, passo }: ComboPickerProps) {
  const [ativa, setAtiva] = useState(0);
  const idx = Math.min(ativa, Math.max(0, mixes.length - 1));
  const mix = mixes[idx] ?? criarMixVazio(sabores);
  const usado = totalDoMix(mix);
  const completo = mixCompleto(mix, total);
  const passoEff = passo && passo > 0 ? passo : 1;

  function mudarMix(novo: MixCaixa) {
    const proximo = [...mixes];
    proximo[idx] = novo;
    onChange(proximo);
  }

  function adicionarCaixa() {
    onChange([...mixes, criarMixVazio(sabores)]);
    setAtiva(mixes.length);
  }

  function removerCaixa(i: number) {
    if (mixes.length <= 1) return;
    onChange(mixes.filter((_, j) => j !== i));
    setAtiva((a) => Math.max(0, a >= i ? a - 1 : a));
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {mixes.map((m, i) => (
          <div key={i} className="flex items-center overflow-hidden rounded-full border border-neutral-300 dark:border-neutral-600">
            <button
              type="button"
              onClick={() => setAtiva(i)}
              className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                i === idx
                  ? "bg-wine-600 text-white"
                  : "bg-white text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              Caixa {i + 1} {mixCompleto(m, total) ? "✓" : ""}
            </button>
            {mixes.length > 1 && (
              <button
                type="button"
                onClick={() => removerCaixa(i)}
                className={`px-1.5 py-1 text-[11px] font-bold transition-colors ${
                  i === idx
                    ? "bg-wine-700 text-white/80 hover:text-white"
                    : "bg-white text-neutral-400 hover:text-red-500 dark:bg-neutral-800"
                }`}
                title="Remover caixa"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={adicionarCaixa}
          className="rounded-full border border-dashed border-neutral-400 px-2.5 py-1 text-[11px] font-bold text-neutral-500 transition-colors hover:border-wine-500 hover:text-wine-600 dark:border-neutral-500 dark:text-neutral-400 dark:hover:text-wine-400"
        >
          + Caixa
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Sabores da Caixa {idx + 1}
          {passoEff > 1 && (
            <span className="ml-1 normal-case text-neutral-400 dark:text-neutral-500">(em múltiplos de {passoEff})</span>
          )}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            completo
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          {usado} / {total}
        </span>
      </div>

      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {sabores.map((sabor) => {
          const qtd = mix[sabor] ?? 0;
          return (
            <div
              key={sabor}
              className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-950"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {sabor}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={qtd <= 0}
                  onClick={() => mudarMix(alterarQtdMix(mix, sabor, -passoEff, total))}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  −
                </button>
                <span
                  className={`w-5 text-center text-xs font-bold ${
                    qtd > 0 ? "text-wine-600 dark:text-wine-400" : "text-neutral-400"
                  }`}
                >
                  {qtd}
                </span>
                <button
                  type="button"
                  disabled={usado + passoEff > total}
                  onClick={() => mudarMix(alterarQtdMix(mix, sabor, passoEff, total))}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
