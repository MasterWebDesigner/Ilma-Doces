"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { useBrandStore } from "@/lib/store";
import { classNames } from "@/lib/utils";
import { getStep, formatQty, ALL_STOCK_UNITS } from "@/lib/units";
import { obterPrecoMedioInsumo } from "@/lib/precoMedio";
import { notifyStockChanged, saveStockData, saveBatchesData } from "@/lib/stockStorage";
import { SEED_STOCK } from "@/lib/seedData";

// ═══════════ TYPES ═══════════
export interface StockItem {
  id: string;
  name: string;
  category: string;
  min: number;
  unit: string;
  precoCustoInicial?: number;
}

export interface StockBrand {
  id: string;
  stockItemId: string;
  brandId: string;
}

export interface Batch {
  id: string;
  insumoId: string;
  brandId: string;
  dataEntrada: string;
  quantidadeInicial: number;
  quantidadeRestante: number;
  precoUnitario: number;
  dataValidade?: string;
}

const STOCK_KEY = "ilma-stock";
const STOCK_BRANDS_KEY = "ilma-stock-brands";
const BATCH_KEY = "ilma-batches";
const SEED_KEY = "ilma-seeded-v3";

// ═══════════ SEED DATA ═══════════

const SEED_BRANDS: { id: string; nome: string }[] = [
  { id: "br-01", nome: "União" },
  { id: "br-02", nome: "Caravela" },
  { id: "br-03", nome: "Barra" },
  { id: "br-04", nome: "Anaconda" },
  { id: "br-05", nome: "Renata" },
  { id: "br-06", nome: "Maizena" },
  { id: "br-07", nome: "Royal" },
  { id: "br-08", nome: "Liza" },
  { id: "br-09", nome: "Du Porto" },
  { id: "br-10", nome: "SoCoco" },
  { id: "br-11", nome: "DuCoco" },
  { id: "br-12", nome: "Nestlé" },
  { id: "br-13", nome: "Piracanjuba" },
  { id: "br-14", nome: "Italac" },
  { id: "br-15", nome: "Líder" },
  { id: "br-16", nome: "Parmalat" },
  { id: "br-17", nome: "Mix" },
  { id: "br-18", nome: "Arcolor" },
  { id: "br-19", nome: "Danone" },
  { id: "br-20", nome: "Qualy" },
  { id: "br-21", nome: "Garoto" },
  { id: "br-22", nome: "Melken" },
  { id: "br-23", nome: "Harald" },
  { id: "br-24", nome: "Terrinha" },
  { id: "br-25", nome: "Cisne" },
  { id: "br-26", nome: "Ferrero" },
  { id: "br-27", nome: "Tang" },
  { id: "br-28", nome: "Mago" },
  { id: "br-29", nome: "Iceberg" },
  { id: "br-30", nome: "Mavalerio" },
  { id: "br-31", nome: "Prafesta" },
  { id: "br-32", nome: "Lacta" },
  { id: "br-33", nome: "Vitarela" },
  { id: "br-34", nome: "Norcal" },
  { id: "br-35", nome: "Santa Clara" },
  { id: "br-36", nome: "Lopes" },
  { id: "br-37", nome: "Fazenda" },
];


// (stockItemId → brandIds[])
const SEED_LINKS: Record<string, string[]> = {
  "si-01": ["br-01", "br-02", "br-03"],
  "si-02": ["br-04", "br-05"],
  "si-03": ["br-06"],
  "si-04": ["br-07"],
  "si-05": ["br-21", "br-23"],
  "si-06": ["br-08"],
  "si-08": ["br-09"],
  "si-09": ["br-10"],
  "si-10": ["br-11"],
  "si-11": ["br-12", "br-13", "br-14"],
  "si-12": ["br-12"],
  "si-13": ["br-15", "br-13", "br-14", "br-16"],
  "si-14": ["br-13", "br-16"],
  "si-15": ["br-17", "br-18"],
  "si-16": ["br-19"],
  "si-17": ["br-20"],
  "si-18": ["br-21", "br-22"],
  "si-19": ["br-21", "br-22"],
  "si-20": ["br-12", "br-22"],
  "si-21": ["br-21", "br-22"],
  "si-22": ["br-23"],
  "si-23": ["br-23"],
  "si-25": ["br-24"],
  "si-26": ["br-35"],
  "si-28": ["br-25"],
  "si-29": ["br-26"],
  "si-30": ["br-27"],
  "si-31": ["br-27"],
  "si-32": ["br-27"],
  "si-33": ["br-27"],
  "si-34": ["br-12"],
  "si-35": ["br-17", "br-28", "br-29"],
  "si-36": ["br-28"],
  "si-37": ["br-09"],
  "si-38": ["br-36"],
  "si-39": ["br-34"],
  "si-40": ["br-37"],
  "si-41": ["br-37"],
  "si-42": ["br-37"],
  "si-43": ["br-37"],
  "si-44": ["br-37"],
  "si-45": ["br-37"],
  "si-46": ["br-37"],
  "si-47": ["br-37"],
  "si-48": ["br-37"],
  "si-49": ["br-37"],
  "si-50": ["br-37"],
  "si-51": ["br-37"],
  "si-52": ["br-37"],
  "si-53": ["br-28"],
  "si-54": ["br-30"],
  "si-55": ["br-30"],
  "si-56": ["br-30"],
  "si-57": ["br-22"],
  "si-58": ["br-30"],
  "si-59": ["br-12"],
  "si-60": ["br-26"],
  "si-61": ["br-32"],
  "si-62": ["br-32"],
  "si-63": ["br-33"],
  "si-66": ["br-31"],
  "si-68": ["br-31"],
  "si-69": ["br-31"],
  "si-70": ["br-31"],
  "si-71": ["br-31"],
  "si-72": ["br-31"],
  "si-73": ["br-31"],
  "si-74": ["br-31"],
  "si-75": ["br-31"],
  "si-76": ["br-31"],
  "si-77": ["br-31"],
  "si-78": ["br-31"],
  "si-79": ["br-31"],
  "si-80": ["br-31"],
};

