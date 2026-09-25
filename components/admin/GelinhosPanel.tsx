"use client";

import { useState } from "react";
import { useProductStore } from "@/lib/store";
import { useStoreConfig, saveStoreConfig } from "@/lib/storeConfig";

type StockLevel = "saudavel" | "atencao" | "critico" | "esgotado";

function getStockLevel(estoque: number, minimo: number, critico: number): StockLevel {
  if (estoque <= 0) return "esgotado";
  if (estoque <= critico) return "critico";
  if (estoque <= minimo) return "atencao";
  return "saudavel";
}

const STOCK_CONFIG: Record<StockLevel, { bar: string; border: string; badge: string; badgeBg: string; counter: string; cardOpacity: string }> = {
  saudavel: {
    bar: "bg-[#10B981]",
    border: "border-[#10B981]/40",
    badge: "Em Estoque",
    badgeBg: "bg-[#10B981]/15 text-[#10B981]",
    counter: "text-white",
    cardOpacity: "",
  },
  atencao: {
    bar: "bg-amber-500",
    border: "border-amber-400",
    badge: "REPOR ESTOQUE",
    badgeBg: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
    counter: "text-amber-500",
    cardOpacity: "",
  },
  critico: {
    bar: "bg-orange-500",
    border: "border-orange-500",
    badge: "ESTOQUE CRÍTICO",
    badgeBg: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
    counter: "text-orange-500",
    cardOpacity: "",
  },
  esgotado: {
    bar: "bg-[#8B1D22]",
    border: "border-[#8B1D22] dark:border-[#A32430]",
    badge: "ESGOTADO",
    badgeBg: "bg-[#8B1D22] text-neutral-50",
    counter: "text-[#EF4444]",
    cardOpacity: "",
  },
};

