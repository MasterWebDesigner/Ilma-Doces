"use client";

import { useState, useMemo } from "react";
import { useOrderStore, useProductStore, useCustomerStore } from "@/lib/store";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { classNames, formatItemQty, paymentLabelOf } from "@/lib/utils";
import { filterPaidOrders, filterUnpaidOrders, orderRemaining, isOrderPaid } from "@/lib/faturamento";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTH_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

type ItemLike = {
  product: { isCustomWeight?: boolean; price: number };
  quantity: number;
  is_brinde?: boolean;
  preco_unitario?: number;
};

function lineUnits(item: ItemLike): number {
  return item.product.isCustomWeight ? 1 : item.quantity;
}

function lineKg(item: ItemLike): number {
  return item.product.isCustomWeight ? item.quantity : 0;
}

function lineRevenue(item: ItemLike): number {
  if (item.is_brinde) return 0;
  const unit = item.preco_unitario ?? item.product.price;
  return unit * item.quantity;
}

function fmtUnKg(units: number, kg: number): string {
  const u = Math.round(units);
  if (kg > 0.05) return `${u} un (${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg)`;
  return `${u} un`;
}

function money(val: number): string {
  return Number(val || 0).toFixed(2).replace(".", ",");
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-400" },
  confirmado: { label: "Confirmado", cls: "bg-blue-500/15 text-blue-400" },
  em_producao: { label: "Em Produção", cls: "bg-purple-500/15 text-purple-400" },
  pronto: { label: "Pronto", cls: "bg-cyan-500/15 text-cyan-400" },
  saiu_entrega: { label: "Saiu p/ Entrega", cls: "bg-amber-500/15 text-amber-400" },
  pendente: { label: "Pendente", cls: "bg-neutral-500/15 text-neutral-400" },
};

const PAYMENT_COLORS: Record<string, string> = {
  "PIX": "#10B981",
  "Dinheiro": "#A16207",
  "Cartão Débito": "#B91C1C",
  "Cartão Crédito": "#8B1D22",
  "Fiado": "#9A3412",
  "Outros": "#6B7280",
};

const RANK_BADGES = [
  "bg-gradient-to-r from-yellow-400 to-amber-500 text-black",
  "bg-gradient-to-r from-neutral-200 to-neutral-400 text-black",
  "bg-gradient-to-r from-orange-400 to-orange-600 text-white",
  "bg-stone-200 text-stone-600 dark:bg-neutral-800 dark:text-neutral-400",
  "bg-stone-200 text-stone-600 dark:bg-neutral-800 dark:text-neutral-500",
];

type Granularidade = "ano" | "mes" | "dia";
type ChartPoint = { key: string; label: string; total: number; count: number; tooltip: string };