function seedDataIfEmpty() {
  if (typeof window === "undefined") return;
  try {
    const alreadySeeded = localStorage.getItem(SEED_KEY);
    if (alreadySeeded) return;

    // 1. Seed stock
    const stockRaw = localStorage.getItem(STOCK_KEY);
    let existingStock: any[] = [];
    if (stockRaw) {
      try {
        const parsed = JSON.parse(stockRaw);
        existingStock = Array.isArray(parsed) ? parsed : [];
      } catch {}
    }
    if (existingStock.length === 0) {
      saveStockData(SEED_STOCK);
    }

    // 2. Seed brands directly into Zustand persist format
    const brandsRaw = localStorage.getItem("ilma-brands-v2");
    let existingBrands: any[] = [];
    if (brandsRaw) {
      try {
        const parsed = JSON.parse(brandsRaw);
        existingBrands = parsed?.state?.brands ?? parsed?.brands ?? [];
      } catch {}
    }
    if (existingBrands.length === 0) {
      const brandsState = {
        state: {
          brands: SEED_BRANDS.map((b) => ({
            id: b.id,
            nome: b.nome,
            status: "Ativa",
          })),
        },
        version: 0,
      };
      localStorage.setItem("ilma-brands-v2", JSON.stringify(brandsState));
    }

    // 3. Seed stock-brands using fixed IDs (must match SEED_BRANDS IDs)
    const sbRaw = localStorage.getItem(STOCK_BRANDS_KEY);
    let existingSB: any[] = [];
    if (sbRaw) {
      try {
        const parsed = JSON.parse(sbRaw);
        existingSB = Array.isArray(parsed) ? parsed : [];
      } catch {}
    }
    if (existingSB.length === 0) {
      const newSB: StockBrand[] = [];
      for (const [stockItemId, brandIds] of Object.entries(SEED_LINKS)) {
        for (const brandId of brandIds) {
          newSB.push({
            id: `sb-${stockItemId}-${brandId}`,
            stockItemId,
            brandId,
          });
        }
      }
      localStorage.setItem(STOCK_BRANDS_KEY, JSON.stringify(newSB));
    }

    localStorage.setItem(SEED_KEY, "done");
  } catch {}
}

const EMPTY_FORM = { name: "", category: "Uso Interno", min: 1, unit: "un", precoCustoInicial: 0 };
const EMPTY_BATCH = { qtd: "", preco: "", validade: "", temValidade: false };

// ═══════════ STORAGE HELPERS ═══════════
function loadStock(): StockItem[] {
  if (typeof window === "undefined") return SEED_STOCK;
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.map((item: any) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        min: item.min,
        unit: item.unit,
        precoCustoInicial: item.precoCustoInicial ?? 0,
      }));
    }
  } catch {}
  return SEED_STOCK;
}

function loadStockBrands(): StockBrand[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STOCK_BRANDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function loadBatches(): Batch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BATCH_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveStock(items: StockItem[]) {
  saveStockData(items);
}

function saveStockBrands(stockBrands: StockBrand[]) {
  localStorage.setItem(STOCK_BRANDS_KEY, JSON.stringify(stockBrands));
}

function saveBatches(batches: Batch[]) {
  saveBatchesData(batches);
}

// ═══════════ PEPS LOGIC ═══════════
function calcularQtyTotal(batches: Batch[], insumoId: string, brandId?: string): number {
  return batches
    .filter((b) => b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true))
    .reduce((s, b) => s + b.quantidadeRestante, 0);
}

function calcularLotesAtivos(batches: Batch[], insumoId: string, brandId?: string): number {
  return batches.filter((b) =>
    b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true)
  ).length;
}

function baixarEstoquePEPS(batches: Batch[], insumoId: string, quantidade: number, brandId?: string): Batch[] {
  const sorted = [...batches]
    .filter((b) =>
      b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true)
    )
    .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));

  let restante = quantidade;
  const updated = batches.map((b) => ({ ...b }));

  for (const lote of sorted) {
    if (restante <= 0) break;
    const loteRef = updated.find((u) => u.id === lote.id);
    if (!loteRef) continue;
    const baixa = Math.min(loteRef.quantidadeRestante, restante);
    loteRef.quantidadeRestante -= baixa;
    restante -= baixa;
  }

  return updated;
}

