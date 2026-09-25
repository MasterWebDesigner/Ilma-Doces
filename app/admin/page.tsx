"use client";

import { useState } from "react";
import { useOrderStore } from "@/lib/store";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { getLocalDateStr } from "@/lib/utils";
import { sumReceitasByDate, filterUnpaidOrders, orderRemaining } from "@/lib/faturamento";
import type { OrderStatus } from "@/types/database";
import QuickSaleModal from "@/components/admin/QuickSaleModal";

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-amber-500/15 text-amber-400" },
  confirmado: { label: "Confirmado", color: "bg-blue-500/15 text-blue-400" },
  em_producao: { label: "Em Producao", color: "bg-purple-500/15 text-purple-400" },
  pronto: { label: "Pronto", color: "bg-blue-500/15 text-blue-400" },
  saiu_entrega: { label: "Saiu p/ Entrega", color: "bg-cyan-500/15 text-cyan-400" },
  concluido: { label: "Concluido", color: "bg-emerald-500/15 text-emerald-400" },
};

export default function AdminDashboard() {
  const orders = useOrderStore((s) => s.orders);
  const transactions = useFinanceiroStore((s) => s.transactions);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);

  const today = getLocalDateStr();
  const todayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === today);
  const completed = todayOrders.filter((o) => o.status === "concluido").length;
  const pending = todayOrders.filter((o) => o.status !== "concluido").length;
  const todayRevenue = sumReceitasByDate(transactions, today);
  const todayPrevisto = filterUnpaidOrders(orders, today).reduce((s, o) => s + orderRemaining(o), 0);
  const pendentes = todayOrders.filter((o) => o.status === "pendente" || o.status === "em_producao");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">Visao geral da confeitaria</p>
        </div>
        <button
          onClick={() => setQuickSaleOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600"
        >
          ⚡ + Venda Rápida (Balcão)
        </button>
      </div>

      <QuickSaleModal isOpen={quickSaleOpen} onClose={() => setQuickSaleOpen(false)} />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pedidos do Dia</p>
          <p className="mt-2 text-3xl font-bold text-white">{todayOrders.length}</p>
          <p className="mt-1 text-xs text-emerald-400">{completed} concluidos - {pending} pendentes</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Faturamento Hoje</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {todayRevenue.toFixed(2).replace(".", ",")}</p>
          <p className="mt-1 text-xs text-blue-400">Previsto: R$ {todayPrevisto.toFixed(2).replace(".", ",")}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total de Pedidos</p>
          <p className="mt-2 text-3xl font-bold text-white">{orders.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Encomendas Pendentes</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">{pendentes.length}</p>
          <p className="mt-1 text-xs text-neutral-500">Aguardando producao</p>
        </div>
      </div>

      {/* Production List */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <h3 className="text-base font-semibold text-white">Producao do Dia</h3>
          <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-400">
            {todayOrders.length} pedidos
          </span>
        </div>
        {todayOrders.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <p className="text-sm">Nenhum pedido hoje.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {todayOrders.map((order) => {
              const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pendente;
              return (
                <div key={order.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-neutral-800/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{order.customerName}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {order.items.map((i, idx) => (
                        <p key={idx} className="text-xs text-neutral-500">
                          {i.product.name} x{i.quantity}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">R$ {order.total.toFixed(2).replace(".", ",")}</p>
                    <p className="text-[10px] text-neutral-500">
                      Retirada
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/55${order.customerPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                  >
                    WhatsApp
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
