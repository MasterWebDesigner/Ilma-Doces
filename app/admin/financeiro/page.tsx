"use client";

import { useState, useMemo } from "react";
import {
  useOrderStore,
  useExpenseStore,
  useProductStore,
  useCustomerStore,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUS_COLORS as STATUS_COLORS,
  EXPENSE_CATEGORIA_COLORS as CATEGORIA_COLORS,
} from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import { useEntradasStore } from "@/lib/entradasStore";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import LaunchDespesaModal from "@/components/admin/LaunchDespesaModal";
import DespesaDetailsDrawer from "@/components/admin/DespesaDetailsDrawer";
import BrindesDrawer from "@/components/admin/BrindesDrawer";
import { classNames, compararTexto, getLocalDateStr, getLocalDateStrFromISO, getLocalMonthStr, paymentLabelOf } from "@/lib/utils";
import { filterPaidOrders, sinalRecebidoDoPedido, isFiadoPendente, saldoPendenteDoPedido } from "@/lib/faturamento";
import type { Expense } from "@/types/database";

type Periodo = "dia" | "mes" | "ano";

const PAGE_SIZE = 15;
const PAGE_SIZE_DESPESAS = 10;
const CATEGORIA_BRINDE = "Custos de Brindes / Fidelidade";
const ID_LINHA_BRINDES = "__brindes__";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function safeMoney(val: any): string {
  const num = Number(val);
  if (isNaN(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

export default function AdminFinanceiro() {
  const orders = useOrderStore((s) => s.orders);
  const expenses = useExpenseStore((s) => s.expenses);
  const entradasTodas = useEntradasStore((s) => s.entradas);
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
  const [despSelecionada, setDespSelecionada] = useState<Expense | null>(null);
  const [brindeDrawerAberta, setBrindeDrawerAberta] = useState(false);
  const [pageDespesas, setPageDespesas] = useState(1);
  const [pagePedidos, setPagePedidos] = useState(1);
  const [mesAtual, setMesAtual] = useState(new Date().getMonth());
  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear());

  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const mesAtualStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;

  const ordersMes = useMemo(() => orders.filter((o) => getLocalDateStrFromISO(o.createdAt).slice(0, 7) === mesAtualStr), [orders, mesAtualStr]);
  const ordersHoje = useMemo(() => orders.filter((o) => getLocalDateStrFromISO(o.createdAt) === todayStr), [orders, todayStr]);
  const ordersAno = useMemo(() => orders.filter((o) => getLocalDateStrFromISO(o.createdAt).slice(0, 4) === String(anoAtual)), [orders, anoAtual]);

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

  const despMes = useMemo(
    () => expenses.filter((e) => ((e.vencimento || e.data) || "").slice(0, 7) === mesAtualStr),
    [expenses, mesAtualStr]
  );
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

  const pendentes = ordersFiltrados.filter((o) => o.status !== "concluido" && !o.isFiado && o.status !== "recusado" && o.status !== "cancelado");
  const valorPrevisto = pendentes.reduce((s, o) => {
    return s + Math.max(0, (Number(o.total) || 0) - sinalRecebidoDoPedido(o));
  }, 0);

  const porPagamento = useMemo(() => {
    const acc: Record<string, number> = {
      PIX: 0,
      Dinheiro: 0,
      "Cartão Débito": 0,
      "Cartão Crédito": 0,
      Outros: 0,
    };

    const principais = ["PIX", "Dinheiro", "Cartão Débito", "Cartão Crédito"];
    finReceitasFiltradas.forEach((t) => {
      const label = paymentLabelOf(t.formaPagamento);
      const chave = principais.includes(label) ? label : "Outros";
      acc[chave] = (acc[chave] || 0) + (Number(t.valor) || 0);
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

    const lista = Object.entries(catMap)
      .filter(([_, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
    const totalCat = lista.reduce((s, d) => s + d.value, 0);
    if (totalCat <= 0) return lista.map((d) => ({ ...d, pct: 0 }));
    const decimos = lista.map((d) => Math.floor((d.value / totalCat) * 1000));
    let resto = 1000 - decimos.reduce((s, v) => s + v, 0);
    const fracoes = lista
      .map((d, i) => ({ i, frac: (d.value / totalCat) * 1000 - Math.floor((d.value / totalCat) * 1000) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of fracoes) {
      if (resto <= 0) break;
      decimos[i] += 1;
      resto--;
    }
    return lista.map((d, i) => ({ ...d, pct: decimos[i] / 10 }));
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
    return despMes
      .filter((e) => {
        if (filtroCategoriaDesp !== "Todas" && e.categoria !== filtroCategoriaDesp) return false;
        if (filtroStatusDesp !== "Todos" && e.status !== filtroStatusDesp) return false;
        return true;
      })
      .sort((a, b) => {
        const va = a.vencimento || a.data;
        const vb = b.vencimento || b.data;
        if (va !== vb) return va.localeCompare(vb);
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [despMes, filtroCategoriaDesp, filtroStatusDesp]);

  const { linhasDespesas, brindesFiltrados } = useMemo(() => {
    const brindes = despMesFiltradas.filter((e) => e.categoria === CATEGORIA_BRINDE);
    const outras = despMesFiltradas.filter((e) => e.categoria !== CATEGORIA_BRINDE);
    if (brindes.length === 0) return { linhasDespesas: despMesFiltradas, brindesFiltrados: [] as Expense[] };
    const agregada: Expense = {
      id: ID_LINHA_BRINDES,
      descricao: "Brindes / Fidelidade",
      categoria: CATEGORIA_BRINDE,
      valor: brindes.reduce((s, e) => s + (Number(e.valor) || 0), 0),
      data: brindes[0]?.data || "",
      vencimento: "",
      status: brindes.every((e) => e.status === "Pago") ? "Pago" : "Pendente",
      createdAt: "",
    };
    return { linhasDespesas: [agregada, ...outras], brindesFiltrados: brindes };
  }, [despMesFiltradas]);

  const resumoDespesas = useMemo(() => {
    const r = { total: 0, pago: 0, pendente: 0, pagas: 0, pendentes: 0, vencidas: 0 };
    despMesFiltradas.forEach((e) => {
      const v = Number(e.valor) || 0;
      r.total += v;
      if (e.status === "Pago") {
        r.pago += v;
        r.pagas++;
      } else {
        r.pendente += v;
        r.pendentes++;
        const vd = (e.vencimento || e.data) || "";
        if (vd && vd < todayStr) r.vencidas++;
      }
    });
    return r;
  }, [despMesFiltradas, todayStr]);

  const totalPaginasDespesas = Math.ceil(linhasDespesas.length / PAGE_SIZE_DESPESAS) || 1;
  const pageDespesasSafe = Math.min(pageDespesas, totalPaginasDespesas);
  const despMesPaginadas = linhasDespesas.slice((pageDespesasSafe - 1) * PAGE_SIZE_DESPESAS, pageDespesasSafe * PAGE_SIZE_DESPESAS);

  function navigateMonth(delta: number) {
    let newMonth = mesAtual + delta;
    let newYear = anoAtual;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setMesAtual(newMonth);
    setAnoAtual(newYear);
  }

  const despAtual = despSelecionada ? expenses.find((e) => e.id === despSelecionada.id) ?? null : null;
  const entradaSel = despAtual && despAtual.entradaId ? entradasTodas.find((e) => e.id === despAtual.entradaId) : undefined;

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
            className="flex items-center gap-2 rounded-xl bg-[#8B1D22] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#72171B]"
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
            ? "bg-[#8B1D22] text-white shadow-sm"
            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
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
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">Total Entradas</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {safeMoney(totalEntradas)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pedidosConcluidos.length} pedidos concluidos</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">Total Saidas</p>
          <p className="mt-2 text-3xl font-bold text-red-400">R$ {safeMoney(totalSaidas)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {despMes.filter((e) => e.status === "Pago").length} pagas · {despMes.filter((e) => e.status !== "Pago").length} pendentes
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">Lucro Liquido</p>
          <p className={classNames("mt-2 text-3xl font-bold", lucroLiquido >= 0 ? "text-emerald-400" : "text-red-400")}>
            R$ {safeMoney(lucroLiquido)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Lucro do mes</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">Faturamento Previsto</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {safeMoney(valorPrevisto)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pendentes.length} agendamentos pendentes</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">TOTAL A RECEBER (FIADOS)</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {safeMoney(totalFiadoAberto)}</p>
          <p className="mt-1 text-xs text-neutral-500">{qtdClientesDevendo} clientes devendo</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-wine-500/30 bg-neutral-900 p-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#8B1D22] dark:bg-wine-500" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-wine-400">CUSTO DE BRINDES (FIDELIDADE)</p>
          <p className="mt-2 text-3xl font-bold text-[#8B1D22] dark:text-wine-400">R$ {safeMoney(custoBrindes)}</p>
          <p className="mt-1 text-xs text-neutral-500">{qtdResgates} resgatado{qtdResgates === 1 ? "" : "s"} no período</p>
        </div>
      </div>

      {/* ═══════ DISTRIBUTION CHARTS ═══════ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Entradas por Categoria */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Distribuição de Entradas (Concluído)</h3>
          {distribuicaoEntradas.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma entrada concluída no período. Use &quot;Faturamento Previsto&quot; para pedidos abertos.</p>
          ) : (
            <div className="space-y-4">
              {distribuicaoEntradas.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{item.name}</span>
                    <span className="text-neutral-300">{item.pct.toFixed(1).replace(".", ",")}% · R$ {safeMoney(item.value)}</span>
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
          <h3 className="mb-4 text-sm font-semibold text-white">Distribuição de Saídas</h3>
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "PIX", value: porPagamento.pix, icon: "💠" },
            { label: "Dinheiro", value: porPagamento.dinheiro, icon: "💵" },
            { label: "Cartão Débito", value: porPagamento.cartao_debito, icon: "💳" },
            { label: "Cartão Crédito", value: porPagamento.cartao_credito, icon: "💳" },
            ...(porPagamento.outros > 0
              ? [{ label: "Outros", value: porPagamento.outros, icon: "🔁" }]
              : []),
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[#8B1D22]/30 bg-neutral-800/50 p-4 text-center">
              <span className="text-2xl">{item.icon}</span>
              <p className="mt-2 text-xs font-semibold text-neutral-500">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                R$ {safeMoney(item.value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ DESPESAS DO MES ═══════ */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              Despesas do Mes
              <span className="rounded-full border border-wine-500/30 bg-wine-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-wine-400">
                por vencimento
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              A vista fica no mes da compra · cada parcela aparece no mes do seu vencimento
            </p>
          </div>
          <div className="flex gap-2">
            <select value={filtroCategoriaDesp} onChange={(e) => { setFiltroCategoriaDesp(e.target.value); setPageDespesas(1); }}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white outline-none focus:border-wine-500">
              <option value="Todas">Todas as Categorias</option>
                {[...EXPENSE_CATEGORIES].sort(compararTexto).map((c) => <option key={c} value={c}>{c}</option>)}
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-800 bg-neutral-900/50 px-6 py-3 text-xs text-neutral-400">
          <span>
            <b className="text-white">{resumoDespesas.pagas + resumoDespesas.pendentes}</b> despesa{(resumoDespesas.pagas + resumoDespesas.pendentes) === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-red-400">Total R$ {safeMoney(resumoDespesas.total)}</span>
          <span className="text-emerald-400">
            Pago R$ {safeMoney(resumoDespesas.pago)} ({resumoDespesas.pagas})
          </span>
          <span className="text-amber-400">
            Pendente R$ {safeMoney(resumoDespesas.pendente)} ({resumoDespesas.pendentes})
          </span>
          {resumoDespesas.vencidas > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-semibold text-red-400">
              {resumoDespesas.vencidas} vencida{resumoDespesas.vencidas === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Descricao</th>
                <th className="px-6 py-3 text-right">Valor (R$)</th>
                <th className="px-6 py-3">Vencimento</th>
                <th className="px-6 py-3 text-center">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {despMesPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-neutral-500">Nenhuma despesa com vencimento neste mes.</td>
                </tr>
              ) : (
                despMesPaginadas.map((desp) => {
                  if (desp.id === ID_LINHA_BRINDES) {
                    return (
                      <tr
                        key={desp.id}
                        onClick={() => setBrindeDrawerAberta(true)}
                        className="cursor-pointer transition-colors hover:bg-neutral-800/30"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={classNames("h-2 w-2 rounded-full", CATEGORIA_COLORS[desp.categoria] || "bg-neutral-500")} />
                            <span className="font-medium text-white">{desp.descricao}</span>
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                              {brindesFiltrados.length} resgate{brindesFiltrados.length === 1 ? "" : "s"}
                            </span>
                            <span
                              className={classNames(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                STATUS_COLORS[desp.status]
                              )}
                            >
                              {desp.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-red-400">
                          - R$ {safeMoney(desp.valor)}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-500">no mes</td>
                        <td className="px-6 py-4 text-center">
                          <svg
                            className="mx-auto h-4 w-4 text-neutral-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-label="Ver brindes"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    );
                  }
                  const dataVencimento = desp.vencimento || desp.data;
                  const dataDesp = new Date(dataVencimento + "T00:00:00");
                  const hoje = new Date();
                  const diffDias = Math.ceil((dataDesp.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  const isVencida = diffDias < 0 && desp.status !== "Pago";
                  const diasLabel = isVencida
                    ? `${Math.abs(diffDias)}d atraso`
                    : diffDias < 0
                    ? ""
                    : diffDias === 0
                    ? "hoje"
                    : `em ${diffDias}d`;
                  const ehEntrada = Boolean(desp.entradaId);
                  const mParcela = desp.descricao.match(/parcela\s+(\d+)\s*\/\s*(\d+)/i);
                  const ehParcela = ehEntrada && (Boolean(mParcela) || dataVencimento !== desp.data);
                  const chipLabel = mParcela ? `${mParcela[1]}/${mParcela[2]}` : ehParcela ? "Parcela" : "A Vista";

                  return (
                    <tr
                      key={desp.id}
                      onClick={() => setDespSelecionada(desp)}
                      className={classNames(
                        "cursor-pointer transition-colors",
                        isVencida ? "bg-red-500/10" : "hover:bg-neutral-800/30"
                      )}
                    >
                      <td className={classNames("px-6 py-4", isVencida && "border-l-2 border-red-500/30")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={classNames("h-2 w-2 rounded-full", CATEGORIA_COLORS[desp.categoria] || "bg-neutral-500")} />
                          <span className="font-medium text-white">{desp.descricao}</span>
                          {ehEntrada && (
                            <span
                              className={classNames(
                                "rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                                ehParcela
                                  ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                              )}
                            >
                              {chipLabel}
                            </span>
                          )}
                          <span
                            className={classNames(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              STATUS_COLORS[desp.status]
                            )}
                          >
                            {desp.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-bold text-red-400">
                        - R$ {safeMoney(desp.valor)}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-300">
                        {dataDesp.toLocaleDateString("pt-BR")} {diasLabel && <span className={classNames("text-xs", isVencida ? "text-red-400" : "text-neutral-500")}>{diasLabel}</span>}
                        {desp.vencimento && desp.vencimento !== desp.data && (
                          <span className="block text-[10px] text-neutral-500">compra {new Date(desp.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <svg
                          className="mx-auto h-4 w-4 text-neutral-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-label="Ver detalhes"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {despMesFiltradas.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-800 bg-neutral-900/50">
                  <td className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Total ({despMesFiltradas.length} despesa{despMesFiltradas.length === 1 ? "" : "s"})
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-bold text-red-400">- R$ {safeMoney(resumoDespesas.total)}</td>
                  <td colSpan={2} className="px-6 py-3" />
                </tr>
              </tfoot>
            )}
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
                  {paginatedOrders.map((order) => {
                    const fiadoPendente = isFiadoPendente(order, credores);
                    const concluidoNaoQuitado = order.status === "concluido" && !fiadoPendente && saldoPendenteDoPedido(order, credores) > 0;
                    const aReceber = fiadoPendente || concluidoNaoQuitado;
                    return (
                    <tr key={order.id} className="transition-colors hover:bg-neutral-800/30">
                      <td className="px-6 py-3 text-xs text-neutral-500 font-mono">{order.id.slice(-12)}</td>
                      <td className="px-6 py-3 text-sm text-neutral-300">
                        {new Date(order.createdAt).toLocaleDateString("pt-BR")} {new Date(order.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-white">{order.customerName}</td>
                      <td className="px-6 py-3 text-xs text-neutral-400 max-w-[200px] truncate">
                        {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(", ")}
                      </td>
                      <td className={classNames(
                        "px-6 py-3 text-right text-sm font-bold",
                        aReceber ? "text-amber-400" : "text-emerald-400"
                      )}>
                        R$ {safeMoney(order.total)}
                        {aReceber && <span className="ml-1 text-[10px] font-semibold">a receber</span>}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={classNames(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                          aReceber ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : order.status === "concluido" ? "bg-emerald-500/15 text-emerald-400"
                            : order.status === "recusado" ? "bg-red-500/15 text-red-400"
                            : order.status === "cancelado" ? "bg-orange-500/15 text-orange-400"
                            : order.status === "pendente" ? "bg-amber-500/15 text-amber-400"
                            : order.status === "em_producao" ? "bg-purple-500/15 text-purple-400"
                            : "bg-blue-500/15 text-blue-400"
                        )}>
                          {fiadoPendente ? "Fiado / A Receber"
                            : concluidoNaoQuitado ? "Pendente"
                            : order.status === "concluido" ? "Concluido"
                            : order.status === "recusado" ? "Recusado"
                            : order.status === "cancelado" ? "Cancelado"
                            : order.isFiado ? "Fiado / Quitado"
                            : order.status === "pendente" ? "Pendente"
                            : order.status === "em_producao" ? "Em Producao"
                            : "Agendado"
                          }
                        </span>
                      </td>
                    </tr>
                    );
                  })}
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

      {/* ═══════ GAVETA BRINDES ═══════ */}
      {brindeDrawerAberta && (
        <BrindesDrawer
          brindes={brindesFiltrados}
          onClose={() => setBrindeDrawerAberta(false)}
          onSelect={(d) => setDespSelecionada(d)}
        />
      )}

      {/* ═══════ GAVETA DETALHES ═══════ */}
      {despAtual && (
        <DespesaDetailsDrawer desp={despAtual} entrada={entradaSel} onClose={() => setDespSelecionada(null)} />
      )}

      {/* ═══════ MODAL ═══════ */}
      {showDespesaModal && <LaunchDespesaModal onClose={() => setShowDespesaModal(false)} />}
    </div>
  );
}