// ═══════════ COMPONENT ═══════════
export default function AdminEstoque() {
  const brands = useBrandStore((s) => s.brands);
  const addBrand = useBrandStore((s) => s.addBrand);
  const updateBrand = useBrandStore((s) => s.updateBrand);
  const deleteBrand = useBrandStore((s) => s.deleteBrand);
  const getActiveBrands = useBrandStore((s) => s.getActiveBrands);
  const getBrandNameById = useBrandStore((s) => s.getBrandNameById);

  const [items, setItems] = useState<StockItem[]>([]);
  const [stockBrands, setStockBrands] = useState<StockBrand[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey] = useState<"name" | "qty" | "precoMedio" | "lotesAtivos">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Batch entry modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchInsumoId, setBatchInsumoId] = useState("");
  const [batchBrandId, setBatchBrandId] = useState("");
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH);

  // Batch history modal
  const [historyInsumoId, setHistoryInsumoId] = useState<string | null>(null);
  const [historyBrandId, setHistoryBrandId] = useState<string | null>(null);

  // Brand per insumo modal
  const [insumoBrandModal, setInsumoBrandModal] = useState<string | null>(null);
  const [newInsumoBrandId, setNewInsumoBrandId] = useState("");
  const [inlineBrandName, setInlineBrandName] = useState("");

  // Brand global modal
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState("");
  const [deleteBrandId, setDeleteBrandId] = useState<string | null>(null);
  const [brandError, setBrandError] = useState("");

  useEffect(() => {
    seedDataIfEmpty();

    // Force Zustand brand store to rehydrate from localStorage
    useBrandStore.persist.rehydrate();

    setItems(loadStock());
    setStockBrands(loadStockBrands());
    setBatches(loadBatches());
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) saveStock(items); }, [items, loaded]);
  useEffect(() => { if (loaded) saveStockBrands(stockBrands); }, [stockBrands, loaded]);
  useEffect(() => { if (loaded) saveBatches(batches); }, [batches, loaded]);

  // ═══════ COMPUTED ═══════
  const getBrandsForInsumo = (insumoId: string) => {
    return stockBrands.filter((sb) => sb.stockItemId === insumoId);
  };

  const filtered = items.filter((i) => {
    if (filter !== "all" && i.category !== filter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stockComPreco = useMemo(() => {
    let result = filtered.map((item) => {
      const qty = calcularQtyTotal(batches, item.id);
      const precoMedio = obterPrecoMedioInsumo(batches, item.id, item.precoCustoInicial);
      const lotesAtivos = calcularLotesAtivos(batches, item.id);
      const itemBrands = getBrandsForInsumo(item.id);
      return { ...item, qty, precoMedio, lotesAtivos, itemBrands };
    });

    if (filterStatus !== "all") {
      result = result.filter((i) => {
        if (filterStatus === "em_dia") return i.qty >= i.min;
        if (filterStatus === "estoque_baixo") return i.qty < i.min && i.qty > 0;
        if (filterStatus === "sem_estoque") return i.qty === 0;
        return true;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "qty") cmp = a.qty - b.qty;
      else if (sortKey === "precoMedio") cmp = a.precoMedio - b.precoMedio;
      else if (sortKey === "lotesAtivos") cmp = a.lotesAtivos - b.lotesAtivos;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [filtered, batches, filterStatus, sortKey, sortDir, stockBrands]);

  const totalItems = items.length;
  const totalLotes = batches.filter((b) => b.quantidadeRestante > 0).length;
  const estoqueBaixo = items.filter((i) => calcularQtyTotal(batches, i.id) < i.min && calcularQtyTotal(batches, i.id) > 0).length;
  const valorTotalEstoque = stockComPreco.reduce((s, i) => s + i.qty * i.precoMedio, 0);
  const estoqueBaixoCount = items.filter((i) => calcularQtyTotal(batches, i.id) < i.min && calcularQtyTotal(batches, i.id) > 0).length;
  const semEstoqueCount = items.filter((i) => calcularQtyTotal(batches, i.id) === 0).length;

  const filteredBrands = brands.filter((b) =>
    b.nome.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const historicoInsumo = historyInsumoId ? items.find((i) => i.id === historyInsumoId) : null;
  const historicoLotes = historyInsumoId
    ? batches
        .filter((b) => b.insumoId === historyInsumoId && (historyBrandId ? b.brandId === historyBrandId : true))
        .sort((a, b) => b.dataEntrada.localeCompare(a.dataEntrada))
    : [];

  const batchInsumoBrands = batchInsumoId ? getBrandsForInsumo(batchInsumoId) : [];

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortIcon(key: typeof sortKey) {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  // ═══════ ACTIONS ═══════
  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setStockBrands((prev) => prev.filter((sb) => sb.stockItemId !== id));
    setBatches((prev) => prev.filter((b) => b.insumoId !== id));
    setDeleteId(null);
  }

  function openEdit(item: StockItem) {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, min: item.min, unit: item.unit, precoCustoInicial: item.precoCustoInicial ?? 0 });
    setModalOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      setItems((prev) => prev.map((i) => i.id === editingId ? { ...i, name: form.name, category: form.category, min: form.min, unit: form.unit, precoCustoInicial: form.precoCustoInicial } : i));
    } else {
      const newItem: StockItem = {
        id: "s-" + Date.now(),
        name: form.name,
        category: form.category,
        min: form.min,
        unit: form.unit,
        precoCustoInicial: form.precoCustoInicial,
      };
      setItems((prev) => [...prev, newItem]);
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(false);
  }

  // Batch entry
  function openBatchEntry(insumoId?: string, brandId?: string) {
    setBatchInsumoId(insumoId || "");
    setBatchBrandId(brandId || "");
    setBatchForm(EMPTY_BATCH);
    setBatchModalOpen(true);
  }

  function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qtd = parseFloat(batchForm.qtd);
    const preco = parseFloat(batchForm.preco);
    if (!batchInsumoId || !qtd || !preco) return;

    const newBatch: Batch = {
      id: "b-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      insumoId: batchInsumoId,
      brandId: batchBrandId,
      dataEntrada: new Date().toISOString().slice(0, 10),
      quantidadeInicial: qtd,
      quantidadeRestante: qtd,
      precoUnitario: preco,
      dataValidade: batchForm.temValidade && batchForm.validade ? batchForm.validade : undefined,
    };

    setBatches((prev) => [...prev, newBatch]);
    setBatchModalOpen(false);
    setBatchForm(EMPTY_BATCH);
    setBatchInsumoId("");
    setBatchBrandId("");
  }

  function handleQuickConsume(insumoId: string) {
    const qty = calcularQtyTotal(batches, insumoId);
    if (qty <= 0) return;
    setBatches((prev) => baixarEstoquePEPS(prev, insumoId, 1));
  }

  function handleQuickConsumeBrand(insumoId: string, brandId: string) {
    const qty = calcularQtyTotal(batches, insumoId, brandId);
    if (qty <= 0) return;
    setBatches((prev) => baixarEstoquePEPS(prev, insumoId, 1, brandId));
  }

  // Brand per insumo
  function addBrandToInsumo() {
    if (!insumoBrandModal) return;
    let brandId = newInsumoBrandId;

    // Se digitou um nome novo, cria a marca primeiro
    if (!brandId && inlineBrandName.trim()) {
      const result = addBrand(inlineBrandName.trim());
      if (result) {
        brandId = result.id;
      } else {
        // Ja existe — pega o id existente
        const existing = brands.find((b) => b.nome.toLowerCase() === inlineBrandName.trim().toLowerCase());
        if (existing) brandId = existing.id;
      }
    }

    if (!brandId) return;
    const exists = stockBrands.some((sb) => sb.stockItemId === insumoBrandModal && sb.brandId === brandId);
    if (exists) return;

    const newSB: StockBrand = {
      id: "sb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      stockItemId: insumoBrandModal,
      brandId,
    };
    setStockBrands((prev) => [...prev, newSB]);
    setNewInsumoBrandId("");
    setInlineBrandName("");
  }

  function removeBrandFromInsumo(stockBrandId: string) {
    const sb = stockBrands.find((s) => s.id === stockBrandId);
    if (!sb) return;
    setStockBrands((prev) => prev.filter((s) => s.id !== stockBrandId));
    setBatches((prev) => prev.filter((b) => !(b.insumoId === sb.stockItemId && b.brandId === sb.brandId)));
  }

  // Global brand CRUD
  function handleAddBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    setBrandError("");
    const result = addBrand(name);
    if (!result) { setBrandError("Ja existe uma marca com esse nome."); return; }
    setNewBrandName("");
  }

  function handleUpdateBrand(id: string) {
    const name = editBrandName.trim();
    if (!name) return;
    setBrandError("");
    const exists = brands.some((b) => b.id !== id && b.nome.toLowerCase() === name.toLowerCase());
    if (exists) { setBrandError("Ja existe uma marca com esse nome."); return; }
    updateBrand(id, { nome: name });
    setEditingBrandId(null);
    setEditBrandName("");
  }

  function handleDeleteBrandConfirm() {
    if (!deleteBrandId) return;
    setStockBrands((prev) => prev.filter((sb) => sb.brandId !== deleteBrandId));
    setBatches((prev) => prev.filter((b) => b.brandId !== deleteBrandId));
    deleteBrand(deleteBrandId);
    setDeleteBrandId(null);
  }

  function handleResetData() {
    if (!confirm("Isso vai apagar TODO o estoque, lotes e marcas. Deseja continuar?")) return;
    localStorage.removeItem(STOCK_KEY);
    localStorage.removeItem(STOCK_BRANDS_KEY);
    localStorage.removeItem(BATCH_KEY);
    localStorage.removeItem(SEED_KEY);
    localStorage.removeItem("ilma-brands-v2");
    notifyStockChanged();
    window.location.reload();
  }

  const activeBrands = getActiveBrands();

  return (
    <div className="space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Estoque / Insumos</h1>
          <p className="mt-1 text-sm text-neutral-400">Controle de lotes com media simples das 5 ultimas entradas (mantem com saldo zerado p/ precificacao; PEPS para baixa) — multiplas marcas por insumo</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleResetData}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20">
            Reiniciar Dados
          </button>
          <button onClick={() => setBrandModalOpen(true)}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-500/20">
            Gerenciar Marcas
          </button>
          <button onClick={() => openBatchEntry()}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20">
            + Nova Entrada
          </button>
          <button onClick={openCreate}
            className="rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600">
            + Novo Insumo
          </button>
        </div>
      </div>

      {/* ═══════ FILTERS ═══════ */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            {["all", "Uso Interno", "Embalagens"].map((cat) => (
              <button key={cat} onClick={() => setFilter(cat)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${filter === cat ? "bg-wine-500 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                {cat === "all" ? "Todos" : cat}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[
              { key: "all", label: "Todos" },
              { key: "em_dia", label: "Em Dia" },
              { key: "estoque_baixo", label: `Estoque Baixo (${estoqueBaixoCount})` },
              { key: "sem_estoque", label: `Sem Estoque (${semEstoqueCount})` },
            ].map((s) => (
              <button key={s.key} onClick={() => setFilterStatus(s.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${filterStatus === s.key ? "bg-emerald-500 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 pl-10 pr-3 text-sm text-white outline-none focus:border-wine-500" placeholder="Buscar insumo..." />
          </div>
        </div>
      </div>

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total de Insumos</p>
          <p className="mt-1 text-2xl font-bold text-white">{totalItems}</p>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Lotes Ativos</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{totalLotes}</p>
        </div>
        <div className={classNames("rounded-xl p-4", estoqueBaixo > 0 ? "border border-red-500/30 bg-red-500/10" : "border border-emerald-500/30 bg-emerald-500/10")}>
          <p className={classNames("text-[10px] font-semibold uppercase tracking-wider", estoqueBaixo > 0 ? "text-red-400" : "text-emerald-400")}>Estoque Baixo</p>
          <p className={classNames("mt-1 text-2xl font-bold", estoqueBaixo > 0 ? "text-red-400" : "text-emerald-400")}>{estoqueBaixo}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Valor Total Estoque</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">R$ {valorTotalEstoque.toFixed(2).replace(".", ",")}</p>
        </div>
      </div>

      {/* ═══════ TABLE ═══════ */}
      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="w-8 px-6 py-3"></th>
              <th className="px-6 py-3 cursor-pointer select-none hover:text-white transition-colors" onClick={() => toggleSort("name")}>Insumo{sortIcon("name")}</th>
              <th className="px-6 py-3">Categorias</th>
              <th className="px-6 py-3 text-center cursor-pointer select-none hover:text-white transition-colors" onClick={() => toggleSort("qty")}>Qtd Estoque{sortIcon("qty")}</th>
              <th className="px-6 py-3 text-center">Minimo</th>
              <th className="px-6 py-3 text-right cursor-pointer select-none hover:text-white transition-colors" onClick={() => toggleSort("precoMedio")}>Preco Medio{sortIcon("precoMedio")}</th>
              <th className="px-6 py-3 text-center cursor-pointer select-none hover:text-white transition-colors" onClick={() => toggleSort("lotesAtivos")}>Lotes{sortIcon("lotesAtivos")}</th>
              <th className="px-6 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {stockComPreco.map((item) => {
              const isLow = item.qty < item.min;
              const isOpen = expandedId === item.id;
              const valorTotal = item.qty * item.precoMedio;
              return (
                <Fragment key={item.id}>
                  <tr
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    className={classNames("cursor-pointer transition-all", isOpen ? "bg-neutral-800/40" : "hover:bg-neutral-800/30")}
                  >
                    <td className="px-6 py-4 pl-7">
                      <svg className={classNames("h-4 w-4 text-neutral-500 transition-transform", isOpen && "rotate-90")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-white">{item.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.itemBrands.map((sb) => {
                          const bName = getBrandNameById(sb.brandId);
                          return bName ? (
                            <span key={sb.id} className="rounded-full bg-wine-500/15 px-2 py-0.5 text-[9px] font-semibold text-wine-400">{bName}</span>
                          ) : null;
                        })}
                        {item.itemBrands.length === 0 && <span className="text-[10px] text-neutral-600">Sem marca</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-400">{item.category}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={classNames("text-sm font-bold", isLow ? "text-red-400" : "text-white")}>
                        {formatQty(item.qty, item.unit)} {item.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-xs text-neutral-500">{formatQty(item.min, item.unit)} {item.unit}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-amber-400">
                        R$ {item.precoMedio.toFixed(3).replace(".", ",")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={classNames(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        item.lotesAtivos > 1 ? "bg-blue-500/15 text-blue-400" : item.lotesAtivos === 1 ? "bg-neutral-700 text-neutral-400" : "bg-red-500/15 text-red-400"
                      )}>
                        {item.lotesAtivos} {item.lotesAtivos === 1 ? "lote" : "lotes"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={classNames("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", isLow ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400")}>
                        {isLow ? "Estoque Baixo" : "Em Dia"}
                      </span>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-neutral-900/80">
                      <td colSpan={8} className="px-6 py-0">
                        <div className="border-t border-b border-neutral-800/60 py-4 space-y-4">
                          {/* KPIs do insumo */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-3">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Valor Total em Estoque</p>
                              <p className="mt-1 text-lg font-bold text-amber-400">R$ {valorTotal.toFixed(2).replace(".", ",")}</p>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-3">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Preco Medio Geral</p>
                              <p className="mt-1 text-lg font-bold text-white">R$ {item.precoMedio.toFixed(3).replace(".", ",")} <span className="text-xs text-neutral-500">/{item.unit}</span></p>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-3">
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Total de Lotes</p>
                              <p className="mt-1 text-lg font-bold text-blue-400">{item.lotesAtivos} {item.lotesAtivos === 1 ? "lote" : "lotes"}</p>
                            </div>
                          </div>

                          {/* Marcas do insumo */}
                          <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Marcas Cadastradas</p>
                              <button onClick={(e) => { e.stopPropagation(); setInsumoBrandModal(item.id); setNewInsumoBrandId(""); }}
                                className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/25">+ Marca</button>
                            </div>
                            {item.itemBrands.length === 0 ? (
                              <p className="text-xs text-neutral-600">Nenhuma marca vinculada. Adicione marcas pra registrar lotes.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {item.itemBrands.map((sb) => {
                                  const brandName = getBrandNameById(sb.brandId);
                                  const brandQty = calcularQtyTotal(batches, item.id, sb.brandId);
                                  const brandAvg = obterPrecoMedioInsumo(batches, item.id, item.precoCustoInicial, sb.brandId);
                                  const brandLotes = calcularLotesAtivos(batches, item.id, sb.brandId);
                                  return (
                                    <div key={sb.id} className="flex items-center gap-2 rounded-lg bg-neutral-900/60 px-3 py-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleQuickConsumeBrand(item.id, sb.brandId); }}
                                        disabled={brandQty <= 0}
                                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-sm font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                        title={`Remover 1 ${item.unit} de ${brandName}`}
                                      >−</button>
                                      <span className="min-w-[3ch] text-sm font-bold text-white">{formatQty(brandQty, item.unit)}</span>
                                      <span className="text-xs text-neutral-500">{item.unit}</span>
                                      <span className="text-xs text-amber-400 font-semibold">R$ {brandAvg.toFixed(3).replace(".", ",")}/{item.unit}</span>
                                      <span className="text-[9px] text-neutral-600">{brandLotes} {brandLotes === 1 ? "lote" : "lotes"}</span>
                                      <span className="rounded-full bg-wine-500/15 px-2 py-0.5 text-[10px] font-bold text-wine-400">{brandName}</span>
                                      <div className="ml-auto flex items-center gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); openBatchEntry(item.id, sb.brandId); }}
                                          className="rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/25">+Entrada</button>
                                        <button onClick={(e) => { e.stopPropagation(); setHistoryInsumoId(item.id); setHistoryBrandId(sb.brandId); }}
                                          className="rounded-md bg-blue-500/15 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/25">Lotes</button>
                                        <button onClick={(e) => { e.stopPropagation(); removeBrandFromInsumo(sb.id); }}
                                          className="rounded-md bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/25">X</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Acoes */}
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleQuickConsume(item.id); }}
                                disabled={item.qty <= 0}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-lg font-bold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                              >−</button>
                              <span className="min-w-[4ch] text-center text-lg font-bold text-white">{formatQty(item.qty, item.unit)}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); openBatchEntry(item.id); }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-lg font-bold text-emerald-400 transition-all hover:bg-emerald-500/20"
                              >+</button>
                            </div>

                            <div className="h-6 w-px bg-neutral-800" />

                            <button onClick={(e) => { e.stopPropagation(); setHistoryInsumoId(item.id); setHistoryBrandId(null); }}
                              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 transition-all hover:bg-blue-500/20">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                              Historico Geral
                            </button>

                            <button onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-400 transition-all hover:bg-neutral-700 hover:text-white">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              Editar
                            </button>

                            <button onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              Excluir
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {stockComPreco.length === 0 && <div className="py-12 text-center text-neutral-500"><p className="text-lg font-semibold">Nenhum insumo encontrado.</p><p className="mt-1 text-sm text-neutral-600">Tente alterar os filtros ou buscar por outro nome.</p></div>}
      </div>

      {/* ═══════ CREATE/EDIT INSUMO MODAL ═══════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-5 text-lg font-bold text-white">{editingId ? "Editar Insumo" : "Cadastrar Novo Insumo"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome do Insumo</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: Leite Condensado 395g" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                    <option>Uso Interno</option>
                    <option>Embalagens</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Unidade</label>
                  <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                    {ALL_STOCK_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Minimo (Alerta)</label>
                <input type="number" step={getStep(form.unit)} min="0" required value={form.min || ""} onChange={(e) => setForm({ ...form, min: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Preco Custo Inicial (R$ / {form.unit})</label>
                <input type="number" step="0.001" min="0" value={form.precoCustoInicial || ""} onChange={(e) => setForm({ ...form, precoCustoInicial: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="0.000" />
                <p className="mt-1 text-[10px] text-neutral-600">Usado como preco medio quando nao ha entradas registradas.</p>
              </div>
              <p className="text-[10px] text-neutral-600">Adicione marcas ao insumo apos o cadastro. O custo unitario e a media simples das 5 ultimas entradas (inclusive com estoque zerado, para a precificacao).</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button type="submit" className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 hover:bg-wine-600">{editingId ? "Salvar" : "Cadastrar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ DELETE CONFIRMATION ═══════ */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Excluir insumo e todos os lotes?</h3>
              <p className="mt-2 text-sm text-neutral-400">Esta acao nao pode ser desfeita.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={() => handleDelete(deleteId)} className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ BATCH ENTRY MODAL ═══════ */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setBatchModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Nova Entrada de Estoque</h2>
                <p className="text-[10px] text-neutral-500">Registra um novo lote com preco e quantidade</p>
              </div>
              <span className="text-2xl">📦</span>
            </div>
            <form onSubmit={handleBatchSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Insumo <span className="text-red-500">*</span></label>
                <select required value={batchInsumoId} onChange={(e) => { setBatchInsumoId(e.target.value); setBatchBrandId(""); }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                  <option value="">Selecione o insumo...</option>
                  {items.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                  ))}
                </select>
              </div>
              {batchInsumoId && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Marca</label>
                  <select value={batchBrandId} onChange={(e) => setBatchBrandId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500">
                    <option value="">Sem Marca</option>
                    {batchInsumoBrands.map((sb) => {
                      const bName = getBrandNameById(sb.brandId);
                      return <option key={sb.id} value={sb.brandId}>{bName}</option>;
                    })}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Quantidade <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="number" step={batchInsumoId ? getStep(items.find((s) => s.id === batchInsumoId)?.unit || "un") : "0.001"} min="0" required value={batchForm.qtd} onChange={(e) => setBatchForm((f) => ({ ...f, qtd: e.target.value }))}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 pr-12 text-sm text-white outline-none focus:border-emerald-500" placeholder="0" />
                    {batchInsumoId && (() => {
                      const insumo = items.find((s) => s.id === batchInsumoId);
                      return insumo ? (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{insumo.unit}</span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Preco Unitario (R$) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.001" min="0.001" required value={batchForm.preco} onChange={(e) => setBatchForm((f) => ({ ...f, preco: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500" placeholder="0.000" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Data de Validade</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBatchForm((f) => ({ ...f, temValidade: false, validade: "" }))}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${!batchForm.temValidade ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-white"}`}>
                    Sem validade
                  </button>
                  <button type="button" onClick={() => setBatchForm((f) => ({ ...f, temValidade: true }))}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${batchForm.temValidade ? "border-amber-500/50 bg-amber-500/15 text-amber-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:text-white"}`}>
                    Com validade
                  </button>
                </div>
                {batchForm.temValidade && (
                  <input type="date" value={batchForm.validade} onChange={(e) => setBatchForm((f) => ({ ...f, validade: e.target.value }))}
                    className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" />
                )}
                <p className="mt-1 text-[10px] text-neutral-600">{batchForm.temValidade ? "O consumo PEPS sera pela data de validade." : "O consumo PEPS sera pela data de entrada (mais antigo primeiro)."}</p>
              </div>
              {batchInsumoId && batchBrandId && (() => {
                const insumo = items.find((s) => s.id === batchInsumoId);
                const unit = insumo?.unit || "un";
                const generalQty = calcularQtyTotal(batches, batchInsumoId);
                const generalAvg = obterPrecoMedioInsumo(batches, batchInsumoId, insumo?.precoCustoInicial);
                const newQtd = parseFloat(batchForm.qtd) || 0;
                const newPreco = parseFloat(batchForm.preco) || 0;
                const podeSimular = newQtd > 0 && newPreco > 0;
                const newGeneralAvg = podeSimular
                  ? obterPrecoMedioInsumo(
                      [
                        ...batches,
                        {
                          id: "sim",
                          insumoId: batchInsumoId,
                          brandId: batchBrandId,
                          dataEntrada: new Date().toISOString().slice(0, 10),
                          quantidadeInicial: newQtd,
                          quantidadeRestante: newQtd,
                          precoUnitario: newPreco,
                        },
                      ],
                      batchInsumoId,
                      insumo?.precoCustoInicial
                    )
                  : generalAvg;
                return (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Projecao PEPS (media geral entre todas as marcas)</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Estoque atual (todas marcas)</span>
                      <span className="text-white">{generalQty} {unit} ({generalAvg.toFixed(3).replace(".", ",")}/{unit})</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Nova entrada</span>
                      <span className="text-emerald-400">+{newQtd} {unit} ({newPreco.toFixed(3).replace(".", ",")}/{unit})</span>
                    </div>
                    <div className="border-t border-emerald-500/20 pt-1 flex justify-between text-xs font-bold">
                      <span className="text-white">Novo preco medio geral</span>
                      <span className="text-amber-400">R$ {newGeneralAvg.toFixed(3).replace(".", ",")}</span>
                    </div>
                  </div>
                );
              })()}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setBatchModalOpen(false)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button type="submit" disabled={!batchInsumoId} className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed">Registrar Entrada</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ BATCH HISTORY MODAL ═══════ */}
      {historyInsumoId && historicoInsumo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setHistoryInsumoId(null); setHistoryBrandId(null); }}>
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">{historicoInsumo.name}</h2>
                <p className="text-xs text-neutral-500">
                  {historyBrandId
                    ? `Lotes da marca: ${getBrandNameById(historyBrandId)}`
                    : "Historico de Todos os Lotes (Todas as Marcas)"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    {historyBrandId ? "Preco Medio (Marca)" : "Preco Medio Geral"}
                  </p>
                  <p className="text-lg font-bold text-amber-400">
                    R$ {obterPrecoMedioInsumo(batches, historyInsumoId, historicoInsumo.precoCustoInicial, historyBrandId ?? undefined).toFixed(3).replace(".", ",")}
                  </p>
                </div>
                <button onClick={() => { setHistoryInsumoId(null); setHistoryBrandId(null); }} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-neutral-800 px-6 py-3">
              <div className="rounded-lg bg-neutral-800/50 p-2 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Qtd Total</p>
                <p className="text-sm font-bold text-white">{formatQty(calcularQtyTotal(batches, historyInsumoId, historyBrandId ?? undefined), historicoInsumo.unit)} {historicoInsumo.unit}</p>
              </div>
              <div className="rounded-lg bg-neutral-800/50 p-2 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Lotes Ativos</p>
                <p className="text-sm font-bold text-blue-400">{calcularLotesAtivos(batches, historyInsumoId, historyBrandId ?? undefined)}</p>
              </div>
              <div className="rounded-lg bg-neutral-800/50 p-2 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Valor Total</p>
                <p className="text-sm font-bold text-amber-400">R$ {batches.filter((b) => b.insumoId === historyInsumoId && b.quantidadeRestante > 0 && (historyBrandId ? b.brandId === historyBrandId : true)).reduce((s, b) => s + b.quantidadeRestante * b.precoUnitario, 0).toFixed(2).replace(".", ",")}</p>
              </div>
            </div>

            {/* Brand tabs */}
            {getBrandsForInsumo(historyInsumoId).length > 1 && (
              <div className="flex gap-2 border-b border-neutral-800 px-6 py-2">
                <button onClick={() => setHistoryBrandId(null)}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold transition-all ${!historyBrandId ? "bg-amber-500 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                  Todas
                </button>
                {getBrandsForInsumo(historyInsumoId).map((sb) => {
                  const bName = getBrandNameById(sb.brandId);
                  return (
                    <button key={sb.id} onClick={() => setHistoryBrandId(sb.brandId)}
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold transition-all ${historyBrandId === sb.brandId ? "bg-amber-500 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}>
                      {bName}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {historicoLotes.length === 0 ? (
                <p className="text-center text-neutral-500 py-8">Nenhum lote registrado.</p>
              ) : (
                <div className="space-y-2">
                  {historicoLotes.map((lote) => {
                    const isExpired = lote.dataValidade && lote.dataValidade < new Date().toISOString().slice(0, 10);
                    const isDepleted = lote.quantidadeRestante === 0;
                    const pctUsado = lote.quantidadeInicial > 0 ? ((lote.quantidadeInicial - lote.quantidadeRestante) / lote.quantidadeInicial) * 100 : 0;
                    const brandName = getBrandNameById(lote.brandId);
                    return (
                      <div key={lote.id} className={classNames(
                        "rounded-lg border p-3 transition-all",
                        isDepleted ? "border-neutral-800 bg-neutral-900/50 opacity-50" : isExpired ? "border-red-500/30 bg-red-500/5" : "border-neutral-800 bg-neutral-800/50"
                      )}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={classNames("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                              isDepleted ? "bg-neutral-800 text-neutral-600" : isExpired ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                            )}>
                              {isDepleted ? "Z" : "At"}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                {brandName && <span className="rounded-full bg-wine-500/15 px-2 py-0.5 text-[9px] font-bold text-wine-400">{brandName}</span>}
                                <span className="text-sm font-semibold text-white">Entrada: {new Date(lote.dataEntrada + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                                {isExpired && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[8px] font-bold text-red-400">VENCIDO</span>}
                                {isDepleted && <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[8px] font-bold text-neutral-500">ESGOTADO</span>}
                              </div>
                              {lote.dataValidade && (
                                <p className="text-[10px] text-neutral-600">Validade: {new Date(lote.dataValidade + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-neutral-400">
                              {lote.quantidadeRestante}/{lote.quantidadeInicial}
                            </p>
                            <p className="text-sm font-bold text-amber-400">R$ {lote.precoUnitario.toFixed(3).replace(".", ",")}/{historicoInsumo.unit}</p>
                          </div>
                        </div>
                        {!isDepleted && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[9px] text-neutral-600 mb-0.5">
                              <span>Saldo: {lote.quantidadeRestante} {historicoInsumo.unit}</span>
                              <span>{pctUsado.toFixed(0)}% consumido</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                              <div className={classNames("h-full rounded-full transition-all", pctUsado > 80 ? "bg-red-500" : pctUsado > 50 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pctUsado}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-neutral-800 px-6 py-3 flex justify-end">
              <button onClick={() => { setHistoryInsumoId(null); setHistoryBrandId(null); }} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD BRAND TO INSUMO MODAL ═══════ */}
      {insumoBrandModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setInsumoBrandModal(null); setInlineBrandName(""); setNewInsumoBrandId(""); }}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-white">Adicionar Marca</h2>
            <p className="mb-4 text-xs text-neutral-500">Vincule uma marca existente ou crie uma nova.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Marca Existente</label>
                <select value={newInsumoBrandId} onChange={(e) => { setNewInsumoBrandId(e.target.value); setInlineBrandName(""); }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500">
                  <option value="">Selecione...</option>
                  {activeBrands.filter((b) => !stockBrands.some((sb) => sb.stockItemId === insumoBrandModal && sb.brandId === b.id)).map((b) => (
                    <option key={b.id} value={b.id}>{b.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-neutral-800" />
                <span className="text-[10px] text-neutral-600">ou</span>
                <div className="h-px flex-1 bg-neutral-800" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nova Marca</label>
                <input type="text" value={inlineBrandName} onChange={(e) => { setInlineBrandName(e.target.value); setNewInsumoBrandId(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBrandToInsumo(); setInsumoBrandModal(null); } }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" placeholder="Ex: Nestlé, Piracanjuba..." />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={() => { setInsumoBrandModal(null); setInlineBrandName(""); setNewInsumoBrandId(""); }}
                className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
              <button onClick={() => { addBrandToInsumo(); setInsumoBrandModal(null); }}
                disabled={!newInsumoBrandId && !inlineBrandName.trim()}
                className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ BRAND MANAGEMENT MODAL ═══════ */}
      {brandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setBrandModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-white">Gerenciar Marcas</h2>
            <p className="mb-4 text-xs text-neutral-500">Cadastre as marcas disponiveis. Depois vincule-as aos insumos.</p>
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-amber-500" placeholder="Buscar marca..." />
            </div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={newBrandName} onChange={(e) => { setNewBrandName(e.target.value); setBrandError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBrand(); } }} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" placeholder="Nova marca..." />
              <button onClick={handleAddBrand} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600">+</button>
            </div>
            {brandError && <p className="mb-2 text-xs text-red-400">{brandError}</p>}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950">
              {filteredBrands.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-500">{brandSearch ? "Nenhuma marca encontrada." : "Nenhuma marca cadastrada."}</div>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {filteredBrands.map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-neutral-900">
                      {editingBrandId === b.id ? (
                        <div className="flex w-full items-center gap-2">
                          <input type="text" value={editBrandName} onChange={(e) => setEditBrandName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleUpdateBrand(b.id); if (e.key === "Escape") { setEditingBrandId(null); setEditBrandName(""); } }} autoFocus className="flex-1 rounded border border-amber-500 bg-neutral-800 px-2 py-1 text-sm text-white outline-none" />
                          <button onClick={() => handleUpdateBrand(b.id)} className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600">Salvar</button>
                          <button onClick={() => { setEditingBrandId(null); setEditBrandName(""); }} className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-600">Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-medium text-white">{b.nome}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${b.status === "Ativa" ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-700 text-neutral-500"}`}>{b.status}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateBrand(b.id, { status: b.status === "Ativa" ? "Inativa" : "Ativa" })} className="rounded-md px-2 py-1 text-[10px] font-semibold hover:bg-neutral-800">{b.status === "Ativa" ? <span className="text-amber-400">Desativar</span> : <span className="text-emerald-400">Ativar</span>}</button>
                            <button onClick={() => { setEditingBrandId(b.id); setEditBrandName(b.nome); setBrandError(""); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/10">Editar</button>
                            <button onClick={() => setDeleteBrandId(b.id)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/10">Excluir</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => { setBrandModalOpen(false); setBrandSearch(""); setBrandError(""); setEditingBrandId(null); }} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE BRAND CONFIRMATION ═══════ */}
      {deleteBrandId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteBrandId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Excluir esta marca?</h3>
              <p className="mt-2 text-sm text-neutral-400">Todos os lotes vinculados a esta marca serao removidos.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setDeleteBrandId(null)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={handleDeleteBrandConfirm} className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
