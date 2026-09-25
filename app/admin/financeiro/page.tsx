"use client";

import { useState, useMemo } from "react";
import { useOrderStore, useExpenseStore, useProductStore, useCustomerStore, EXPENSE_CATEGORIES } from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import LaunchDespesaModal from "@/components/admin/LaunchDespesaModal";
import { classNames, getLocalDateStr, getLocalMonthStr, paymentLabelOf } from "@/lib/utils";
import { filterPaidOrders } from "@/lib/faturamento";

type Periodo = "dia" | "mes" | "ano";

const PAGE_SIZE = 15;
const CATEGORIA_BRINDE = "Custos de Brindes / Fidelidade";

const STATUS_COLORS: Record<string, string> = {
  Pago: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Pendente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Em Atraso": "bg-red-500/15 text-red-400 border-red-500/30",
};

const CATEGORIA_COLORS: Record<string, string> = {
  Insumos: "bg-blue-500",
  Fixos: "bg-amber-500",
  Embalacoes: "bg-purple-500",
  Transporte: "bg-cyan-500",
  Equipe: "bg-emerald-500",
  Marketing: "bg-[#8B1D22]",
  "Custos de Brindes / Fidelidade": "bg-red-700",
  Outros: "bg-neutral-500",
};

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function safeMoney(val: any): string {
  const num = Number(val);
  if (isNaN(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

export default function AdminFinanceiro() {
  const orders = useOrderStore((s) => s.orders);
  const expenses = useExpenseStore((s) => s.expenses);
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const customers = useCustomerStore((s) => s.customers);
  const credores = useCredoresStore((s) => s.credores);
  const finTransactions = useFinanceiroStore((s) => s.transactions);

  const { totalFiadoAberto, qtdClientesDevendo } = useMemo(() => {
    let total = 0;
    let clientesDevendo = 0;
    credores.forEach((c) => {
      const devendoCliente = (c.compras || [])
        .filter((comp) => !comp.pago)
        .reduce((acc, comp) => {
          const pendente = comp.valorPendente !== undefined && comp.valorPendente !== null
            ? Number(comp.valorPendente)
            : Number(comp.valor);
          return acc + (isNaN(pendente) ? 0 : pendente);
        }, 0);
      if (devendoCliente > 0) {
        total += devendoCliente;
        clientesDevendo++;
      }
    });
    return { totalFiadoAberto: total, qtdClientesDevendo: clientesDevendo };
  }, [credores]);

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [showDespesaModal, setShowDespesaModal] = useState(false);
  const [filtroCategoriaDesp, setFiltroCategoriaDesp] = useState("Todas");
  const [filtroStatusDesp, setFiltroStatusDesp] = useState("Todos");
  const [pageDespesas, setPageDespesas] = useState(1);
  const [pagePedidos, setPagePedidos] = useState(1);
  const [mesAtual, setMesAtual] = useState(new Date().getMonth());
  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear());

  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const mesAtualStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;

  const ordersMes = useMemo(() => orders.filter((o) => o.createdAt.slice(0, 7) === mesAtualStr), [orders, mesAtualStr]);
  const ordersHoje = useMemo(() => orders.filter((o) => o.createdAt.slice(0, 10) === todayStr), [orders, todayStr]);
  const ordersAno = useMemo(() => orders.filter((o) => o.createdAt.slice(0, 4) === String(anoAtual)), [orders, anoAtual]);

  const getOrdersFiltrados = () => {
    if (periodo === "dia") return ordersHoje;
    if (periodo === "mes") return ordersMes;
    return ordersAno;
  };
  const ordersFiltrados = getOrdersFiltrados();

  const ordersPagosPeriodo = useMemo(() => {
    const prefix = periodo === "dia" ? todayStr : periodo === "mes" ? mesAtualStr : String(anoAtual);
    return filterPaidOrders(orders, prefix);
  }, [orders, periodo, todayStr, mesAtualStr, anoAtual]);

  const finReceitasMes = useMemo(() => finTransactions.filter((t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, 7) === mesAtualStr), [finTransactions, mesAtualStr]);
  const finReceitasHoje = useMemo(() => finTransactions.filter((t) => t.tipo === "RECEITA" && t.data && t.data === todayStr), [finTransactions, todayStr]);
  const finReceitasAno = useMemo(() => finTransactions.filter((t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, 4) === String(anoAtual)), [finTransactions, anoAtual]);

  const getFinReceitasFiltradas = () => {
    if (periodo === "dia") return finReceitasHoje;
    if (periodo === "mes") return finReceitasMes;
    return finReceitasAno;
  };
  const finReceitasFiltradas = getFinReceitasFiltradas();
  const totalFinReceitas = finReceitasFiltradas.reduce((s, t) => s + (Number(t.valor) || 0), 0);

  // ═══════ FONTE ÚNICA: transações RECEITA (vendas, sinais, baixas de credor) ═══════
  const totalEntradas = totalFinReceitas;
  const pedidosConcluidos = ordersPagosPeriodo;

  const despMes = useMemo(() => expenses.filter((e) => e.data && e.data.slice(0, 7) === mesAtualStr), [expenses, mesAtualStr]);
  const totalSaidas = despMes.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const lucroLiquido = totalEntradas - totalSaidas;

  const brindeExpensesPeriodo = useMemo(() => {
    return expenses.filter((e) => {
      if (e.categoria !== CATEGORIA_BRINDE || !e.data) return false;
      if (periodo === "dia") return e.data === todayStr;
      if (periodo === "mes") return e.data.slice(0, 7) === mesAtualStr;
      return e.data.slice(0, 4) === String(anoAtual);
    });
  }, [expenses, periodo, todayStr, mesAtualStr, anoAtual]);
  const custoBrindes = brindeExpensesPeriodo.reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const qtdResgates = brindeExpensesPeriodo.length;

  const pendentes = ordersFiltrados.filter((o) => o.status !== "concluido" && !o.isFiado);
  const valorPrevisto = pendentes.reduce((s, o) => {
    const sinalPago = Number(o.valorPagoSinal) || 0;
    return s + Math.max(0, (Number(o.total) || 0) - sinalPago);
  }, 0);

  const porPagamento = useMemo(() => {
    const acc: Record<string, number> = {
      PIX: 0,
      Dinheiro: 0,
      "Cartão Débito": 0,
      "Cartão Crédito": 0,
      Outros: 0,
    };

    finReceitasFiltradas.forEach((t) => {
      const label = paymentLabelOf(t.formaPagamento);
      acc[label] = (acc[label] || 0) + (Number(t.valor) || 0);
    });

    return {
      pix: acc.PIX,
      dinheiro: acc.Dinheiro,
      cartao_debito: acc["Cartão Débito"],
      cartao_credito: acc["Cartão Crédito"],
      outros: acc.Outros,
    };
  }, [finReceitasFiltradas]);

  const distribuicaoEntradas = useMemo(() => {
    const catMap: Record<string, number> = {
      "Bolos": 0,
      "Gelinhos": 0,
      "Sobremesas": 0,
      "Salgados": 0,
      "Torta Salgada": 0,
    };

    ordersPagosPeriodo.forEach((o) => {
      o.items.forEach((item) => {
        const prodCatId = item.product.category_id;
        const catObj = categories.find((c) => c.id === prodCatId);
        let catName = catObj ? catObj.name : "Bolos";

        const lower = catName.toLowerCase();
        if (lower.includes("bolo")) catName = "Bolos";
        else if (lower.includes("gelinho") || lower.includes("gel")) catName = "Gelinhos";
        else if (lower.includes("sobremesa")) catName = "Sobremesas";
        else if (lower.includes("salgado")) catName = "Salgados";
        else if (lower.includes("torta")) catName = "Torta Salgada";
        else catName = "Bolos";

        const itemVal = (Number(item.product.price) || 0) * (Number(item.quantity) || 1);
        catMap[catName] = (catMap[catName] || 0) + itemVal;
      });
    });

    return Object.entries(catMap)
      .filter(([_, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [ordersPagosPeriodo, categories]);

  const maxEntrada = Math.max(...distribuicaoEntradas.map((d) => d.value), 1);

  const distribuicoesSaidas = useMemo(() => {
    const catMap: Record<string, number> = {};
    despMes.forEach((e) => {
      catMap[e.categoria] = (catMap[e.categoria] || 0) + (Number(e.valor) || 0);
    });
    const total = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  }, [despMes]);

  const maxSaida = Math.max(...distribuicoesSaidas.map((d) => d.value), 1);

  const despMesFiltradas = useMemo(() => {
    return despMes.filter((e) => {
      if (filtroCategoriaDesp !== "Todas" && e.categoria !== filtroCategoriaDesp) return false;
      if (filtroStatusDesp !== "Todos" && e.status !== filtroStatusDesp) return false;
      return true;
    });
  }, [despMes, filtroCategoriaDesp, filtroStatusDesp]);

  const totalPaginasDespesas = Math.ceil(despMesFiltradas.length / PAGE_SIZE) || 1;
  const pageDespesasSafe = Math.min(pageDespesas, totalPaginasDespesas);
  const despMesPaginadas = despMesFiltradas.slice((pageDespesasSafe - 1) * PAGE_SIZE, pageDespesasSafe * PAGE_SIZE);

  function navigateMonth(delta: number) {
    let newMonth = mesAtual + delta;
    let newYear = anoAtual;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setMesAtual(newMonth);
    setAnoAtual(newYear);
  }

  const { markAsPaid, deleteExpense } = useExpenseStore.getState();

  const periodos: { key: Periodo; label: string }[] = [
    { key: "dia", label: "Dia" },
    { key: "mes", label: "Mes" },
    { key: "ano", label: "Ano" },
  ];

  return (
    <div className="space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Financeiro</h1>
          <button
            onClick={() => setShowDespesaModal(true)}
            className="flex items-center gap-2 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600"
          >
            <span className="text-lg">+</span> Lancar Despesa
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-1">
            {periodos.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={classNames(
                  "rounded-md px-4 py-1.5 text-xs font-bold transition-all",
                  periodo === p.key
                    ? "bg-wine-500/20 text-wine-400 border border-wine-500/40"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-white border border-transparent"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigateMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="min-w-[120px] text-center text-sm font-bold text-white">
              {MONTH_NAMES[mesAtual].slice(0, 3).toUpperCase()} {anoAtual}
            </span>
            <button onClick={() => navigateMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Entradas</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {safeMoney(totalEntradas)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pedidosConcluidos.length} pedidos concluidos</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total Saidas</p>
          <p className="mt-2 text-3xl font-bold text-red-400">R$ {safeMoney(totalSaidas)}</p>
          <p className="mt-1 text-xs text-neutral-500">{despMes.filter((e) => e.status === "Pago").length} despesas pagas</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Lucro Liquido</p>
          <p className={classNames("mt-2 text-3xl font-bold", lucroLiquido >= 0 ? "text-emerald-400" : "text-red-400")}>
            R$ {safeMoney(lucroLiquido)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Lucro do mes</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Faturamento Previsto</p>
          <p className="mt-2 text-3xl font-bold text-blue-400">R$ {safeMoney(valorPrevisto)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pendentes.length} agendamentos pendentes</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">TOTAL A RECEBER (FIADOS)</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">R$ {safeMoney(totalFiadoAberto)}</p>
          <p className="mt-1 text-xs text-neutral-400">{qtdClientesDevendo} clientes devendo</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-500">CUSTO DE BRINDES (FIDELIDADE)</p>
          <p className="mt-2 text-3xl font-bold text-[#8B1D22] dark:text-red-500">R$ {safeMoney(custoBrindes)}</p>
          <p className="mt-1 text-xs text-neutral-500">{qtdResgates} resgatado{qtdResgates === 1 ? "" : "s"} no período</p>
        </div>
      </div>

      {/* ═══════ DISTRIBUTION CHARTS ═══════ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Entradas por Categoria */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Distribuicao de Entradas (Concluído)</p>
          {distribuicaoEntradas.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma entrada concluída no período. Use &quot;Faturamento Previsto&quot; para pedidos abertos.</p>
          ) : (
            <div className="space-y-4">
              {distribuicaoEntradas.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{item.name}</span>
                    <span className="text-neutral-300">{totalEntradas > 0 ? Math.round((item.value / totalEntradas) * 100) : 0}% · R$ {safeMoney(item.value)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-neutral-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.value / maxEntrada) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saidas por Categoria */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Distribuicao de Saidas</h3>
          {distribuicoesSaidas.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma despesa registrada.</p>
          ) : (
            <div className="space-y-4">
              {distribuicoesSaidas.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{item.name}</span>
                    <span className="text-neutral-300">{item.pct}% · R$ {safeMoney(item.value)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-neutral-800">
                    <div className={classNames("h-full rounded-full", CATEGORIA_COLORS[item.name] || "bg-neutral-500")} style={{ width: `${(item.value / maxSaida) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ ENTRADAS POR PAGAMENTO ═══════ */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-4 text-sm font-semibold text-white">Entradas por Pagamento</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Pix", value: porPagamento.pix, icon: "💠", color: "text-emerald-400" },
            { label: "Dinheiro", value: porPagamento.dinheiro, icon: "💵", color: "text-yellow-400" },
            { label: "Cartao Debito", value: porPagamento.cartao_debito, icon: "💳", color: "text-blue-400" },
            { label: "Cartao Credito", value: porPagamento.cartao_credito, icon: "💳", color: "text-purple-400" },
            { label: "Outros", value: porPagamento.outros, icon: "🏷️", color: "text-neutral-400" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-neutral-800 bg-neutral-800/50 p-4 text-center">
              <span className="text-2xl">{item.icon}</span>
              <p className="mt-2 text-xs font-semibold text-neutral-500">{item.label}</p>
              <p className={classNames("mt-1 text-lg font-bold", item.color)}>
                R$ {safeMoney(item.value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ DESPESAS DO MES ═══════ */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
          <h3 className="text-sm font-semibold text-white">Despesas do Mes</h3>
          <div className="flex gap-2">
            <select value={filtroCategoriaDesp} onChange={(e) => { setFiltroCategoriaDesp(e.target.value); setPageDespesas(1); }}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white outline-none focus:border-wine-500">
              <option value="Todas">Todas as Categorias</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroStatusDesp} onChange={(e) => { setFiltroStatusDesp(e.target.value); setPageDespesas(1); }}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white outline-none focus:border-wine-500">
              <option value="Todos">Todos os Status</option>
              <option value="Pago">Pago</option>
              <option value="Pendente">Pendente</option>
              <option value="Em Atraso">Em Atraso</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Descricao</th>
                <th className="px-6 py-3">Categoria</th>
                <th className="px-6 py-3 text-right">Valor (R$)</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-center">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {despMesPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">Nenhuma despesa registrada neste mes.</td>
                </tr>
              ) : (
                despMesPaginadas.map((desp) => {
                  const dataDesp = new Date(desp.data + "T00:00:00");
                  const hoje = new Date();
                  const diffDias = Math.ceil((dataDesp.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  const isVencida = diffDias < 0 && desp.status !== "Pago";
                  const diasLabel = isVencida ? `(${Math.abs(diffDias)}d atraso)` : diffDias >= 0 ? `(em ${diffDias}d)` : "";

                  return (
                    <tr key={desp.id} className="transition-colors hover:bg-neutral-800/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={classNames("h-2 w-2 rounded-full", CATEGORIA_COLORS[desp.categoria] || "bg-neutral-500")} />
                          <span className="font-medium text-white">{desp.descricao}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                          {desp.categoria}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-red-400">
                        - R$ {safeMoney(desp.valor)}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-300">
                        {dataDesp.toLocaleDateString("pt-BR")} {diasLabel && <span className={classNames("text-xs", isVencida ? "text-red-400" : "text-neutral-500")}>{diasLabel}</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={classNames("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", STATUS_COLORS[desp.status])}>
                          {desp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {desp.status !== "Pago" && (
                            <button onClick={() => markAsPaid(desp.id)}
                              className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25">
                              Pago
                            </button>
                          )}
                          <button onClick={() => deleteExpense(desp.id)}
                            className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25">
                            X
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPaginasDespesas > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-800 px-6 py-3 text-xs text-neutral-400">
            <span>Página {pageDespesasSafe} de {totalPaginasDespesas}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPageDespesas((p) => Math.max(1, p - 1))}
                disabled={pageDespesasSafe === 1}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPageDespesas((p) => Math.min(totalPaginasDespesas, p + 1))}
                disabled={pageDespesasSafe === totalPaginasDespesas}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═════ULTIMOS PEDIDOS ═══════ */}
      {orders.length > 0 && (() => {
        const itemsPerPage = PAGE_SIZE;
        const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const totalPages = Math.ceil(sortedOrders.length / itemsPerPage) || 1;
        const pagePedidosSafe = Math.min(pagePedidos, totalPages);
        const paginatedOrders = sortedOrders.slice((pagePedidosSafe - 1) * itemsPerPage, pagePedidosSafe * itemsPerPage);

        return (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Ultimos Pedidos</h3>
              <span className="text-xs text-neutral-500">{sortedOrders.length} pedidos no total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                    <th className="px-6 py-3">ID</th>
                    <th className="px-6 py-3">Data & Hora</th>
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Produtos</th>
                    <th className="px-6 py-3 text-right">Total (R$)</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {paginatedOrders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-neutral-800/30">
                      <td className="px-6 py-3 text-xs text-neutral-500 font-mono">{order.id.slice(-12)}</td>
                      <td className="px-6 py-3 text-sm text-neutral-300">
                        {new Date(order.createdAt).toLocaleDateString("pt-BR")} {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-white">{order.customerName}</td>
                      <td className="px-6 py-3 text-xs text-neutral-400 max-w-[200px] truncate">
                        {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(", ")}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-emerald-400">
                        R$ {safeMoney(order.total)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={classNames(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          order.status === "concluido" ? "bg-emerald-500/15 text-emerald-400"
                            : order.isFiado ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : order.status === "pendente" ? "bg-amber-500/15 text-amber-400"
                            : order.status === "em_producao" ? "bg-purple-500/15 text-purple-400"
                            : "bg-blue-500/15 text-blue-400"
                        )}>
                          {order.status === "concluido" ? "Concluido"
                            : order.isFiado ? "Fiado / Credor"
                            : order.status === "pendente" ? "Pendente"
                            : order.status === "em_producao" ? "Em Producao"
                            : "Agendado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-neutral-800 px-6 py-3 text-xs text-neutral-400">
                <span>Página {pagePedidosSafe} de {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagePedidos((p) => Math.max(1, p - 1))}
                    disabled={pagePedidosSafe === 1}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPagePedidos((p) => Math.min(totalPages, p + 1))}
                    disabled={pagePedidosSafe === totalPages}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════ MODAL ═══════ */}
      {showDespesaModal && <LaunchDespesaModal onClose={() => setShowDespesaModal(false)} />}
    </div>
  );
}
