"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrderStore, useCustomerStore, useProductStore } from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import type { CompraItem } from "@/types/database";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { confirmOrderWhatsApp } from "@/lib/whatsapp";
import { useNotificationStore, playNotificationSound } from "@/lib/notifications";
import { formatCurrency, getLocalDateStr, formatItemQty, paymentLabelOf } from "@/lib/utils";
import { itemLineTotal } from "@/lib/brinde";
import { sumReceitasByDate, filterUnpaidOrders, orderRemaining } from "@/lib/faturamento";
import type { Order, OrderStatus, PaymentMethod, CartItem, Product } from "@/types/database";
import { formatarTelefone } from "@/lib/phone";

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-amber-500/15 text-amber-400" },
  confirmado: { label: "Confirmado", color: "bg-blue-500/15 text-blue-400" },
  em_producao: { label: "Em Produção", color: "bg-purple-500/15 text-purple-400" },
  pronto: { label: "Pronto", color: "bg-blue-500/15 text-blue-400" },
  saiu_entrega: { label: "Saiu Entrega", color: "bg-blue-500/15 text-blue-400" },
  concluido: { label: "Concluído", color: "bg-emerald-500/15 text-emerald-400" },
};

const PEDIDOS_PAGE_SIZE = 15;

export default function AdminPedidos() {
  const { orders, updateStatus, updateOrder } = useOrderStore();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pagePedidos, setPagePedidos] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [sinalOrder, setSinalOrder] = useState<Order | null>(null);
  const [pesoRealInputs, setPesoRealInputs] = useState<Record<string, string>>({});

  const customers = useCustomerStore((s) => s.customers);
  const products = useProductStore((s) => s.products);
  const addOrder = useOrderStore((s) => s.addOrder);
  const addTransaction = useFinanceiroStore((s) => s.addTransaction);
  const transactions = useFinanceiroStore((s) => s.transactions);

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [selectedProdId, setSelectedProdId] = useState("");
  const [qtdItem, setQtdItem] = useState(1);
  const [itensManual, setItensManual] = useState<CartItem[]>([]);
  const [scheduledDate, setScheduledDate] = useState(getLocalDateStr());
  const [scheduledTime, setScheduledTime] = useState("14:00");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [valorSinalManual, setValorSinalManual] = useState("");
  const [formaSinalManual, setFormaSinalManual] = useState<PaymentMethod>("pix");
  const [generalNotes, setGeneralNotes] = useState("");

  const selectedProd = products.find((p) => p.id === selectedProdId);
  const addingWeight = !!selectedProd?.isCustomWeight;

  function adicionarItemManual() {
    if (!selectedProdId) return;
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;
    const qty = prod.isCustomWeight ? Math.max(0.1, Math.round(qtdItem * 10) / 10) : Math.max(1, Math.round(qtdItem));
    setItensManual((prev) => {
      const existing = prev.find((i) => i.product.id === prod.id);
      if (existing) {
        return prev.map((i) => (i.product.id === prod.id ? { ...i, quantity: i.quantity + qty } : i));
      }
      return [...prev, { product: prod, quantity: qty }];
    });
    setSelectedProdId("");
    setQtdItem(1);
  }

  function removerItemManual(prodId: string) {
    setItensManual((prev) => prev.filter((i) => i.product.id !== prodId));
  }

  function handleCreateManualOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClienteId) {
      alert("Selecione um cliente cadastrado.");
      return;
    }
    if (itensManual.length === 0) {
      alert("Adicione pelo menos um item ao pedido.");
      return;
    }
    const cust = customers.find((c) => c.id === selectedClienteId);
    if (!cust) return;

    const total = itensManual.reduce((sum, i) => sum + itemLineTotal(i), 0);
    const sinalNum = parseFloat(valorSinalManual.replace(",", ".")) || 0;

    const newOrder = addOrder({
      customerName: cust.name,
      customerPhone: cust.phone,
      items: itensManual,
      total,
      deliveryType: "retirada",
      scheduledDate,
      scheduledTime,
      paymentMethod,
      generalNotes,
      valorPagoSinal: sinalNum > 0 ? sinalNum : undefined,
      formaPagamentoSinal: sinalNum > 0 ? formaSinalManual : undefined,
      origem: "manual",
    });

    if (sinalNum > 0) {
      addTransaction({
        tipo: 'RECEITA',
        categoria: 'Sinal de Encomenda',
        valor: sinalNum,
        formaPagamento: paymentLabelOf(formaSinalManual),
        descricao: `Sinal de Produção (Pedido #${newOrder.orderNumber || newOrder.id.slice(-6)}) — ${cust.name}`,
        data: getLocalDateStr(),
      });
    }

    setManualModalOpen(false);
    setSelectedClienteId("");
    setItensManual([]);
    setValorSinalManual("");
    setGeneralNotes("");
  }

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.status === filterStatus || (filterStatus === "confirmado" && o.status !== "pendente" && o.status !== "concluido");
    const matchType = filterType === "all" || o.deliveryType === filterType;
    const q = search.toLowerCase();
    const matchSearch = !q || o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q);
    return matchStatus && matchType && matchSearch;
  });

  const totalPaginasPedidos = Math.ceil(filtered.length / PEDIDOS_PAGE_SIZE) || 1;
  const pagePedidosSafe = Math.min(pagePedidos, totalPaginasPedidos);
  const pedidosPaginados = filtered.slice((pagePedidosSafe - 1) * PEDIDOS_PAGE_SIZE, pagePedidosSafe * PEDIDOS_PAGE_SIZE);

  const today = getLocalDateStr();
  const todayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === today);
  const todayRevenue = sumReceitasByDate(transactions, today);
  const todayPrevisto = filterUnpaidOrders(orders, today).reduce((s, o) => s + orderRemaining(o), 0);
  const pendentes = orders.filter((o) => o.status === "pendente").length;
  const concluidosHoje = todayOrders.filter((o) => o.status === "concluido").length;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function confirmarPesoReal(order: Order) {
    const raw = pesoRealInputs[order.id] ?? String(order.peso_real_kg ?? order.items.find((i) => i.product.isCustomWeight)?.quantity ?? "");
    const pesoReal = Math.round((parseFloat(raw.replace(",", ".")) || 0) * 10) / 10;
    if (!pesoReal || pesoReal < 0.1) return;
    const customIdx = order.items.findIndex((i) => i.product.isCustomWeight);
    if (customIdx < 0) return;

    const newItems = order.items.map((it, idx) => (idx === customIdx ? { ...it, quantity: pesoReal } : it));
    const newTotal = newItems.reduce((s, it) => s + itemLineTotal(it), 0);

    updateOrder(order.id, {
      items: newItems,
      total: newTotal,
      peso_real_kg: pesoReal,
      status: "confirmado",
    });

    confirmOrderWhatsApp({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryType: order.deliveryType,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      items: newItems,
      total: newTotal,
    });

    useNotificationStore.getState().addNotification({
      title: "Pedido Confirmado",
      message: `${order.customerName} — peso real ${pesoReal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg — ${formatCurrency(newTotal)}`,
      type: "order",
    });
    playNotificationSound();

    setPesoRealInputs((m) => {
      const next = { ...m };
      delete next[order.id];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pedidos</h1>
          <p className="mt-1 text-sm text-neutral-400">{orders.length} pedidos no total.</p>
        </div>
        <button
          onClick={() => setManualModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600"
        >
          + Criar Pedido Manual
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pedidos Hoje</p>
          <p className="mt-2 text-3xl font-bold text-white">{todayOrders.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Faturamento Hoje</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">R$ {todayRevenue.toFixed(2).replace(".", ",")}</p>
          <p className="mt-1 text-xs text-blue-400">Previsto: R$ {todayPrevisto.toFixed(2).replace(".", ",")}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pendentes</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">{pendentes}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Concluídos Hoje</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">{concluidosHoje}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPagePedidos(1); }}
          className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
        />
        <div className="flex gap-2 flex-wrap">
          {["all", "pendente", "confirmado", "concluido"].map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPagePedidos(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                filterStatus === s ? "bg-wine-500 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              {s === "all" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          <p className="text-lg font-semibold">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {pedidosPaginados.map((order) => {
            const status = STATUS_CONFIG[order.status];
            const isExpanded = expandedId === order.id;
            return (
              <div key={order.id} className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
                {/* Order Header */}
                <div
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors hover:bg-neutral-800/30"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{order.customerName}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                        {order.deliveryType === "entrega" ? "Entrega" : "Retirada"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${order.origem === "manual" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
                        {order.origem === "manual" ? "Manual" : "Site / Automático"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500 truncate">
                      {order.items.map((i) => `${i.product.name} ${formatItemQty(i.quantity, i.product.isCustomWeight)}`).join(", ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">R$ {order.total.toFixed(2).replace(".", ",")}</p>
                    <p className="text-[10px] text-neutral-500">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.valorPagoSinal ? (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-400">
                        Sinal: {formatCurrency(order.valorPagoSinal)} ({order.formaPagamentoSinal?.toUpperCase()})
                      </span>
                    ) : order.status !== "concluido" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSinalOrder(order);
                        }}
                        className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25"
                      >
                        Registrar Sinal / Produção
                      </button>
                    ) : null}

                    {order.status === "pendente" && !order.valorPagoSinal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmOrderWhatsApp({
                            customerName: order.customerName,
                            customerPhone: order.customerPhone,
                            deliveryType: order.deliveryType,
                            scheduledDate: order.scheduledDate,
                            scheduledTime: order.scheduledTime,
                            items: order.items,
                            total: order.total,
                          });
                          updateStatus(order.id, "confirmado");
                        }}
                        className="rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
                      >
                        Confirmar
                      </button>
                    )}
                    {order.status !== "concluido" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditOrder(order);
                        }}
                        className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                      >
                        Finalizar Pedido
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingOrder(order);
                      }}
                      className="rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
                    >
                      Editar
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-neutral-800 px-6 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Telefone</p>
                        <p className="mt-1 text-white">{formatarTelefone(order.customerPhone)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Pagamento</p>
                        <p className="mt-1 text-white">
                          {order.isFiado ? "Fiado / A Pagar" : paymentLabelOf(order.paymentMethod)}
                        </p>
                      </div>
                      {order.scheduledDate && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Data Agendada</p>
                          <p className="mt-1 text-white">{order.scheduledDate} {order.scheduledTime || ""}</p>
                        </div>
                      )}
                      {order.address && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Endereço de Entrega</p>
                          <p className="mt-1 text-white">{order.address}</p>
                        </div>
                      )}
                      {order.trocoPara && order.trocoPara > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Troco Para</p>
                          <p className="mt-1 text-white">R$ {order.trocoPara.toFixed(2).replace(".", ",")}</p>
                        </div>
                      )}
                      {order.generalNotes && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Observações</p>
                          <p className="mt-1 text-white">{order.generalNotes}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Itens</p>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div
                            key={idx}
                            className={`flex justify-between text-sm rounded-md px-2 py-1 ${
                              item.is_brinde
                                ? "bg-emerald-500/10 border border-emerald-500/30"
                                : ""
                            }`}
                          >
                            <span className={item.is_brinde ? "text-emerald-300 font-semibold" : "text-neutral-300"}>
                              {item.is_brinde && (
                                <span className="mr-1.5 rounded bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                  🎁 BRINDE FIDELIDADE
                                </span>
                              )}
                              {item.product.name} {formatItemQty(item.quantity, item.product.isCustomWeight)}{item.notes ? ` (${item.notes})` : ""}
                            </span>
                            {item.is_brinde ? (
                              <span className="text-emerald-400 whitespace-nowrap">
                                <span className="mr-1 text-neutral-500 line-through">{formatCurrency(item.product.price)}</span>
                                R$ 0,00
                              </span>
                            ) : (
                              <span className="text-emerald-400">R$ {itemLineTotal(item).toFixed(2).replace(".", ",")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between border-t border-neutral-800 pt-2 text-sm font-bold">
                        <span className="text-white">Total</span>
                        <span className="text-emerald-400">R$ {order.total.toFixed(2).replace(".", ",")}</span>
                      </div>
                      {order.peso_real_kg !== undefined && (
                        <p className="mt-2 rounded-lg bg-blue-500/10 border border-blue-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300">
                          ⚖️ Peso real confirmado: {order.peso_real_kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                        </p>
                      )}
                    </div>

                    {order.status === "pendente" && order.items.some((i) => i.product.isCustomWeight) && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">⚖️ Peso Real do Bolo (kg) — Aprovação Obrigatória</p>
                          <p className="mt-1 text-xs text-amber-200/70">
                            Confira na balança, informe o peso final. O total será recalculado, o pedido virará Confirmado e o cliente será avisado do valor final.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pesoRealInputs[order.id] ?? order.peso_real_kg ?? order.items.find((i) => i.product.isCustomWeight)?.quantity ?? 1}
                            onChange={(e) => setPesoRealInputs((m) => ({ ...m, [order.id]: e.target.value }))}
                            className="w-32 rounded-lg border border-amber-500/50 bg-neutral-950 px-3 py-2 text-sm font-bold text-amber-400 outline-none focus:border-amber-400"
                            title="Peso real (kg)"
                          />
                          <span className="text-xs font-semibold text-amber-400">kg</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmarPesoReal(order);
                            }}
                            className="ml-auto rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-neutral-950 transition-colors hover:bg-amber-400"
                          >
                            Confirmar Peso & Aprovar Pedido
                          </button>
                        </div>
                        <div className="flex justify-between border-t border-amber-500/20 pt-2 text-[11px]">
                          <span className="text-amber-200/60">Peso solicitado pelo cliente</span>
                          <span className="font-semibold text-white">
                            {formatItemQty(order.items.find((i) => i.product.isCustomWeight)?.quantity ?? 0, true)}
                          </span>
                        </div>
                      </div>
                    )}

                    <a
                      href={`https://wa.me/55${order.customerPhone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {totalPaginasPedidos > 1 && (
          <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 px-6 py-3 text-xs text-neutral-400">
            <span>Página {pagePedidosSafe} de {totalPaginasPedidos}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPagePedidos((p) => Math.max(1, p - 1))}
                disabled={pagePedidosSafe === 1}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagePedidos((p) => Math.min(totalPaginasPedidos, p + 1))}
                disabled={pagePedidosSafe === totalPaginasPedidos}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 font-medium text-white disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Finalize / Edit Modal */}
      {editOrder && (
        <FinalizeOrderModal order={editOrder} onClose={() => setEditOrder(null)} />
      )}
      {editingOrder && (
        <EditOrderModal order={editingOrder} onClose={() => setEditingOrder(null)} />
      )}
      {sinalOrder && (
        <RegistrarSinalModal order={sinalOrder} onClose={() => setSinalOrder(null)} />
      )}

      {/* Modal Criar Pedido Manual */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold text-white">Criar Pedido Manual</h3>
              <button onClick={() => setManualModalOpen(false)} className="text-neutral-500 hover:text-white text-xl">✕</button>
            </div>
            <form onSubmit={handleCreateManualOrder} className="space-y-4">
              {customers.length === 0 ? (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-center space-y-3">
                  <p className="text-xs text-amber-300">Nenhum cliente cadastrado. Cadastre o cliente em &apos;Clientes&apos; antes de criar um pedido.</p>
                  <Link href="/admin/clientes" className="inline-block rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-amber-400">
                    Cadastrar Cliente
                  </Link>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Selecionar Cliente Cadastrado *</label>
                  <select
                    required
                    value={selectedClienteId}
                    onChange={(e) => setSelectedClienteId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  >
                    <option value="">Selecione um cliente...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({formatarTelefone(c.phone)})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t border-neutral-800 pt-3 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Adicionar Itens ao Pedido</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <select
                      value={selectedProdId}
                      onChange={(e) => setSelectedProdId(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="">Selecione o produto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} (R$ {p.price.toFixed(2).replace(".", ",")}{p.isCustomWeight ? "/kg" : ""})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={addingWeight ? "0.1" : "1"}
                      step={addingWeight ? "0.1" : "1"}
                      value={qtdItem}
                      onChange={(e) => setQtdItem(parseFloat(e.target.value.replace(",", ".")) || 1)}
                      className="w-20 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white text-center outline-none"
                      title={addingWeight ? "Peso (kg)" : "Quantidade"}
                      placeholder={addingWeight ? "kg" : "qtd"}
                    />
                    <button
                      type="button"
                      onClick={adicionarItemManual}
                      className="flex-1 rounded-lg bg-wine-500 px-3 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                    >
                      {addingWeight ? "+ Adicionar kg" : "+ Adicionar"}
                    </button>
                  </div>
                </div>

                {itensManual.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2 max-h-40 overflow-y-auto">
                    {itensManual.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-neutral-300 bg-neutral-900 p-2 rounded-lg">
                        <span>{item.product.isCustomWeight ? `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : `${item.quantity}x`} {item.product.name} (R$ {itemLineTotal(item).toFixed(2).replace(".", ",")})</span>
                        <button type="button" onClick={() => removerItemManual(item.product.id)} className="text-red-400 hover:text-red-300 text-xs">Excluir</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-neutral-800 pt-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Entrega / Retirada</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Horário Previsto</label>
                  <input
                    type="text"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    placeholder="Ex: 14:00"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none uppercase"
                  >
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartão Débito</option>
                    <option value="cartao_credito">Cartão Crédito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Valor do Sinal / Parcial (R$)</label>
                  <input
                    type="text"
                    value={valorSinalManual}
                    onChange={(e) => setValorSinalManual(e.target.value)}
                    placeholder="Opcional (Ex: 20,00)"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              {parseFloat(valorSinalManual.replace(",", ".")) > 0 && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Forma de Pagamento do Sinal</label>
                  <select
                    value={formaSinalManual}
                    onChange={(e) => setFormaSinalManual(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none uppercase"
                  >
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartão Débito</option>
                    <option value="cartao_credito">Cartão Crédito</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Observações Gerais</label>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  placeholder="Observações do pedido..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-sm text-white focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setManualModalOpen(false)} className="flex-1 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button type="submit" className="flex-1 rounded-xl bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 hover:bg-wine-600">Criar Pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RegistrarSinalModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrder } = useOrderStore();
  const { addTransaction } = useFinanceiroStore();
  const [valorSinal, setValorSinal] = useState(Math.round((order.total / 2) * 100) / 100);
  const [formaPagamentoSinal, setFormaPagamentoSinal] = useState<PaymentMethod>("pix");

  function handleSalvarSinal() {
    updateOrder(order.id, {
      status: "em_producao",
      valorPagoSinal: valorSinal,
      formaPagamentoSinal,
    });

    if (valorSinal > 0) {
      addTransaction({
        tipo: 'RECEITA',
        categoria: 'Sinal de Encomenda',
        valor: valorSinal,
        formaPagamento: paymentLabelOf(formaPagamentoSinal),
        descricao: `Sinal de Produção (Pedido #${order.orderNumber || order.id.slice(-6)}) — ${order.customerName}`,
        data: getLocalDateStr(),
      });
    }

    confirmOrderWhatsApp({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryType: order.deliveryType,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      items: order.items,
      total: order.total,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Registrar Sinal & Confirmar Produção</h2>
            <p className="text-xs text-neutral-400">#{order.orderNumber || order.id.slice(-8)} • {order.customerName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between text-sm bg-neutral-950 p-3 rounded-xl border border-neutral-800">
            <span className="text-neutral-400">Valor Total do Pedido:</span>
            <span className="font-bold text-emerald-400">{formatCurrency(order.total)}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1">Valor do Sinal (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={order.total}
              value={valorSinal}
              onChange={(e) => setValorSinal(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-bold text-amber-400 focus:outline-none"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Sugerido: 50% ({formatCurrency(order.total / 2)})</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1">Forma de Pagamento do Sinal</label>
            <select
              value={formaPagamentoSinal}
              onChange={(e) => setFormaPagamentoSinal(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="cartao_credito">Cartão de Crédito</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4 bg-neutral-950">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-800">
            Cancelar
          </button>
          <button onClick={handleSalvarSinal} className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-bold text-white hover:bg-wine-600">
            Confirmar e Iniciar Produção
          </button>
        </div>
      </div>
    </div>
  );
}

function EditOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrder } = useOrderStore();
  const products = useProductStore((s) => s.products);

  const [items, setItems] = useState<CartItem[]>(order.items.map((i) => ({ ...i })));
  const [total, setTotal] = useState(order.total);
  const [scheduledDate, setScheduledDate] = useState(order.scheduledDate || getLocalDateStr());
  const [scheduledTime, setScheduledTime] = useState(order.scheduledTime || "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [generalNotes, setGeneralNotes] = useState(order.generalNotes || "");
  const [addProdId, setAddProdId] = useState("");
  const [addQty, setAddQty] = useState(1);

  const addProd = products.find((p) => p.id === addProdId);
  const addingWeight = !!addProd?.isCustomWeight;

  function applyItems(updated: CartItem[]) {
    setItems(updated);
    setTotal(updated.reduce((acc, i) => acc + itemLineTotal(i), 0));
  }

  function handleQtyChange(idx: number, qty: number) {
    const isWeight = items[idx].product.isCustomWeight;
    const valid = isWeight
      ? Math.max(0.1, Math.round((qty || 0.1) * 10) / 10)
      : Math.max(1, Math.round(qty) || 1);
    const updated = [...items];
    updated[idx] = { ...updated[idx], quantity: valid };
    applyItems(updated);
  }

  function handleItemTotalPriceChange(idx: number, totalPrice: number) {
    const qty = items[idx].quantity || 1;
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      product: { ...updated[idx].product, price: Math.max(0, totalPrice / qty) },
    };
    applyItems(updated);
  }

  function handleRemoveItem(idx: number) {
    applyItems(items.filter((_, i) => i !== idx));
  }

  function handleAddItem() {
    if (!addProd) return;
    const qty = addProd.isCustomWeight ? Math.max(0.1, Math.round((addQty || 0.1) * 10) / 10) : Math.max(1, Math.round(addQty));
    const existing = items.find((i) => i.product.id === addProd.id);
    const updated = existing
      ? items.map((i) => (i.product.id === addProd.id ? { ...i, quantity: i.quantity + qty } : i))
      : [...items, { product: addProd, quantity: qty }];
    applyItems(updated);
    setAddProdId("");
    setAddQty(1);
  }

  function handleSave() {
    if (items.length === 0) {
      alert("O pedido precisa de pelo menos um item.");
      return;
    }
    updateOrder(order.id, {
      items,
      total,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
      paymentMethod,
      generalNotes: generalNotes || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Editar Pedido</h2>
            <p className="text-xs text-neutral-400">#{order.orderNumber || order.id.slice(-8)} • {order.customerName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Itens */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Itens do Pedido</label>
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              {items.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-2">Nenhum item. Adicione abaixo.</p>
              )}
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{item.product.name}</p>
                    {item.is_brinde && (
                      <span className="inline-block mt-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/30">
                        🎁 BRINDE FIDELIDADE — R$ 0,00
                      </span>
                    )}
                    {item.product.isCustomWeight && (
                      <span className="inline-block mt-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/25">
                        ⚖️ Peso por quilo
                      </span>
                    )}
                  </div>
                  <div className="w-24 text-center">
                    <label className="block text-[9px] text-neutral-400 mb-0.5">
                      {item.product.isCustomWeight ? "Peso (kg)" : "Qtd"}
                    </label>
                    <input
                      type="number"
                      step={item.product.isCustomWeight ? "0.1" : "1"}
                      min={item.product.isCustomWeight ? "0.1" : "1"}
                      value={item.quantity}
                      onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value.replace(",", ".")) || 1)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs font-bold text-white text-center focus:border-wine-500 focus:outline-none"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-[9px] text-neutral-400 mb-0.5">Preço Total (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.is_brinde ? 0 : Math.round(item.product.price * item.quantity * 100) / 100}
                      disabled={item.is_brinde || !item.product.isCustomWeight}
                      onChange={(e) => handleItemTotalPriceChange(idx, parseFloat(e.target.value.replace(",", ".")) || 0)}
                      className={`w-full rounded-lg border px-2 py-1 text-xs font-bold text-right focus:outline-none ${
                        item.is_brinde
                          ? "border-emerald-500/40 bg-neutral-950 text-emerald-400 cursor-not-allowed"
                          : item.product.isCustomWeight
                          ? "border-amber-500/50 bg-neutral-950 text-amber-400 cursor-text"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-400 cursor-not-allowed"
                      }`}
                      title={item.is_brinde ? "Brinde de fidelidade — R$ 0,00" : item.product.isCustomWeight ? "Preço total ajustável" : "Somente produtos com ajuste de peso/valor"}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-red-400 hover:text-red-300 text-xs font-bold px-1"
                    title="Remover item"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Adicionar item */}
              <div className="flex gap-2 border-t border-neutral-800 pt-3">
                <select
                  value={addProdId}
                  onChange={(e) => { setAddProdId(e.target.value); setAddQty(1); }}
                  className="flex-1 min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-wine-500"
                >
                  <option value="">Adicionar produto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (R$ {p.price.toFixed(2).replace(".", ",")}{p.isCustomWeight ? "/kg" : ""})</option>
                  ))}
                </select>
                <input
                  type="number"
                  step={addingWeight ? "0.1" : "1"}
                  min={addingWeight ? "0.1" : "1"}
                  value={addQty}
                  onChange={(e) => setAddQty(parseFloat(e.target.value.replace(",", ".")) || 1)}
                  className="w-16 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-xs text-white text-center outline-none focus:border-wine-500"
                  title={addingWeight ? "Peso (kg)" : "Quantidade"}
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!addProd}
                  className="rounded-lg bg-wine-500 px-3 py-2 text-xs font-semibold text-white hover:bg-wine-600 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Agendamento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Data</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Horário</label>
              <input
                type="text"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                placeholder="Ex: 14:00"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Forma de Pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:outline-none"
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_debito">Cartão Débito</option>
              <option value="cartao_credito">Cartão Crédito</option>
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Observações Gerais</label>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={2}
              placeholder="Observações do pedido..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:outline-none"
            />
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-xl bg-wine-500/10 border border-wine-500/30 px-4 py-3">
            <span className="text-xs font-bold text-wine-300 uppercase">Total do Pedido (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
              className="w-36 rounded-lg border border-wine-500/50 bg-neutral-950 px-3 py-1.5 text-base font-bold text-emerald-400 text-right focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4 bg-neutral-950">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800">
            Cancelar
          </button>
          <button onClick={handleSave} className="rounded-xl bg-wine-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-wine-600">
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}

function FinalizeOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrder } = useOrderStore();
  const { converterPedidoParaFiado } = useCredoresStore();
  const { addTransaction } = useFinanceiroStore();
  const customerStore = useCustomerStore();

  const [items, setItems] = useState(order.items.map(i => ({ ...i })));
  const [total, setTotal] = useState(order.total);
  const [destino, setDestino] = useState<"recebido_agora" | "fiado">(order.isFiado ? "fiado" : "recebido_agora");
  const [formaPagamento, setFormaPagamento] = useState<PaymentMethod>(order.isFiado ? "pix" : order.paymentMethod);
  const [dataEntrada, setDataEntrada] = useState(getLocalDateStr());
  const [dataVencimento, setDataVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return getLocalDateStr(d);
  });

  const sinalJaPago = order.valorPagoSinal || 0;
  const saldoRestante = Math.max(0, total - sinalJaPago);

  function handleItemTotalPriceChange(idx: number, totalPrice: number) {
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      product: { ...updated[idx].product, price: Math.max(0, totalPrice / (updated[idx].quantity || 1)) }
    };
    setItems(updated);
    const newTotal = updated.reduce((acc, i) => acc + itemLineTotal(i), 0);
    setTotal(newTotal);
  }

  function handleItemQuantityChange(idx: number, qty: number) {
    const isWeight = items[idx].product.isCustomWeight;
    const safe = isWeight
      ? Math.max(0.1, Math.round((qty || 0.1) * 10) / 10)
      : Math.max(0.1, qty);
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      quantity: safe,
    };
    setItems(updated);
    const newTotal = updated.reduce((acc, i) => acc + itemLineTotal(i), 0);
    setTotal(newTotal);
  }

  function handleFinalizar() {
    const isFiado = destino === "fiado";
    const fullyPaidBySinal = isFiado && saldoRestante <= 0;

    if (fullyPaidBySinal) {
      updateOrder(order.id, {
        items,
        total,
        paymentMethod: (formaPagamento as any),
        status: "concluido",
        isFiado: false,
        dataPagamento: dataEntrada,
      });
      onClose();
      return;
    }

    updateOrder(order.id, {
      items,
      total,
      paymentMethod: (formaPagamento as any),
      status: isFiado ? "confirmado" : "concluido",
      isFiado: isFiado || undefined,
      ...(isFiado ? {} : { dataPagamento: dataEntrada }),
    });

    if (destino === "fiado") {
      const cleanPhone = order.customerPhone.replace(/\D/g, "");
      let existingCustomer = customerStore.getCustomerByPhone(cleanPhone) || customerStore.customers.find(c => c.name.toLowerCase() === order.customerName.toLowerCase());

      if (!existingCustomer) {
        customerStore.upsertCustomer(order.customerName, order.customerPhone, undefined);
        existingCustomer = customerStore.getCustomerByPhone(cleanPhone) || customerStore.customers.find(c => c.name.toLowerCase() === order.customerName.toLowerCase());
      }

      if (!existingCustomer) {
        alert("Não foi possível vincular o cliente. Verifique o cadastro.");
        return;
      }

      const itensCompra: CompraItem[] = items.map(i => ({
        descricao: i.product.name,
        quantidade: i.quantity,
        valorUnitario: i.product.price,
      }));
      const descricaoItens = itensCompra.map(i => `${i.quantidade}x ${i.descricao}`).join(", ");

      converterPedidoParaFiado({
        clienteId: existingCustomer.id,
        nomeCliente: order.customerName,
        whatsappCliente: order.customerPhone,
        pedidoId: order.id,
        origem: "pedido",
        descricaoItens,
        valorTotal: total,
        dataPedido: dataEntrada,
        dataPrometida: dataVencimento,
        itens: itensCompra,
        sinal: sinalJaPago > 0 ? { valor: sinalJaPago, formaPagamento: order.formaPagamentoSinal || "pix" } : undefined,
      });
    } else {
      if (saldoRestante > 0) {
        addTransaction({
          tipo: 'RECEITA',
          categoria: 'Vendas / Pedidos',
          valor: saldoRestante,
          formaPagamento: paymentLabelOf(formaPagamento),
          descricao: sinalJaPago > 0 ? `Saldo Pedido #${order.orderNumber || order.id.slice(-6)} — ${order.customerName}` : `Pedido #${order.orderNumber || order.id.slice(-6)} — ${order.customerName}`,
          data: dataEntrada,
        });
      }
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Finalizar Pedido & Edição Total</h2>
            <p className="text-xs text-neutral-400">#{order.orderNumber || order.id.slice(-8)} • {order.customerName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Itens do Pedido (Editáveis com Fracionado / Peso) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Itens, Peso Fracionado (kg) & Preços (Snapshot)</label>
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{item.product.name}</p>
                    {item.is_brinde && (
                      <span className="inline-block mt-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/30">
                        🎁 BRINDE FIDELIDADE — R$ 0,00
                      </span>
                    )}
                    {item.product.isCustomWeight && (
                      <span className="inline-block mt-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/25">
                        ⚖️ Ajustável (Peso/Valor)
                      </span>
                    )}
                  </div>
                  <div className="w-24 text-center">
                    <label className="block text-[9px] text-neutral-400 mb-0.5">
                      {item.product.isCustomWeight ? "Peso / Qtd (kg)" : "Qtd"}
                    </label>
                    {item.product.isCustomWeight ? (
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={item.quantity}
                        onChange={(e) => handleItemQuantityChange(idx, parseFloat(e.target.value.replace(",", ".")) || 0.1)}
                        className="w-full rounded-lg border border-amber-500/50 bg-neutral-950 px-2 py-1 text-xs text-amber-400 font-bold text-center focus:outline-none"
                        title="Ajustar peso ou quantidade"
                      />
                    ) : (
                      <span className="text-xs font-bold text-white px-2 py-1 bg-neutral-950 rounded-lg block">{item.quantity}</span>
                    )}
                  </div>
                  <div className="w-32">
                    <label className="block text-[9px] text-neutral-400 mb-0.5">Preço Total (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.is_brinde ? 0 : Math.round(item.product.price * item.quantity * 100) / 100}
                      disabled={item.is_brinde || !item.product.isCustomWeight}
                      onChange={(e) => handleItemTotalPriceChange(idx, parseFloat(e.target.value.replace(",", ".")) || 0)}
                      className={`w-full rounded-lg border px-2 py-1 text-xs font-bold text-right focus:outline-none ${
                        item.is_brinde
                          ? "border-emerald-500/40 bg-neutral-950 text-emerald-400 cursor-not-allowed"
                          : item.product.isCustomWeight
                          ? "border-amber-500/50 bg-neutral-950 text-amber-400 cursor-text"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-400 cursor-not-allowed"
                      }`}
                      title={item.is_brinde ? "Brinde de fidelidade — R$ 0,00" : item.product.isCustomWeight ? "Preço Total Ajustável" : "Ative 'Ajuste de Peso/Valor' no cadastro do produto para editar"}
                    />
                  </div>
                  <div className="w-24 text-right">
                    <p className="text-[9px] text-neutral-400 mb-0.5">Subtotal</p>
                    <p className="text-xs font-bold text-emerald-400">{formatCurrency(itemLineTotal(item))}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total Final & Sinal Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-wine-500/10 border border-wine-500/30 px-4 py-3">
              <span className="text-xs font-bold text-wine-300 uppercase">Total do Pedido (R$)</span>
              <input
                type="number"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                className="w-36 rounded-lg border border-wine-500/50 bg-neutral-950 px-3 py-1.5 text-base font-bold text-emerald-400 text-right focus:outline-none"
              />
            </div>

            {sinalJaPago > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-1.5">
                <p className="font-bold text-amber-300 flex items-center justify-between">
                  <span>ℹ️ Sinal de Produção Registrado</span>
                  <span className="text-emerald-400 font-bold text-sm">Restante: {formatCurrency(saldoRestante)}</span>
                </p>
                <div className="flex justify-between text-neutral-300 pt-1 border-t border-amber-500/20">
                  <span>Sinal Pago ({order.formaPagamentoSinal?.toUpperCase()}):</span>
                  <span className="font-bold text-amber-400">{formatCurrency(sinalJaPago)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Destino do Pagamento */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Destino do Pagamento *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDestino("recebido_agora")}
                className={`rounded-xl border-2 p-3 text-xs font-semibold transition-all text-left ${
                  destino === "recebido_agora" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <p className="font-bold">💵 Recebido Agora</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Lança direto no Módulo Financeiro</p>
              </button>
              <button
                type="button"
                onClick={() => setDestino("fiado")}
                className={`rounded-xl border-2 p-3 text-xs font-semibold transition-all text-left ${
                  destino === "fiado" ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700"
                }`}
              >
                <p className="font-bold">📒 Enviar para Credores / Fiado</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Lança no módulo Credores</p>
              </button>
            </div>
          </div>

          {/* Se Recebido Agora */}
          {destino === "recebido_agora" && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Método de Pagamento</label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:outline-none"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="cartao_credito">Cartão de Crédito</option>
              </select>
            </div>
          )}

          {/* Se Enviar para Credores / Fiado */}
          {destino === "fiado" && (
            <div className="grid grid-cols-2 gap-3 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Entrada *</label>
                <input
                  type="date"
                  value={dataEntrada}
                  onChange={(e) => setDataEntrada(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Data de Vencimento *</label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4 bg-neutral-950">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800">
            Cancelar
          </button>
          <button onClick={handleFinalizar} className="rounded-xl bg-wine-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-wine-600">
            Confirmar e Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}