export default function AdminVendasPage() {
  const orders = useOrderStore((s) => s.orders);
  const categories = useProductStore((s) => s.categories);
  const customers = useCustomerStore((s) => s.customers);
  const transactions = useFinanceiroStore((s) => s.transactions);

  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [filtroPagamento, setFiltroPagamento] = useState("Todas");
  const [granularidade, setGranularidade] = useState<Granularidade>("mes");
  const [mesAtual, setMesAtual] = useState(new Date().getMonth());
  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear());
  const [diaAtual, setDiaAtual] = useState(new Date().getDate());
  const [abaAnalise, setAbaAnalise] = useState<"produtos" | "clientes" | "categorias">("produtos");

  const daysInMonth = new Date(anoAtual, mesAtual + 1, 0).getDate();

  function clampDia(ano: number, mes: number) {
    const dim = new Date(ano, mes + 1, 0).getDate();
    setDiaAtual((d) => Math.min(d, dim));
  }

  function changeGranularidade(g: Granularidade) {
    setGranularidade(g);
    if (g === "dia") clampDia(anoAtual, mesAtual);
  }

  function changeAno(y: number) {
    setAnoAtual(y);
    clampDia(y, mesAtual);
  }

  function changeMes(m: number) {
    setMesAtual(m);
    clampDia(anoAtual, m);
  }

  function navigatePeriodo(delta: number) {
    if (granularidade === "ano") {
      setAnoAtual((a) => a + delta);
      return;
    }
    if (granularidade === "mes") {
      let newMonth = mesAtual + delta;
      let newYear = anoAtual;
      if (newMonth > 11) { newMonth = 0; newYear++; }
      if (newMonth < 0) { newMonth = 11; newYear--; }
      setMesAtual(newMonth);
      setAnoAtual(newYear);
      clampDia(newYear, newMonth);
      return;
    }
    const d = new Date(anoAtual, mesAtual, diaAtual + delta);
    setAnoAtual(d.getFullYear());
    setMesAtual(d.getMonth());
    setDiaAtual(d.getDate());
  }

  const anoStr = String(anoAtual);
  const mesStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;
  const diaStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(diaAtual).padStart(2, "0")}`;

  const prefixAtual = granularidade === "ano" ? anoStr : granularidade === "mes" ? mesStr : diaStr;
  const lenPrefix = granularidade === "ano" ? 4 : granularidade === "mes" ? 7 : 10;

  const periodoAnteriorStr = useMemo(() => {
    if (granularidade === "ano") return String(anoAtual - 1);
    if (granularidade === "mes") {
      const prev = new Date(anoAtual, mesAtual - 1, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    }
    const prev = new Date(anoAtual, mesAtual, diaAtual - 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  }, [granularidade, anoAtual, mesAtual, diaAtual]);

  const ordersPaidPeriodo = useMemo(
    () => filterPaidOrders(orders, prefixAtual),
    [orders, prefixAtual]
  );

  const ordersUnpaidPeriodo = useMemo(
    () => filterUnpaidOrders(orders, prefixAtual),
    [orders, prefixAtual]
  );

  const ordersPaidAnterior = useMemo(
    () => filterPaidOrders(orders, periodoAnteriorStr),
    [orders, periodoAnteriorStr]
  );

  const ordersPeriodo = useMemo(() => {
    const paidSet = new Set(ordersPaidPeriodo.map((o) => o.id));
    return [...ordersPaidPeriodo, ...ordersUnpaidPeriodo.filter((o) => !paidSet.has(o.id))];
  }, [ordersPaidPeriodo, ordersUnpaidPeriodo]);

  const ordersAnterior = ordersPaidAnterior;

  const receitasPeriodo = useMemo(
    () =>
      transactions.filter(
        (t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, lenPrefix) === prefixAtual
      ),
    [transactions, prefixAtual, lenPrefix]
  );

  const receitasAnterior = useMemo(
    () =>
      transactions.filter(
        (t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, lenPrefix) === periodoAnteriorStr
      ),
    [transactions, periodoAnteriorStr, lenPrefix]
  );

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    orders.forEach((o) => { if (o.createdAt) set.add(Number(o.createdAt.slice(0, 4))); });
    set.add(new Date().getFullYear());
    set.add(anoAtual);
    return Array.from(set).sort((a, b) => b - a);
  }, [orders, anoAtual]);

  const periodoNome = granularidade === "ano" ? "do Ano" : granularidade === "mes" ? "do Mês" : "do Dia";

  const salesRows = useMemo(() => {
    return ordersPeriodo.map((o) => {
      const firstItem = o.items[0];
      const catObj = categories.find((c) => c.id === firstItem?.product?.category_id);
      const paidDate = isOrderPaid(o) && o.dataPagamento ? o.dataPagamento : o.createdAt;
      return {
        id: o.id,
        date: paidDate,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        itemsList: o.items.map((i) =>
          i.is_brinde
            ? `${formatItemQty(i.quantity, i.product.isCustomWeight)} ${i.product.name} (BRINDE)`
            : `${formatItemQty(i.quantity, i.product.isCustomWeight)} ${i.product.name}`
        ),
        categoryName: catObj ? catObj.name : "Geral",
        paymentMethod: paymentLabelOf(o.paymentMethod),
        total: Number(o.total) || 0,
        status: o.status,
        paid: isOrderPaid(o),
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ordersPeriodo, categories]);

  const filteredSales = useMemo(() => {
    return salesRows.filter((s) => {
      if (busca) {
        const q = busca.toLowerCase();
        if (!s.customerName.toLowerCase().includes(q) && !s.customerPhone.includes(q) && !s.itemsList.some((it) => it.toLowerCase().includes(q))) return false;
      }
      if (filtroCategoria !== "Todas" && s.categoryName !== filtroCategoria) return false;
      if (filtroPagamento !== "Todas" && s.paymentMethod !== filtroPagamento) return false;
      return true;
    });
  }, [salesRows, busca, filtroCategoria, filtroPagamento]);

  const ordersConcluidos = ordersPaidPeriodo;
  const totalVendas = receitasPeriodo.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
  const totalItensVendidos = ordersConcluidos.reduce((acc, o) => acc + o.items.reduce((s, i) => s + lineUnits(i), 0), 0);
  const totalPesoKg = ordersConcluidos.reduce((acc, o) => acc + o.items.reduce((s, i) => s + lineKg(i), 0), 0);
  const itensPorPedido = ordersConcluidos.length > 0 ? totalItensVendidos / ordersConcluidos.length : 0;

  // ═══════ CHART (ano→meses, mes→dias, dia→horas) ═══════
  const itensVendidosLista = useMemo(() => {
    const map = new Map<string, number>();
    ordersConcluidos.forEach((o) => o.items.forEach((item) => {
      map.set(item.product.name, (map.get(item.product.name) || 0) + lineUnits(item));
    }));
    return Array.from(map.entries())
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units);
  }, [ordersConcluidos]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const sumReceita = (list: typeof transactions, prefix: string) =>
      list
        .filter((t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, prefix.length) === prefix)
        .reduce((a, t) => a + (Number(t.valor) || 0), 0);

    const sumPrevisto = (datePrefix: string) =>
      filterUnpaidOrders(orders, datePrefix).reduce((a, o) => a + orderRemaining(o), 0);

    if (granularidade === "ano") {
      return Array.from({ length: 12 }, (_, m) => {
        const prefix = `${anoAtual}-${String(m + 1).padStart(2, "0")}`;
        const total = sumReceita(transactions, prefix);
        const previsto = sumPrevisto(prefix);
        const count = transactions.filter((t) => t.tipo === "RECEITA" && t.data && t.data.slice(0, 7) === prefix).length;
        return {
          key: `m${m}`,
          label: MONTH_SHORT[m],
          total,
          count,
          tooltip: `${MONTH_NAMES[m]} ${anoAtual}: R$ ${money(total)} recebido${previsto > 0 ? ` · Previsto R$ ${money(previsto)}` : ""} (${count} lançamentos)`,
        };
      });
    }
    if (granularidade === "mes") {
      const dim = new Date(anoAtual, mesAtual + 1, 0).getDate();
      return Array.from({ length: dim }, (_, i) => {
        const d = i + 1;
        const dateStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const total = sumReceita(transactions, dateStr);
        const previsto = sumPrevisto(dateStr);
        const count = transactions.filter((t) => t.tipo === "RECEITA" && t.data === dateStr).length;
        return {
          key: `d${d}`,
          label: String(d),
          total,
          count,
          tooltip: `Dia ${d}: R$ ${money(total)} recebido${previsto > 0 ? ` · Previsto R$ ${money(previsto)}` : ""} (${count} lançamentos)`,
        };
      });
    }
    return Array.from({ length: 24 }, (_, h) => {
      const dayTx = transactions.filter((t) => t.tipo === "RECEITA" && t.data === diaStr);
      const hTx = dayTx.filter((t) => new Date(t.createdAt).getHours() === h);
      const total = hTx.reduce((a, t) => a + (Number(t.valor) || 0), 0);
      return {
        key: `h${h}`,
        label: h % 3 === 0 ? String(h).padStart(2, "0") : "",
        total,
        count: hTx.length,
        tooltip: `${String(h).padStart(2, "0")}:00: R$ ${money(total)} recebido (${hTx.length} lançamentos)`,
      };
    });
  }, [granularidade, transactions, orders, anoAtual, mesAtual, diaStr]);

  const maxBar = Math.max(...chartData.map((d) => d.total), 1);
  const peakBarKey = chartData.find((d) => d.total === maxBar)?.key;

  // ═══════ TOP RANKINGS ═══════
  const topProdutos = useMemo(() => {
    const map = new Map<string, { name: string; units: number; kg: number; revenue: number }>();
    let totalRevenue = 0;
    ordersConcluidos.forEach((o) => o.items.forEach((item) => {
      const rev = lineRevenue(item);
      totalRevenue += rev;
      const e = map.get(item.product.name) || { name: item.product.name, units: 0, kg: 0, revenue: 0 };
      e.units += lineUnits(item);
      e.kg += lineKg(item);
      e.revenue += rev;
      map.set(item.product.name, e);
    }));
    const list = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    return list.map((p) => ({ ...p, pct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0 }));
  }, [ordersConcluidos]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; total: number; orders: number; status: string }>();
    customers.forEach((c) => map.set(c.phone, { name: c.name, phone: c.phone, total: 0, orders: 0, status: c.status }));
    ordersConcluidos.forEach((o) => {
      const phone = o.customerPhone ? o.customerPhone.replace(/\D/g, "") : "";
      if (!phone) return;
      const e = map.get(phone) || { name: o.customerName, phone, total: 0, orders: 0, status: "Nova" };
      e.total += Number(o.total) || 0;
      e.orders += 1;
      if (o.customerName) e.name = o.customerName;
      map.set(phone, e);
    });
    const list = Array.from(map.values()).filter((c) => c.total > 0 || c.orders > 0).sort((a, b) => b.total - a.total).slice(0, 10);
    const maxTotal = Math.max(...list.map((c) => c.total), 1);
    return list.map((c) => ({ ...c, pct: (c.total / maxTotal) * 100 }));
  }, [ordersConcluidos, customers]);

  const topPorCategoria = useMemo(() => {
    type ProdAgg = { name: string; units: number; kg: number; revenue: number };
    type CatAgg = { name: string; revenue: number; units: number; kg: number; products: Map<string, ProdAgg> };
    const catMap = new Map<string, CatAgg>();

    categories.forEach((c) => catMap.set(c.name, { name: c.name, revenue: 0, units: 0, kg: 0, products: new Map() }));

    ordersConcluidos.forEach((o) => o.items.forEach((item) => {
      const cat = categories.find((c) => c.id === item.product.category_id);
      const catName = cat ? cat.name : "Outros";
      if (!catMap.has(catName)) catMap.set(catName, { name: catName, revenue: 0, units: 0, kg: 0, products: new Map() });
      const c = catMap.get(catName)!;
      const rev = lineRevenue(item);
      c.revenue += rev;
      c.units += lineUnits(item);
      c.kg += lineKg(item);
      const p = c.products.get(item.product.name) || { name: item.product.name, units: 0, kg: 0, revenue: 0 };
      p.units += lineUnits(item);
      p.kg += lineKg(item);
      p.revenue += rev;
      c.products.set(item.product.name, p);
    }));

    return Array.from(catMap.values())
      .map((c) => ({
        name: c.name,
        revenue: c.revenue,
        units: c.units,
        kg: c.kg,
        products: Array.from(c.products.values()).sort((a, b) => b.units - a.units).slice(0, 5),
      }))
      .sort((a, b) => b.revenue - a.revenue || b.units - a.units);
  }, [ordersConcluidos, categories]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; total: number; count: number }>();
    receitasPeriodo.forEach((t) => {
      const label = paymentLabelOf(t.formaPagamento);
      const e = map.get(label) || { label, total: 0, count: 0 };
      e.total += Number(t.valor) || 0;
      e.count += 1;
      map.set(label, e);
    });
    const list = Array.from(map.values()).sort((a, b) => b.total - a.total);
    const total = list.reduce((s, p) => s + p.total, 0);
    return list.map((p) => ({ ...p, pct: total > 0 ? (p.total / total) * 100 : 0, color: PAYMENT_COLORS[p.label] || "#6B7280" }));
  }, [receitasPeriodo]);

  const statusFunnel = useMemo(() => {
    const map = new Map<string, number>();
    ordersPeriodo.forEach((o) => map.set(o.status, (map.get(o.status) || 0) + 1));
    const order = ["pendente", "confirmado", "em_producao", "pronto", "saiu_entrega", "concluido"];
    return order.filter((s) => map.has(s)).map((s) => ({ status: s, count: map.get(s) || 0, ...STATUS_CONFIG[s] }));
  }, [ordersPeriodo]);

  const peakHours = useMemo(() => {
    const map = new Map<number, { count: number; total: number }>();
    receitasPeriodo.forEach((t) => {
      if (!t.createdAt) return;
      const h = new Date(t.createdAt).getHours();
      const e = map.get(h) || { count: 0, total: 0 };
      e.count += 1;
      e.total += Number(t.valor) || 0;
      map.set(h, e);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  }, [receitasPeriodo]);

  const maxPeak = Math.max(...peakHours.map(([, v]) => v.count), 1);

  const selectCls = "rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-wine-500";
  const arrowCls = "flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white";

  return (
    <div className="space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendas & Entradas</h1>
          <p className="mt-1 text-sm text-neutral-400">Central de análises e rankings do período</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-neutral-800 p-0.5">
            {([["ano", "Ano"], ["mes", "Mês"], ["dia", "Dia"]] as const).map(([g, label]) => (
              <button
                key={g}
                onClick={() => changeGranularidade(g)}
                className={classNames(
                  "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all",
                  granularidade === g ? "bg-wine-500 text-white shadow" : "text-neutral-400 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => navigatePeriodo(-1)} className={arrowCls} aria-label="Período anterior">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center gap-1.5">
            {granularidade === "dia" && (
              <select value={diaAtual} onChange={(e) => setDiaAtual(Number(e.target.value))} className={selectCls} aria-label="Dia">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{String(d).padStart(2, "0")}</option>
                ))}
              </select>
            )}
            {granularidade !== "ano" && (
              <select value={mesAtual} onChange={(e) => changeMes(Number(e.target.value))} className={selectCls} aria-label="Mês">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m.slice(0, 3)}</option>)}
              </select>
            )}
            <select value={anoAtual} onChange={(e) => changeAno(Number(e.target.value))} className={selectCls} aria-label="Ano">
              {anosDisponiveis.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={() => navigatePeriodo(1)} className={arrowCls} aria-label="Próximo período">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* ═══════ KPI HERO CARDS ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-[#8B1D22]/35 bg-white p-5 shadow-sm dark:border-wine-500/20 dark:bg-gradient-to-br dark:from-wine-500/10 dark:via-neutral-900 dark:to-neutral-900">
          <div className="absolute -right-4 -top-4 hidden h-24 w-24 rounded-full bg-wine-500/10 dark:block" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-wine-400/70">Itens Vendidos</p>
          <p className="mt-2 text-3xl font-black text-stone-900 dark:text-wine-400">{totalItensVendidos}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-500">
            unidades no período{totalPesoKg > 0.05 ? ` · ${totalPesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg em bolos` : ""}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-[#8B1D22]/35 bg-white p-5 shadow-sm dark:border-emerald-500/30 dark:bg-neutral-900">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400/80">Faturamento (Recebido)</p>
          <p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-400">R$ {money(totalVendas)}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-500">recebido no período</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-[#8B1D22]/35 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-500">Pedidos Concluídos</p>
          <p className="mt-2 text-3xl font-black text-stone-900 dark:text-white">{ordersConcluidos.length}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-500">vendas no balcão</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-[#8B1D22]/35 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-neutral-500">Itens por Pedido</p>
          <p className="mt-2 text-3xl font-black text-stone-900 dark:text-white">{itensPorPedido.toFixed(1)}</p>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-500">média por cliente</p>
        </div>
      </div>

      {/* ═══════ SALES CHART ═══════ */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            {granularidade === "ano" ? "Vendas por Mês" : granularidade === "mes" ? "Vendas Diárias" : "Vendas por Hora"}
          </h3>
          <span className="text-xs text-neutral-500">
            Faturamento recebido — Pico: R$ {money(maxBar)}{granularidade === "ano" ? "/mês" : granularidade === "mes" ? "/dia" : "/hora"}
          </span>
        </div>
        <div className={classNames("flex h-32 items-end", chartData.length > 20 ? "gap-[2px]" : "gap-[3px]")}>
          {chartData.map((d) => (
            <div key={d.key} className="group relative flex-1">
              <div
                className={classNames(
                  "w-full rounded-t-sm transition-all duration-300",
                  d.total <= 0
                    ? "bg-stone-200 dark:bg-neutral-800"
                    : d.key === peakBarKey
                      ? "bg-[#8B1D22] dark:bg-[#8B1D22]"
                      : "bg-gradient-to-t from-wine-600 to-wine-400 group-hover:from-wine-500 group-hover:to-wine-300"
                )}
                style={{ height: `${Math.max(2, (d.total / maxBar) * 120)}px` }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] text-white shadow-lg group-hover:block">
                {d.tooltip}
              </div>
            </div>
          ))}
        </div>
        {granularidade === "ano" ? (
          <div className="mt-1.5 flex gap-[2px] text-[8px] text-neutral-600">
            {chartData.map((d) => <span key={d.key} className="flex-1 text-center">{d.label}</span>)}
          </div>
        ) : granularidade === "mes" ? (
          <div className="mt-1.5 flex justify-between text-[9px] text-neutral-600">
            <span>1</span>
            <span>{Math.ceil(chartData.length / 2)}</span>
            <span>{chartData.length}</span>
          </div>
        ) : (
          <div className="mt-1.5 flex justify-between text-[9px] text-neutral-600">
            <span>00h</span>
            <span>06h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
        )}
      </div>

      {/* ═══════ RANKINGS + BREAKDOWNS ═══════ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* TOP RANKINGS (tabs) */}
        <div className="lg:col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">Rankings do Período</h3>
            <div className="flex gap-1 rounded-lg bg-neutral-800 p-0.5">
              {([["produtos", "Produtos"], ["clientes", "Clientes"], ["categorias", "Por Categoria"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAbaAnalise(key)}
                  className={classNames(
                    "rounded-md px-3 py-1 text-[11px] font-semibold transition-all",
                    abaAnalise === key ? "bg-wine-500 text-white shadow" : "text-neutral-400 hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {abaAnalise === "produtos" && (
            topProdutos.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-500">Nenhum produto vendido neste período.</p>
            ) : (
              <div className="space-y-2.5">
                {topProdutos.map((p, idx) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className={classNames("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black", RANK_BADGES[idx] || RANK_BADGES[4])}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-xs font-semibold text-stone-800 dark:text-white">{p.name}</p>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="font-bold text-stone-700 dark:text-wine-400">{fmtUnKg(p.units, p.kg)}</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">R$ {money(p.revenue)}</span>
                          <span className="w-10 text-right text-stone-500 dark:text-neutral-500">{p.pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-wine-500 to-wine-400" style={{ width: `${Math.min(100, p.pct)}%` }} />
                      </div>                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {abaAnalise === "clientes" && (
            topClientes.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-500">Nenhum cliente neste período.</p>
            ) : (
              <div className="space-y-2.5">
                {topClientes.map((c, idx) => (
                  <div key={c.phone} className="flex items-center gap-3">
                    <span className={classNames("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black", RANK_BADGES[idx] || RANK_BADGES[4])}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-stone-800 dark:text-white">{c.name}</p>
                          {c.status === "Ativa" && <span className="rounded bg-yellow-500/15 px-1 py-0.5 text-[8px] font-bold text-amber-700 dark:text-yellow-400">VIP</span>}
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-stone-500 dark:text-neutral-500">{c.orders} pedido{c.orders !== 1 ? "s" : ""}</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">R$ {money(c.total)}</span>
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.min(100, c.pct)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {abaAnalise === "categorias" && (
            topPorCategoria.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-500">Nenhuma categoria neste período.</p>
            ) : (
              <div className="space-y-4">
                {topPorCategoria.map((cat) => (
                  <div key={cat.name} className="rounded-xl border border-[#8B1D22]/25 bg-stone-50 p-4 dark:border-neutral-800/60 dark:bg-neutral-950/50">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-stone-800 dark:text-white">{cat.name}</h4>
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] text-stone-700 dark:bg-neutral-800 dark:text-neutral-400">{fmtUnKg(cat.units, cat.kg)}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">R$ {money(cat.revenue)}</span>
                    </div>
                    {cat.products.length === 0 ? (
                      <p className="text-[11px] text-stone-500 dark:text-neutral-600">Nenhuma venda nesta categoria no período.</p>
                    ) : (
                      <div className="space-y-2">
                        {cat.products.map((p, idx) => (
                          <div key={p.name} className="flex items-center gap-2.5">
                            <span className={classNames("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black", RANK_BADGES[idx] || RANK_BADGES[4])}>
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <p className="truncate text-[11px] font-medium text-stone-800 dark:text-neutral-200">{p.name}</p>
                                <div className="flex shrink-0 items-center gap-3 text-[10px]">
                                  <span className="font-bold text-stone-700 dark:text-wine-400">{fmtUnKg(p.units, p.kg)}</span>
                                  <span className="font-bold text-emerald-700 dark:text-emerald-400">R$ {money(p.revenue)}</span>
                                </div>
                              </div>
                              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-wine-500 to-wine-400"
                                  style={{ width: `${cat.units > 0 ? Math.min(100, (p.units / cat.units) * 100) : 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* RIGHT COLUMN: Payment + Peak Hours + Funnel */}
        <div className="space-y-6">
          {/* Payment Breakdown */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-4 text-sm font-bold text-white">Formas de Pagamento</h3>
            {paymentBreakdown.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-500">Sem dados.</p>
            ) : (
              <div className="space-y-3">
                {paymentBreakdown.map((p) => (
                  <div key={p.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-neutral-300">{p.label}</span>
                      </div>
                      <span className="font-bold text-white">R$ {money(p.total)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800">
                        <div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                      </div>
                      <span className="w-10 text-right text-[10px] text-neutral-500">{p.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Peak Hours */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-4 text-sm font-bold text-white">Horários de Pico</h3>
            {peakHours.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-500">Sem dados.</p>
            ) : (
              <div className="space-y-2">
                {peakHours.map(([hour, data]) => (
                  <div key={hour} className="flex items-center gap-3">
                    <span className="w-12 text-xs font-bold text-neutral-400">{String(hour).padStart(2, "0")}:00</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${(data.count / maxPeak) * 100}%` }} />
                    </div>
                    <span className="w-14 text-right text-[11px] font-semibold text-white">{data.count} pedidos</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Funnel */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-4 text-sm font-bold text-white">Funil de Pedidos</h3>
            {statusFunnel.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-500">Sem dados.</p>
            ) : (
              <div className="space-y-2">
                {statusFunnel.map((s) => (
                  <div key={s.status} className="flex items-center justify-between rounded-lg bg-stone-100/70 px-3 py-2 dark:bg-neutral-950">
                    <span className={classNames("rounded-full px-2 py-0.5 text-[10px] font-semibold", s.cls)}>{s.label}</span>
                    <span className="text-sm font-bold text-stone-900 dark:text-white">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ FILTERS ═══════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <input
          type="text"
          placeholder="Buscar por cliente, telefone ou produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full sm:w-80 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500"
        />
        <div className="flex flex-wrap gap-2">
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white outline-none focus:border-wine-500">
            <option value="Todas">Todas as Seções</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filtroPagamento} onChange={(e) => setFiltroPagamento(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white outline-none focus:border-wine-500">
            <option value="Todas">Todas as Formas</option>
            <option value="PIX">PIX</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cartão Débito">Cartão Débito</option>
            <option value="Cartão Crédito">Cartão Crédito</option>
            <option value="Fiado">Fiado</option>
            <option value="Outros">Outros</option>
          </select>
        </div>
      </div>

      {/* ═══════ SALES TABLE ═══════ */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-5 py-4">
          <h3 className="text-sm font-bold text-white">Histórico de Vendas</h3>
          <p className="text-xs text-neutral-500">{filteredSales.length} registros encontrados</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Data & Hora</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Produtos / Itens</th>
                <th className="px-5 py-3">Seção</th>
                <th className="px-5 py-3">Pagamento</th>
                <th className="px-5 py-3 text-right">Total (R$)</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-neutral-500">
                    Nenhuma venda encontrada para este período ou filtro.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const d = new Date(sale.date);
                  const st = STATUS_CONFIG[sale.status] || { label: sale.status, cls: "bg-neutral-500/15 text-neutral-400" };
                  return (
                    <tr key={sale.id} className="transition-colors hover:bg-neutral-800/30">
                      <td className="px-5 py-3.5 text-xs text-neutral-300">
                        {d.toLocaleDateString("pt-BR")} <span className="text-neutral-500">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-semibold text-white">{sale.customerName}</p>
                        <p className="text-[10px] text-neutral-500">{sale.customerPhone}</p>
                      </td>
                      <td className="max-w-[240px] px-5 py-3.5 text-xs text-neutral-300">
                        <div className="space-y-0.5">
                          {sale.itemsList.map((it, i) => (
                            <p key={i} className="leading-snug">{it}</p>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700 dark:bg-neutral-800 dark:text-neutral-300">{sale.categoryName}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-semibold" style={{ color: PAYMENT_COLORS[sale.paymentMethod] || "#a3a3a3" }}>
                        {sale.paymentMethod}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-bold text-emerald-400">R$ {money(sale.total)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={classNames("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
