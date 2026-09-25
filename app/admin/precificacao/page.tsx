"use client";

import { useState, useEffect, useMemo } from "react";
import { useProductStore, useFichaTecnicaStore } from "@/lib/store";
import { classNames } from "@/lib/utils";
import type { FichaTecnicaIngrediente } from "@/types/database";
import { getConsumptionUnits, getStep, converterCustoFicha } from "@/lib/units";
import { obterPrecoMedioInsumo } from "@/lib/precoMedio";
import { BATCH_KEY, SEED_KEY, STOCK_CHANGED_EVENT, STOCK_KEY, loadBatchesData, loadStockData, saveStockData } from "@/lib/stockStorage";
import { SEED_STOCK } from "@/lib/seedData";

interface StockItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  min: number;
  unit: string;
  custoUnitario: number;
  precoCustoInicial?: number;
}

interface Batch {
  id: string;
  insumoId: string;
  dataEntrada: string;
  quantidadeInicial: number;
  quantidadeRestante: number;
  precoUnitario: number;
  dataValidade?: string;
}

function seedStockIfEmpty() {
  if (typeof window === "undefined") return;
  try {
    const alreadySeeded = localStorage.getItem(SEED_KEY);
    if (alreadySeeded) return;
    const existing = loadStockData<any[]>();
    if (existing) return;
    saveStockData(SEED_STOCK);
  } catch {}
}

function loadStock(): StockItem[] {
  if (typeof window === "undefined") return SEED_STOCK.map((item) => ({ ...item, qty: 0, custoUnitario: 0 }));
  const parsed = loadStockData<any[]>();
  if (parsed) {
    return parsed.map((item) => ({
      ...item,
      custoUnitario: 0,
    }));
  }
  return SEED_STOCK.map((item) => ({ ...item, qty: 0, custoUnitario: 0 }));
}

function loadBatches(): Batch[] {
  return loadBatchesData<Batch>();
}

function withPrecosMedios(items: StockItem[], batchList: Batch[]): StockItem[] {
  return items.map((item) => ({
    ...item,
    custoUnitario: obterPrecoMedioInsumo(batchList, item.id, item.precoCustoInicial),
  }));
}

function recalcularIngredientesComEstoque(
  lista: FichaTecnicaIngrediente[],
  stock: StockItem[]
): FichaTecnicaIngrediente[] {
  return lista.map((ing) => {
    const insumo = stock.find((s) => s.id === ing.insumoId);
    if (!insumo || !ing.quantidade) return ing;
    const custoUnit = insumo.custoUnitario ?? 0;
    const custoCalculado = converterCustoFicha(ing.quantidade, ing.unidade, custoUnit, insumo.unit);
    return { ...ing, custoUnitario: custoCalculado / ing.quantidade };
  });
}

