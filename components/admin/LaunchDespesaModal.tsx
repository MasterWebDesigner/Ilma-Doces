"use client";

import { useState } from "react";
import { useExpenseStore, EXPENSE_CATEGORIES } from "@/lib/store";
import { getLocalDateStr } from "@/lib/utils";

interface Props {
  onClose: () => void;
}

export default function LaunchDespesaModal({ onClose }: Props) {
  const addExpense = useExpenseStore((s) => s.addExpense);
  const [form, setForm] = useState({
    descricao: "",
    categoria: "Insumos",
    valor: "",
    data: getLocalDateStr(),
    status: "Pendente" as "Pago" | "Pendente" | "Em Atraso",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor) return;
    addExpense({
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor: parseFloat(form.valor),
      data: form.data,
      status: form.status,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <h2 className="text-lg font-bold text-white">Lancar Despesa</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Descricao <span className="text-red-500">*</span></label>
            <input type="text" required value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
              placeholder="Ex: Farinha de trigo, Energia Eletrica..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Categoria</label>
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Valor (R$) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0" required value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Data</label>
              <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Status</label>
              <div className="flex gap-2">
                {(["Pago", "Pendente", "Em Atraso"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, status: s }))}
                    className={`flex-1 rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-all ${
                      form.status === s
                        ? s === "Pago" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                        : s === "Pendente" ? "border-amber-500 bg-amber-500/15 text-amber-400"
                        : "border-red-500 bg-red-500/15 text-red-400"
                        : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">
              Cancelar
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-wine-600">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