export default function GelinhosPanel() {
  const products = useProductStore((s) => s.products);
  const adjustStock = useProductStore((s) => s.adjustStock);
  const addProduct = useProductStore((s) => s.addProduct);
  const updateProduct = useProductStore((s) => s.updateProduct);
  const deleteProduct = useProductStore((s) => s.deleteProduct);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "saudavel" | "atencao" | "critico">("all");
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [shiftPopover, setShiftPopover] = useState<{ productId: string; x: number; y: number } | null>(null);
  const config = useStoreConfig();
  const brindeAtivo = config.brindeAtivo;

  function toggleBrinde() {
    saveStoreConfig({ ...config, brindeAtivo: !brindeAtivo });
  }

  const [newForm, setNewForm] = useState({ name: "", price: 0, precoCustoInicial: 0, estoque: 10, estoqueMinimo: 5, estoqueCritico: 2 });
  const [editForm, setEditForm] = useState({ name: "", price: 0, precoCustoInicial: 0, estoque: 0, estoqueMinimo: 5, estoqueCritico: 2 });

  const gelinhos = products.filter((p) => p.category_id === "cat-3" || p.controlarEstoque === true || p.name.toLowerCase().includes("gelinho"));

  const counts = {
    saudavel: gelinhos.filter((p) => getStockLevel(p.estoque ?? 0, p.estoqueMinimo ?? 5, p.estoqueCritico ?? 2) === "saudavel").length,
    atencao: gelinhos.filter((p) => getStockLevel(p.estoque ?? 0, p.estoqueMinimo ?? 5, p.estoqueCritico ?? 2) === "atencao").length,
    critico: gelinhos.filter((p) => { const l = getStockLevel(p.estoque ?? 0, p.estoqueMinimo ?? 5, p.estoqueCritico ?? 2); return l === "critico" || l === "esgotado"; }).length,
  };

  const filtered = gelinhos.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const level = getStockLevel(p.estoque ?? 0, p.estoqueMinimo ?? 5, p.estoqueCritico ?? 2);
    if (filterStatus === "saudavel") return matchSearch && level === "saudavel";
    if (filterStatus === "atencao") return matchSearch && level === "atencao";
    if (filterStatus === "critico") return matchSearch && (level === "critico" || level === "esgotado");
    return matchSearch;
  });

  function handleNewGelinho(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.name.trim()) return;
    addProduct({
      name: newForm.name.trim(),
      category_id: "cat-3",
      description: null,
      price: newForm.price,
      image_url: null,
      brand: "",
      is_available: true,
      isCustomWeight: false,
      controlarEstoque: true,
      estoque: newForm.estoque,
      estoqueMinimo: newForm.estoqueMinimo,
      estoqueCritico: newForm.estoqueCritico,
      precoCustoInicial: newForm.precoCustoInicial,
    });
    setNewForm({ name: "", price: 0, precoCustoInicial: 0, estoque: 10, estoqueMinimo: 5, estoqueCritico: 2 });
    setNewModalOpen(false);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editModal) return;
    const updates: Record<string, unknown> = {
      name: editForm.name,
      price: editForm.price,
      estoque: editForm.estoque,
      estoqueMinimo: editForm.estoqueMinimo,
      estoqueCritico: editForm.estoqueCritico,
      precoCustoInicial: editForm.precoCustoInicial,
    };
    if (editForm.estoque <= 0) updates.is_available = false;
    else if (!products.find((p) => p.id === editModal)?.is_available) updates.is_available = true;
    updateProduct(editModal, updates);
    setEditModal(null);
  }

  function handleDeleteGelinho() {
    if (!deleteConfirm) return;
    deleteProduct(deleteConfirm);
    setDeleteConfirm(null);
    setEditModal(null);
  }

  function openEdit(p: { id: string; name: string; price: number; precoCustoInicial?: number; estoque?: number; estoqueMinimo?: number; estoqueCritico?: number }) {
    setEditForm({ name: p.name, price: p.price, precoCustoInicial: p.precoCustoInicial ?? 0, estoque: p.estoque ?? 0, estoqueMinimo: p.estoqueMinimo ?? 5, estoqueCritico: p.estoqueCritico ?? 2 });
    setEditModal(p.id);
  }

  function handleMinusClick(e: React.MouseEvent<HTMLButtonElement>, productId: string, currentQty: number) {
    if (e.shiftKey) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setShiftPopover({ productId, x: rect.left, y: rect.top - 10 });
    } else {
      const p = products.find((pp) => pp.id === productId);
      const newQty = currentQty - 1;
      adjustStock(productId, newQty);
      if (newQty <= 0 && p?.is_available) {
        updateProduct(productId, { is_available: false });
      }
    }
  }

  function handleMotivoBaixa() {
    if (!shiftPopover) return;
    const p = products.find((pp) => pp.id === shiftPopover.productId);
    if (p) {
      const newQty = (p.estoque ?? 1) - 1;
      adjustStock(shiftPopover.productId, newQty);
      if (newQty <= 0 && p.is_available) {
        updateProduct(shiftPopover.productId, { is_available: false });
      }
    }
    setShiftPopover(null);
  }

  return (
    <div className="space-y-3">
      {/* ═══════ TOOLBAR ═══════ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar gelinho..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-wine-500"
          />
        </div>
        <div className="flex gap-1">
          {([
            { key: "all", label: "Todos", count: gelinhos.length, color: "brand" },
            { key: "saudavel", label: "Saudáveis", count: counts.saudavel, color: "emerald" },
            { key: "atencao", label: "Atenção", count: counts.atencao, color: "amber" },
            { key: "critico", label: "Críticos", count: counts.critico, color: "red" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${
                filterStatus === f.key
                  ? f.color === "red" ? "bg-red-500 text-white" : f.color === "amber" ? "bg-amber-500 text-white" : f.color === "emerald" ? "bg-emerald-500 text-white" : "bg-wine-500 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <button
          onClick={() => setNewModalOpen(true)}
          className="rounded-lg bg-wine-500 px-3 py-1.5 text-[10px] font-bold text-white shadow transition-all hover:bg-wine-600"
        >
          + Novo
        </button>
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-[#8B1D22]/30 bg-[#8B1D22]/10 px-3 py-1.5 dark:border-red-900/50 dark:bg-red-950/50">
          <span className={`text-[10px] font-bold ${brindeAtivo ? "text-[#8B1D22] dark:text-red-400" : "text-neutral-500"}`}>
            🎁 Brinde {brindeAtivo ? "Ativo" : "Desativado"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={brindeAtivo}
            onClick={toggleBrinde}
            className={`relative h-5 w-9 rounded-full transition-colors ${brindeAtivo ? "bg-emerald-500" : "bg-neutral-700"}`}
            title={brindeAtivo ? "Desativar brinde no cardapio" : "Ativar brinde no cardapio"}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${brindeAtivo ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {/* ═══════ GRID COMPACTO ═══════ */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-neutral-500">Nenhum gelinho encontrado.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((p) => {
            const estoque = p.estoque ?? 10;
            const minimo = p.estoqueMinimo ?? 5;
            const critico = p.estoqueCritico ?? 2;
            const level = getStockLevel(estoque, minimo, critico);
            const cfg = STOCK_CONFIG[level];
            const pct = Math.min(100, (estoque / Math.max(minimo * 2, 15)) * 100);
            const stateClass =
              level === "atencao" ? "min-stock-warn" : level === "critico" ? "critical-stock-warn" : level === "esgotado" ? "stock-out" : "";
            const pulseClass = level === "esgotado" ? "animate-pulse-glow" : "";

            return (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-xl border bg-neutral-900 transition-all hover:-translate-y-0.5 hover:shadow-md ${cfg.border} ${cfg.cardOpacity} ${stateClass} ${pulseClass}`}
              >
                {/* Edit button */}
                <button
                  onClick={() => openEdit(p)}
                  className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-stone-100 text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-stone-200 hover:text-[#8C1B2B] dark:bg-neutral-800/80 dark:text-neutral-500 dark:hover:text-white"
                  title="Editar"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </button>

                <div className="p-2.5">
                  {/* Header: Name + Price */}
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold leading-tight text-white">{p.name.replace("Gelinho ", "")}</p>
                      <p className="text-[11px] font-bold text-wine-500">R$ {(p.price ?? 0).toFixed(2).replace(".", ",")}</p>
                    </div>
                  </div>

                  {/* Stock bar */}
                  <div className="mb-1.5">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className={`shrink-0 text-[10px] font-bold tabular-nums ${cfg.counter}`}>{estoque} un</span>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${cfg.badgeBg}`}>{cfg.badge}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
                      <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[8px] text-[#9CA3AF]">Mín {minimo} · Crít {critico}</p>
                  </div>

                  {/* Footer: Status + Controls */}
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${estoque > 0 && p.is_available ? "text-[#10B981]" : "text-[#9CA3AF]"}`}>
                      <span className={`h-2 w-2 rounded-full ${estoque > 0 && p.is_available ? "bg-[#10B981]" : "bg-[#9CA3AF]"}`} />
                      {estoque > 0 && p.is_available ? "Ativo" : "Indisponível"}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(e) => handleMinusClick(e, p.id, estoque)}
                        disabled={estoque <= 0}
                        className={`flex h-6 w-6 items-center justify-center rounded-lg border text-[10px] font-bold transition-all active:scale-90 ${
                          estoque <= 0
                            ? "border-neutral-800 bg-neutral-900 text-neutral-700 cursor-not-allowed"
                            : "border-neutral-700 bg-neutral-800 text-white hover:border-red-500 hover:bg-red-500/15 hover:text-red-400"
                        }`}
                        title="Shift+click para informar motivo"
                      >
                        −
                      </button>
                      <span className={`stock-qty w-6 text-center text-[11px] font-bold tabular-nums ${cfg.counter}`}>{estoque}</span>
                      <button
                        onClick={() => adjustStock(p.id, estoque + 1)}
                        disabled={estoque <= 0}
                        className={`flex h-6 w-6 items-center justify-center rounded-lg border text-[10px] font-bold transition-all active:scale-90 ${
                          estoque <= 0
                            ? "border-neutral-800 bg-neutral-900 text-neutral-700 cursor-not-allowed"
                            : "border-neutral-700 bg-neutral-800 text-white hover:border-emerald-500 hover:bg-emerald-500/15 hover:text-emerald-400"
                        }`}
                        title="Adicionar 1 unidade"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ SHIFT+CLICK POPOVER ═══════ */}
      {shiftPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShiftPopover(null)} />
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
            style={{ left: Math.min(shiftPopover.x, window.innerWidth - 190), top: Math.max(10, shiftPopover.y - 120) }}
          >
            <p className="border-b border-neutral-800 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Motivo da Baixa</p>
            {["Venda de Balcão", "Perda / Avaria", "Degustação"].map((motivo) => (
              <button key={motivo} onClick={handleMotivoBaixa} className="w-full px-3 py-2 text-left text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white">
                {motivo}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ═══════ MODAL: NOVO GELINHO ═══════ */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setNewModalOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-base font-bold text-white">Novo Gelinho</h3>
            </div>
            <form onSubmit={handleNewGelinho} className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome *</label>
                <input type="text" required value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: Gelinho de Morango" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Preço (R$) *</label>
                  <input type="number" step="0.50" min="0" required value={newForm.price || ""} onChange={(e) => setNewForm({ ...newForm, price: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" placeholder="0.00" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Custo (R$)</label>
                  <input type="number" step="0.01" min="0" value={newForm.precoCustoInicial || ""} onChange={(e) => setNewForm({ ...newForm, precoCustoInicial: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" placeholder="0.00" />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Estoque</label>
                  <input type="number" min="0" value={newForm.estoque} onChange={(e) => setNewForm({ ...newForm, estoque: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Mínimo</label>
                  <input type="number" min="0" value={newForm.estoqueMinimo} onChange={(e) => setNewForm({ ...newForm, estoqueMinimo: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Crítico</label>
                  <input type="number" min="0" value={newForm.estoqueCritico} onChange={(e) => setNewForm({ ...newForm, estoqueCritico: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setNewModalOpen(false)} className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button type="submit" className="flex-1 rounded-lg bg-wine-500 px-3 py-2 text-xs font-bold text-white shadow hover:bg-wine-600">Cadastrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: EDITAR GELINHO ═══════ */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-base font-bold text-white">Editar Gelinho</h3>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Preço (R$)</label>
                  <input type="number" step="0.50" min="0" required value={editForm.price || ""} onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Custo (R$)</label>
                  <input type="number" step="0.01" min="0" value={editForm.precoCustoInicial || ""} onChange={(e) => setEditForm({ ...editForm, precoCustoInicial: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
                <div className="w-20">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Estoque</label>
                  <input type="number" min="0" value={editForm.estoque} onChange={(e) => setEditForm({ ...editForm, estoque: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Mínimo</label>
                  <input type="number" min="0" value={editForm.estoqueMinimo} onChange={(e) => setEditForm({ ...editForm, estoqueMinimo: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Crítico</label>
                  <input type="number" min="0" value={editForm.estoqueCritico} onChange={(e) => setEditForm({ ...editForm, estoqueCritico: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setDeleteConfirm(editModal)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20">Excluir</button>
                <div className="flex flex-1 gap-2">
                  <button type="button" onClick={() => setEditModal(null)} className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                  <button type="submit" className="flex-1 rounded-lg bg-wine-500 px-3 py-2 text-xs font-bold text-white shadow hover:bg-wine-600">Salvar</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: CONFIRMAR EXCLUSÃO ═══════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-xs rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-base font-semibold text-white">Excluir este gelinho?</h3>
              <p className="mt-1.5 text-xs text-neutral-400">Ação irreversível.</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={handleDeleteGelinho} className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