const UNIDADES_RECEITA = [
  { value: "g", label: "Gramas (g)" },
  { value: "kg", label: "Quilogramas (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "L", label: "Litros (L)" },
  { value: "un", label: "Unidade (un)" },
  { value: "lata", label: "Lata(s)" },
  { value: "caixa", label: "Caixa(s)" },
  { value: "xicara", label: "Xicara (240ml)" },
  { value: "colher_sopa", label: "Colher de Sopa (15ml)" },
  { value: "colher_cha", label: "Colher de Cha (5ml)" },
  { value: "pitada", label: "Pitada" },
];

const UNIDADES_RENDIMENTO = [
  { value: "un", label: "Unidade" },
  { value: "kg", label: "KG" },
  { value: "fatia", label: "Fatia" },
  { value: "porcao", label: "Porcao" },
];

export default function AdminPrecificacao() {
  const products = useProductStore((s) => s.products);
  const updateProduct = useProductStore((s) => s.updateProduct);
  const { fichas, addFicha, updateFicha, getFichaByProduct } = useFichaTecnicaStore();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [ingredienteModal, setIngredienteModal] = useState(false);

  // Configuracoes
  const [custoInvisivelPct, setCustoInvisivelPct] = useState(15);
  const [minutosProducao, setMinutosProducao] = useState(30);
  const [salarioMensal, setSalarioMensal] = useState(2500);
  const [margemLucroPct, setMargemLucroPct] = useState(50);
  const [rendimento, setRendimento] = useState(1);
  const [unidadeRendimento, setUnidadeRendimento] = useState("un");

  // Ingredientes
  const [ingredientes, setIngredientes] = useState<FichaTecnicaIngrediente[]>([]);

  // Ingrediente form
  const [ingInsumoId, setIngInsumoId] = useState("");
  const [ingQtd, setIngQtd] = useState("");
  const [ingUnidade, setIngUnidade] = useState("g");

  function handleInsumoChange(id: string) {
    setIngInsumoId(id);
    if (!id) {
      setIngUnidade("g");
      return;
    }
    const insumo = stockItems.find((s) => s.id === id);
    if (!insumo) return;
    const consumptionUnits = getConsumptionUnits(insumo.unit);
    const preferred = consumptionUnits.find((u) => u.value === insumo.unit) ?? consumptionUnits[0];
    setIngUnidade(preferred.value);
  }

  function openIngredienteModal() {
    setIngInsumoId("");
    setIngQtd("");
    setIngUnidade("g");
    setIngredienteModal(true);
  }

  // Dynamic consumption units based on selected insumo
  const availableConsumptionUnits = useMemo(() => {
    if (!ingInsumoId) return UNIDADES_RECEITA;
    const insumo = stockItems.find((s) => s.id === ingInsumoId);
    if (!insumo) return UNIDADES_RECEITA;
    const consumptionUnits = getConsumptionUnits(insumo.unit);
    const ordered = [
      ...consumptionUnits.filter((u) => u.value === insumo.unit),
      ...consumptionUnits.filter((u) => u.value !== insumo.unit),
    ];
    return [...ordered, ...UNIDADES_RECEITA.filter((u) => !ordered.some((c) => c.value === u.value))];
  }, [ingInsumoId, stockItems]);

  const ingStep = useMemo(() => {
    if (!ingInsumoId) return "0.001";
    const insumo = stockItems.find((s) => s.id === ingInsumoId);
    if (!insumo) return "0.001";
    const consumptionUnits = getConsumptionUnits(insumo.unit);
    const found = consumptionUnits.find((u) => u.value === ingUnidade);
    return found?.step || "0.001";
  }, [ingInsumoId, ingUnidade, stockItems]);

  // Edit ingrediente
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editUnidade, setEditUnidade] = useState("");

  // Modal de confirmacao de preco
  const [showPrecoModal, setShowPrecoModal] = useState(false);
  const [precoParaAplicar, setPrecoParaAplicar] = useState("");

  // Dynamic units for edit mode
  const editConsumptionUnits = useMemo(() => {
    if (editIdx === null) return UNIDADES_RECEITA;
    const ing = ingredientes[editIdx];
    if (!ing) return UNIDADES_RECEITA;
    const insumo = stockItems.find((s) => s.id === ing.insumoId);
    if (!insumo) return UNIDADES_RECEITA;
    const consumptionUnits = getConsumptionUnits(insumo.unit);
    const ordered = [
      ...consumptionUnits.filter((u) => u.value === insumo.unit),
      ...consumptionUnits.filter((u) => u.value !== insumo.unit),
    ];
    return [...ordered, ...UNIDADES_RECEITA.filter((u) => !ordered.some((c) => c.value === u.value))];
  }, [editIdx, ingredientes, stockItems]);

  const editStep = useMemo(() => {
    if (editIdx === null) return "0.001";
    const ing = ingredientes[editIdx];
    if (!ing) return "0.001";
    const insumo = stockItems.find((s) => s.id === ing.insumoId);
    if (!insumo) return "0.001";
    const consumptionUnits = getConsumptionUnits(insumo.unit);
    const found = consumptionUnits.find((u) => u.value === editUnidade);
    return found?.step || "0.001";
  }, [editIdx, editUnidade, ingredientes, stockItems]);

  useEffect(() => {
    seedStockIfEmpty();

    function refreshStock() {
      const freshBatches = loadBatches();
      const withPrices = withPrecosMedios(loadStock(), freshBatches);
      setBatches(freshBatches);
      setStockItems(withPrices);
    }

    refreshStock();

    function handleFocus() {
      refreshStock();
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === STOCK_KEY || e.key === BATCH_KEY) refreshStock();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(STOCK_CHANGED_EVENT, refreshStock);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(STOCK_CHANGED_EVENT, refreshStock);
    };
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Preço vindo do cadastro/cardápio (reativo: products muda → selectedProduct muda → precoCardapio muda)
  const precoCardapio = selectedProduct?.price ?? 0;

  const existingFicha = selectedProductId ? getFichaByProduct(selectedProductId) : undefined;

  useEffect(() => {
    if (existingFicha) {
      const recalculados = recalcularIngredientesComEstoque(existingFicha.ingredientes, stockItems);
      setIngredientes(recalculados);
      setCustoInvisivelPct(existingFicha.custoInvisivelPct);
      setMaoDeObraMin_fromFicha(existingFicha);
      setMargemLucroPct(existingFicha.margemLucroPct);
      setRendimento(existingFicha.rendimento || 1);
      setUnidadeRendimento(existingFicha.unidadeRendimento || "un");
    } else if (selectedProductId) {
      setIngredientes([]);
      setCustoInvisivelPct(15);
      setMinutosProducao(30);
      setSalarioMensal(2500);
      setMargemLucroPct(50);
      setRendimento(1);
      setUnidadeRendimento("un");
    }
  }, [selectedProductId, existingFicha]);

  useEffect(() => {
    if (stockItems.length === 0) return;
    setIngredientes((prev) => recalcularIngredientesComEstoque(prev, stockItems));
  }, [stockItems]);

  function setMaoDeObraMin_fromFicha(ficha: any) {
    setMinutosProducao(ficha.maoDeObraMin || 30);
    setSalarioMensal(ficha.maoDeObraValorHora * 160);
  }

  // ═══════ FORMULA DE PRECIFICACAO ═══════

  // CI - Custo de Ingredientes
  const custoIngredientes = useMemo(() => {
    return ingredientes.reduce((s, ing) => s + ing.quantidade * (ing.custoUnitario ?? 0), 0);
  }, [ingredientes]);

  // Custos Invisiveis = CI * %
  const custosInvisiveis = custoIngredientes * (custoInvisivelPct / 100);

  // MO = Tempo (min) * (Salario / 9600min)
  const valorMinutoConfeiteiro = salarioMensal / 9600;
  const maoDeObra = minutosProducao * valorMinutoConfeiteiro;

  // CT = CI + Invisiveis + MO
  const custoTotal = custoIngredientes + custosInvisiveis + maoDeObra;

  // PV = CT * (1 + Margem/100)
  const precoVendaSugerido = margemLucroPct < 100 ? custoTotal / (1 - margemLucroPct / 100) : custoTotal * 2;

  // ═══════ REGRA: alerta se preco atual < preco sugerido ═══════
  const diferencaPreco = precoCardapio - precoVendaSugerido;
  const alertaCMV = precoCardapio > 0 && precoCardapio < precoVendaSugerido && custoIngredientes > 0;

  // ═══════ METRICAS DERIVADAS - CENARIO ATUAL ═══════
  const lucroAtual = precoCardapio - custoIngredientes;
  const retornoCIAtual = custoIngredientes > 0 ? (lucroAtual / custoIngredientes) * 100 : 0;
  const margemVendaAtual = precoCardapio > 0 ? (lucroAtual / precoCardapio) * 100 : 0;

  // ═══════ METRICAS DERIVADAS - CENARIO SUGERIDO ═══════
  const lucroSugerido = precoVendaSugerido - custoIngredientes;
  const retornoCISugerido = custoIngredientes > 0 ? (lucroSugerido / custoIngredientes) * 100 : 0;
  const margemVendaSugerida = precoVendaSugerido > 0 ? (lucroSugerido / precoVendaSugerido) * 100 : 0;

  // Lucro Liquido
  const lucroLiquido = precoVendaSugerido - custoTotal;
  const lucroLiquidoPct = precoVendaSugerido > 0 ? (lucroLiquido / precoVendaSugerido) * 100 : 0;

  // Custo por unidade de rendimento
  const custoPorUnidade = rendimento > 0 ? custoTotal / rendimento : custoTotal;
  const precoPorUnidade = rendimento > 0 ? precoVendaSugerido / rendimento : precoVendaSugerido;
  const lucroPorUnidade = rendimento > 0 ? lucroLiquido / rendimento : lucroLiquido;

  // ═══════ METRICAS AUXILIARES ═══════

  const productIdsWithFicha = useMemo(() => {
    return new Set(fichas.map((f) => f.productId));
  }, [fichas]);

  const availableInsumos = stockItems.filter((s) => s.category === "Uso Interno");

  function addIngrediente() {
    if (!ingInsumoId || !ingQtd) return;
    const insumo = stockItems.find((s) => s.id === ingInsumoId);
    if (!insumo) return;

    const qtd = parseFloat(ingQtd);
    const custoUnit = insumo.custoUnitario ?? 0;
    const custoCalculado = converterCustoFicha(qtd, ingUnidade, custoUnit, insumo.unit);

    const newIng: FichaTecnicaIngrediente = {
      insumoId: insumo.id,
      nome: insumo.name,
      quantidade: qtd,
      unidade: ingUnidade,
      custoUnitario: custoCalculado / qtd,
    };

    setIngredientes((prev) => [...prev, newIng]);
    setIngInsumoId("");
    setIngQtd("");
    setIngUnidade("g");
    setIngredienteModal(false);
  }

  function startEditIng(idx: number) {
    setEditIdx(idx);
    setEditQtd(String(ingredientes[idx].quantidade));
    setEditUnidade(ingredientes[idx].unidade);
  }

  function saveEditIng() {
    if (editIdx === null || !editQtd) return;
    const ing = ingredientes[editIdx];
    const insumo = stockItems.find((s) => s.id === ing.insumoId);
    const qtd = parseFloat(editQtd);
    if (!insumo || isNaN(qtd) || qtd <= 0) return;

    const custoUnit = insumo.custoUnitario ?? 0;
    const custoCalculado = converterCustoFicha(qtd, editUnidade, custoUnit, insumo.unit);

    setIngredientes((prev) => prev.map((item, i) =>
      i === editIdx
        ? { ...item, quantidade: qtd, unidade: editUnidade, custoUnitario: custoCalculado / qtd }
        : item
    ));
    setEditIdx(null);
    setEditQtd("");
    setEditUnidade("");
  }

  function cancelEditIng() {
    setEditIdx(null);
    setEditQtd("");
    setEditUnidade("");
  }

  function removeIngrediente(idx: number) {
    setIngredientes((prev) => prev.filter((_, i) => i !== idx));
  }

  function recalcularCustos() {
    setIngredientes((prev) => recalcularIngredientesComEstoque(prev, stockItems));
  }

  function handleSave() {
    if (!selectedProductId) return;

    const fichaData = {
      productId: selectedProductId,
      productName: selectedProduct?.name || "",
      ingredientes,
      custoInvisivelPct,
      maoDeObraMin: minutosProducao,
      maoDeObraValorHora: valorMinutoConfeiteiro,
      margemLucroPct,
      rendimento,
      unidadeRendimento,
    };

    if (existingFicha) {
      updateFicha(existingFicha.id, fichaData);
    } else {
      addFicha(fichaData);
    }
  }

  function handleAplicarPreco() {
    if (!selectedProductId) return;
    setPrecoParaAplicar(precoVendaSugerido.toFixed(2).replace(".", ","));
    setShowPrecoModal(true);
  }

  function confirmarAplicarPreco() {
    if (!selectedProductId) return;
    const valor = parseFloat(precoParaAplicar.replace(",", "."));
    if (isNaN(valor) || valor <= 0) return;
    const precoFinal = Math.ceil(valor * 100) / 100;
    updateProduct(selectedProductId, { price: precoFinal });
    setShowPrecoModal(false);
  }

  const unLabel = unidadeRendimento === "kg" ? "KG" : unidadeRendimento === "fatia" ? "Fatia" : unidadeRendimento === "porcao" ? "Porcao" : "Un";

  return (
    <div className="space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div>
        <h1 className="text-2xl font-bold text-white">Precificacao & Ficha Tecnica</h1>
        <p className="mt-1 text-sm text-neutral-400">Calcule o preco ideal com base nos custos reais da receita</p>
      </div>

      {/* ═══════ SELECTOR ═══════ */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-3 text-sm font-semibold text-white">Selecionar Produto</h3>
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
        >
          <option value="">Selecione um produto do cardapio...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {productIdsWithFicha.has(p.id) ? "✓ Ficha Cadastrada" : ""}
            </option>
          ))}
        </select>

        {selectedProduct && (
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="rounded-lg bg-neutral-800/50 px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Preco Atual no Cardapio</p>
              <p className="text-lg font-bold text-wine-400">R$ {selectedProduct.price.toFixed(2).replace(".", ",")}</p>
            </div>
            {existingFicha && (
              <>
                <div className="rounded-lg bg-amber-500/10 px-4 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Preco Sugerido (Ficha)</p>
                  <p className="text-lg font-bold text-amber-400">R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}</p>
                </div>
                {custoIngredientes > 0 && (() => {
                  const diff = selectedProduct.price - precoVendaSugerido;
                  const isBelow = diff < 0;
                  return (
                    <div className={`rounded-lg px-4 py-2 ${isBelow ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isBelow ? "text-red-500" : "text-emerald-500"}`}>
                        {isBelow ? "Abaixo do Sugerido" : "Acima do Sugerido"}
                      </p>
                      <p className={`text-lg font-bold ${isBelow ? "text-red-400" : "text-emerald-400"}`}>
                        {isBelow ? "" : "+"} R$ {Math.abs(diff).toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {selectedProductId && (
        <>
          {/* ═══════ ALERTA ═══════ */}
          {alertaCMV && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-sm font-bold text-red-400">Alerta: Preco abaixo do sugerido</p>
                <p className="text-xs text-red-400/80">
                  O preco atual no cardapio (R$ {precoCardapio.toFixed(2).replace(".", ",")}) esta R$ {Math.abs(diferencaPreco).toFixed(2).replace(".", ",")} abaixo do preco sugerido (R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}) para a margem desejada.
                </p>
              </div>
            </div>
          )}

          {/* ═══════ KPI CARDS ═══════ */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Custo Total */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70">Custo Total Producao</p>
              <p className="mt-2 text-3xl font-bold text-red-400">R$ {custoTotal.toFixed(2).replace(".", ",")}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                CI + Invisiveis + Mao de Obra
              </p>
            </div>

            {/* Custo/{un} */}
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/70">Custo por {unLabel}</p>
              <p className="mt-2 text-3xl font-bold text-orange-400">R$ {custoPorUnidade.toFixed(2).replace(".", ",")}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                {rendimento} {unLabel.toLowerCase()}s produzidos
              </p>
            </div>

            {/* Lucro Liquido */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Lucro Liquido</p>
              <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {lucroLiquido.toFixed(2).replace(".", ",")}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                {lucroLiquidoPct.toFixed(1)}% sobre o preco de venda
              </p>
            </div>

            {/* Preco Sugerido */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Preco de Venda Sugerido</p>
              <p className="mt-2 text-3xl font-bold text-amber-400">R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                Margem: {margemLucroPct}%
              </p>
            </div>
          </div>

          {/* ═══════ COMPARATIVO DE LUCRATIVIDADE ═══════ */}
          {custoIngredientes > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
              <h3 className="mb-4 text-sm font-semibold text-white">Comparativo de Lucratividade</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Cenario Atual */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    Cenario Atual (Cardapio)
                  </p>
                  <p className="mt-1 text-lg font-bold text-wine-400">
                    R$ {precoCardapio.toFixed(2).replace(".", ",")}
                  </p>
                  <div className="mt-3 space-y-2 border-t border-neutral-700 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Custo de Ingredientes (CI)</span>
                      <span className="text-red-400">- R$ {custoIngredientes.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-neutral-300">Lucro em Reais</span>
                      <span className={lucroAtual >= 0 ? "text-emerald-400" : "text-red-400"}>
                        R$ {lucroAtual.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Retorno s/ Ingredientes</span>
                      <span className="text-emerald-400 font-semibold">
                        +{retornoCIAtual.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Margem s/ Venda</span>
                      <span className={margemVendaAtual >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {margemVendaAtual.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cenario Sugerido */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                    Cenario Sugerido (Ficha Tecnica)
                  </p>
                  <p className="mt-1 text-lg font-bold text-amber-400">
                    R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}
                  </p>
                  <div className="mt-3 space-y-2 border-t border-amber-500/20 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Custo de Ingredientes (CI)</span>
                      <span className="text-red-400">- R$ {custoIngredientes.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-neutral-300">Lucro em Reais</span>
                      <span className={lucroSugerido >= 0 ? "text-emerald-400" : "text-red-400"}>
                        R$ {lucroSugerido.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Retorno s/ Ingredientes</span>
                      <span className="text-emerald-400 font-semibold">
                        +{retornoCISugerido.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Margem s/ Venda</span>
                      <span className={margemVendaSugerida >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {margemVendaSugerida.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diferenca de lucro */}
              {precoCardapio > 0 && (
                <div className={`mt-4 rounded-lg p-3 flex items-center justify-between ${precoVendaSugerido > precoCardapio ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-neutral-800/50 border border-neutral-800"}`}>
                  <span className="text-xs text-neutral-400">Diferenca de lucro (Sugerido vs Atual)</span>
                  <span className={`text-sm font-bold ${precoVendaSugerido - precoCardapio > 0 ? "text-emerald-400" : "text-neutral-400"}`}>
                    {precoVendaSugerido - precoCardapio > 0 ? "+" : ""} R$ {(precoVendaSugerido - precoCardapio).toFixed(2).replace(".", ",")}
                    {precoVendaSugerido > precoCardapio && (
                      <span className="ml-2 text-[10px] font-normal text-emerald-400/70">
                        voce esta deixando de ganhar isso
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* ═══════ LEFT: INGREDIENTES ═══════ */}
            <div className="lg:col-span-2 space-y-6">
              {/* Ingredientes */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Custo de Ingredientes (CI)</h3>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Adicione os insumos exatos da receita</p>
                  </div>
                  <button
                    onClick={openIngredienteModal}
                    className="rounded-lg bg-wine-500/15 px-3 py-1.5 text-xs font-semibold text-wine-400 hover:bg-wine-500/25"
                  >
                    + Adicionar Insumo
                  </button>
                  {ingredientes.length > 0 && (
                    <button
                      onClick={recalcularCustos}
                      className="rounded-lg bg-neutral-700/50 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-700"
                    >
                      Recalcular Custos
                    </button>
                  )}
                </div>

                {ingredientes.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-neutral-500">Nenhum ingrediente adicionado.</p>
                    <p className="text-xs text-neutral-600 mt-1">Clique em &quot;Adicionar Insumo&quot; para comecar</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ingredientes.map((ing, idx) => {
                      const custoTotalIng = ing.quantidade * (ing.custoUnitario ?? 0);
                      const isEditing = editIdx === idx;
                      return (
                        <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-800/50 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{ing.nome}</p>
                              {!isEditing && (
                                <p className="text-xs text-neutral-500">
                                  {ing.quantidade} {ing.unidade} × R$ {(ing.custoUnitario ?? 0).toFixed(4).replace(".", ",")} = <span className="text-amber-400 font-semibold">R$ {custoTotalIng.toFixed(2).replace(".", ",")}</span>
                                </p>
                              )}
                              {isEditing && (
                                <div className="mt-1 flex items-center gap-2">
                                  <input type="number" step={editStep} min="0" value={editQtd} onChange={(e) => setEditQtd(e.target.value)}
                                    className="w-24 rounded border border-wine-500 bg-neutral-900 px-2 py-1 text-xs text-white outline-none" autoFocus />
                                  <select value={editUnidade} onChange={(e) => setEditUnidade(e.target.value)}
                                    className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white outline-none">
                                    {editConsumptionUnits.map((u) => (
                                      <option key={u.value} value={u.value}>{u.label}</option>
                                    ))}
                                  </select>
                                  <button onClick={saveEditIng} className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600">OK</button>
                                  <button onClick={cancelEditIng} className="rounded bg-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:bg-neutral-600">X</button>
                                </div>
                              )}
                            </div>
                            {!isEditing && (
                              <>
                                <p className="text-sm font-bold text-amber-400">
                                  R$ {custoTotalIng.toFixed(2).replace(".", ",")}
                                </p>
                                <button onClick={() => startEditIng(idx)}
                                  className="rounded-md bg-wine-500/15 px-2 py-1 text-xs text-wine-400 hover:bg-wine-500/25" title="Editar quantidade">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => removeIngrediente(idx)}
                                  className="rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-400 hover:bg-red-500/25">
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {ingredientes.length > 0 && (
                  <div className="mt-4 border-t border-neutral-800 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-neutral-400">Custo Direto de Ingredientes (CI)</span>
                      <span className="text-lg font-bold text-amber-400">R$ {custoIngredientes.toFixed(2).replace(".", ",")}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Rendimento */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                <h3 className="mb-4 text-sm font-semibold text-white">Rendimento da Receita</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Quantidade Produzida</label>
                    <input type="number" min="1" value={rendimento} onChange={(e) => setRendimento(parseInt(e.target.value) || 1)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Unidade</label>
                    <select value={unidadeRendimento} onChange={(e) => setUnidadeRendimento(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                      {UNIDADES_RENDIMENTO.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {rendimento > 1 && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-neutral-800/50 p-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Custo/{unLabel}</p>
                      <p className="text-lg font-bold text-orange-400">R$ {custoPorUnidade.toFixed(2).replace(".", ",")}</p>
                    </div>
                    <div className="rounded-lg bg-neutral-800/50 p-3 text-center">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Preco/{unLabel}</p>
                      <p className="text-lg font-bold text-amber-400">R$ {precoPorUnidade.toFixed(2).replace(".", ",")}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Breakdown visual */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                <h3 className="mb-4 text-sm font-semibold text-white">Composicao do Custo (Formula)</h3>
                <div className="space-y-3">
                  {/* Barra visual do custo */}
                  <div className="h-6 flex overflow-hidden rounded-lg">
                    {custoTotal > 0 && (
                      <>
                        <div
                          className="bg-amber-500 flex items-center justify-center text-[9px] font-bold text-black"
                          style={{ width: `${(custoIngredientes / custoTotal) * 100}%` }}
                          title={`Ingredientes: R$ ${custoIngredientes.toFixed(2)}`}
                        >
                          {custoIngredientes > 0 && "CI"}
                        </div>
                        <div
                          className="bg-purple-500 flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ width: `${(custosInvisiveis / custoTotal) * 100}%` }}
                          title={`Invisiveis: R$ ${custosInvisiveis.toFixed(2)}`}
                        >
                          {custosInvisiveis > 0 && "INV"}
                        </div>
                        <div
                          className="bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ width: `${(maoDeObra / custoTotal) * 100}%` }}
                          title={`Mao de Obra: R$ ${maoDeObra.toFixed(2)}`}
                        >
                          {maoDeObra > 0 && "MO"}
                        </div>
                        <div
                          className="bg-emerald-500 flex items-center justify-center text-[9px] font-bold text-black"
                          style={{ width: `${(lucroLiquido / precoVendaSugerido) * 100}%` }}
                          title={`Lucro: R$ ${lucroLiquido.toFixed(2)}`}
                        >
                          {lucroLiquido > 0 && "LUCRO"}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Ingredientes</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> Custos Invisiveis</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Mao de Obra</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Lucro</span>
                  </div>

                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-amber-500" />
                        <span className="text-neutral-400">Custo Ingredientes (CI)</span>
                      </div>
                      <span className="font-bold text-amber-400">R$ {custoIngredientes.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-purple-500" />
                        <span className="text-neutral-400">Custos Invisiveis ({custoInvisivelPct}%)</span>
                      </div>
                      <span className="font-bold text-purple-400">R$ {custosInvisiveis.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        <span className="text-neutral-400">Mao de Obra ({minutosProducao}min = {Math.floor(minutosProducao / 60)}h {minutosProducao % 60}min)</span>
                      </div>
                      <span className="font-bold text-blue-400">R$ {maoDeObra.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="border-t border-neutral-800 pt-2 flex justify-between items-center">
                      <span className="text-sm font-semibold text-white">= Custo Total (CT)</span>
                      <span className="text-lg font-bold text-red-400">R$ {custoTotal.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span className="text-neutral-400">Lucro Liquido ({margemLucroPct}% margem)</span>
                      </div>
                      <span className="font-bold text-emerald-400">R$ {lucroLiquido.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="border-t border-amber-500/20 pt-2 flex justify-between items-center">
                      <span className="text-sm font-bold text-white">= Preco de Venda Sugerido</span>
                      <span className="text-xl font-bold text-amber-400">R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════ RIGHT: CONFIG ═══════ */}
            <div className="space-y-6">
              {/* Configuracoes de Custos */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                <h3 className="mb-4 text-sm font-semibold text-white">Configuracoes de Custos</h3>
                <div className="space-y-5">
                  {/* Custos Invisiveis */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      Custos Invisiveis (Gás/Luz/Agua)
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="100" value={custoInvisivelPct} onChange={(e) => setCustoInvisivelPct(parseFloat(e.target.value) || 0)}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                      <span className="text-sm font-bold text-purple-400">%</span>
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-600">Calculado sobre CI: R$ {custosInvisiveis.toFixed(2).replace(".", ",")}</p>
                  </div>

                  {/* Mao de Obra */}
                  <div className="border-t border-neutral-800 pt-4">
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      Mao de Obra (Tempo de Producao)
                    </label>
                    <div>
                      <div className="flex items-center gap-2">
                        <input type="number" step="1" min="0" value={minutosProducao} onChange={(e) => setMinutosProducao(parseInt(e.target.value) || 0)}
                          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" />
                        <span className="text-sm font-bold text-blue-400">min</span>
                      </div>
                      <p className="mt-1 text-[10px] text-neutral-600">
                        {minutosProducao > 0 ? `(${Math.floor(minutosProducao / 60)}h ${minutosProducao % 60}min)` : "(0h 0min)"}
                      </p>
                    </div>
                    <div className="mt-3">
                      <label className="mb-1 block text-[9px] text-neutral-600">Salario Mensal</label>
                      <input type="number" step="100" min="0" value={salarioMensal} onChange={(e) => setSalarioMensal(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" />
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-600">
                      Valor/min: R$ {valorMinutoConfeiteiro.toFixed(4).replace(".", ",")} · Total: R$ {maoDeObra.toFixed(2).replace(".", ",")}
                    </p>
                  </div>

                  {/* Margem de Lucro */}
                  <div className="border-t border-neutral-800 pt-4">
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      Margem de Lucro Desejada
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="500" value={margemLucroPct} onChange={(e) => setMargemLucroPct(parseFloat(e.target.value) || 0)}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500" />
                      <span className="text-sm font-bold text-emerald-400">%</span>
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-600">
                      Lucro estimado: R$ {lucroLiquido.toFixed(2).replace(".", ",")} ({lucroLiquidoPct.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Formula resumo */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
                <h3 className="mb-3 text-sm font-semibold text-white">Formula de Precificacao</h3>
                <div className="space-y-2 text-xs text-neutral-400 font-mono">
                  <p><span className="text-amber-400">CI</span> = {ingredientes.length} insumos</p>
                  <p><span className="text-purple-400">INV</span> = CI × {custoInvisivelPct}% = R$ {custosInvisiveis.toFixed(2)}</p>
                  <p><span className="text-blue-400">MO</span> = {minutosProducao}min × R$ {valorMinutoConfeiteiro.toFixed(4)} = R$ {maoDeObra.toFixed(2)}</p>
                  <p><span className="text-red-400">CT</span> = CI + INV + MO = R$ {custoTotal.toFixed(2)}</p>
                        <p><span className="text-amber-400">PV</span> = CT / (1 - {margemLucroPct}%) = <span className="text-amber-400 font-bold">R$ {precoVendaSugerido.toFixed(2)}</span></p>
                </div>
              </div>

              {/* Botoes */}
              <div className="space-y-3">
                <button onClick={handleSave}
                  disabled={!selectedProductId}
                  className="w-full rounded-lg border-2 border-wine-500/30 bg-wine-500/10 px-4 py-3 text-sm font-bold text-wine-400 transition-all hover:bg-wine-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                  Salvar Ficha Tecnica
                </button>
                <button onClick={handleAplicarPreco}
                  disabled={!selectedProductId || precoVendaSugerido <= 0}
                  className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed">
                  Aplicar Preco no Cardapio
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════ MODAL: ADICIONAR INGREDIENTE ═══════ */}
      {ingredienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIngredienteModal(false)}>
          <div className="w-full max-w-md bg-neutral-900 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
              <h2 className="text-lg font-bold text-white">Adicionar Ingrediente</h2>
              <button onClick={() => setIngredienteModal(false)} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Insumo do Estoque</label>
                <select value={ingInsumoId} onChange={(e) => handleInsumoChange(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                  <option value="">Selecione o insumo...</option>
                  {availableInsumos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (R$ {(s.custoUnitario ?? 0).toFixed(2).replace(".", ",")} / {s.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Quantidade Usada</label>
                  <input type="number" step={ingStep} min="0" value={ingQtd} onChange={(e) => setIngQtd(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: 200" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Unidade</label>
                  <select value={ingUnidade} onChange={(e) => setIngUnidade(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                    {availableConsumptionUnits.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setIngredienteModal(false)}
                  className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">
                  Cancelar
                </button>
                <button onClick={addIngrediente}
                  disabled={!ingInsumoId || !ingQtd}
                  className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-wine-600 disabled:opacity-50">
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: CONFIRMAR PRECO ═══════ */}
      {showPrecoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPrecoModal(false)}>
          <div className="w-full max-w-sm bg-neutral-900 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
              <h2 className="text-lg font-bold text-white">Aplicar Preco no Cardapio</h2>
              <button onClick={() => setShowPrecoModal(false)} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Preco Sugerido (Ficha Tecnica)</label>
                <p className="text-lg font-bold text-amber-400">R$ {precoVendaSugerido.toFixed(2).replace(".", ",")}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Preco para Aplicar no Cardapio</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-neutral-400">R$</span>
                  <input
                    type="text"
                    value={precoParaAplicar}
                    onChange={(e) => setPrecoParaAplicar(e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") confirmarAplicarPreco(); }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-neutral-600">Voce pode ajustar o valor antes de salvar</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPrecoModal(false)}
                  className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">
                  Cancelar
                </button>
                <button onClick={confirmarAplicarPreco}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
