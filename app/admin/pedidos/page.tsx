"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrderStore, useCustomerStore, useProductStore } from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import type { CompraItem } from "@/types/database";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { confirmOrderWhatsApp, montarRecusaPedido, montarCancelamentoPedido, urlWaMe } from "@/lib/whatsapp";
import { compararTexto, formatCurrency, getLocalDateStr, formatItemQty, paymentLabelOf } from "@/lib/utils";
import { itemLineTotal } from "@/lib/brinde";
import { sumReceitasByDate, filterUnpaidOrders, orderRemaining } from "@/lib/faturamento";
import type { Order, PaymentMethod, CartItem } from "@/types/database";
import { OpcaoTelefone } from "@/lib/phoneBlur";
import { OrderDetailsDrawer, STATUS_CONFIG } from "@/components/admin/OrderDetailsDrawer";

const PEDIDOS_PAGE_SIZE = 15;

export default function AdminPedidos() {
  const { orders } = useOrderStore();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pagePedidos, setPagePedidos] = useState(1);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [sinalOrder, setSinalOrder] = useState<Order | null>(null);
  const [encerrarPedido, setEncerrarPedido] = useState<{ order: Order; tipo: "recusar" | "cancelar" } | null>(null);

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
    const matchStatus = filterStatus === "all" || o.status === filterStatus || (filterStatus === "confirmado" && o.status !== "pendente" && o.status !== "concluido" && o.status !== "recusado" && o.status !== "cancelado");
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
  const drawerOrder = orders.find((o) => o.id === drawerOrderId) || null;

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1D22] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#72171B]"
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
          {["all", "pendente", "confirmado", "concluido", "recusado", "cancelado"].map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPagePedidos(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                filterStatus === s ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
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
            const quando = order.scheduledDate
              ? order.scheduledDate.split("-").reverse().join("/")
              : formatDate(order.createdAt).slice(0, 10);
            const hora = order.scheduledDate
              ? order.scheduledTime || ""
              : formatDate(order.createdAt).split(", ")[1] || "";
            const resumo = order.items
              .map((i) => `${i.product.name} ${formatItemQty(i.quantity, i.product.isCustomWeight)}`)
              .join(", ");
            return (
              <div
                key={order.id}
                onClick={() => setDrawerOrderId(order.id)}
                className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-4 text-left transition-all hover:border-neutral-700 hover:bg-neutral-800/50"
              >
                <div className="w-28 shrink-0">
                  <p className="text-sm font-bold text-amber-400">{quando}</p>
                  <p className="text-xs font-semibold text-amber-300/80">{hora || "—"}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{order.customerName}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{resumo}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.color}`}>
                  {status.label}
                </span>
                <p className="w-24 shrink-0 text-right text-sm font-bold text-emerald-400">
                  R$ {order.total.toFixed(2).replace(".", ",")}
                </p>
                <svg
                  className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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

      {/* Drawer de Detalhes do Pedido */}
      {drawerOrder && (
        <OrderDetailsDrawer
          order={drawerOrder}
          onClose={() => setDrawerOrderId(null)}
          onRegistrarSinal={() => setSinalOrder(drawerOrder)}
          onEditar={() => setEditingOrder(drawerOrder)}
          onFinalizar={() => setEditOrder(drawerOrder)}
          onEncerrar={(tipo) => setEncerrarPedido({ order: drawerOrder, tipo })}
        />
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
      {encerrarPedido && (
        <EncerrarPedidoModal order={encerrarPedido.order} tipo={encerrarPedido.tipo} onClose={() => setEncerrarPedido(null)} />
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
                      {[...customers].sort((a, b) => compararTexto(a.name, b.name)).map((c) => (
                        <OpcaoTelefone key={c.id} value={c.id} nome={c.name} telefone={c.phone} />
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
                        {[...products].sort((a, b) => compararTexto(a.name, b.name)).map((p) => (
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
  const { updateOrderComTransacao } = useOrderStore();
  const [valorSinal, setValorSinal] = useState(Math.round((order.total / 2) * 100) / 100);
  const [formaPagamentoSinal, setFormaPagamentoSinal] = useState<PaymentMethod>("pix");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvarSinal() {
    setSalvando(true);
    try {
      const ok = await updateOrderComTransacao(
        order.id,
        {
          status: "em_producao",
          valorPagoSinal: valorSinal,
          formaPagamentoSinal,
        },
        valorSinal > 0
          ? {
              tipo: 'RECEITA',
              categoria: 'Sinal de Encomenda',
              valor: valorSinal,
              formaPagamento: paymentLabelOf(formaPagamentoSinal),
              descricao: `Sinal de Produção (Pedido #${order.orderNumber || order.id.slice(-6)}) — ${order.customerName}`,
              data: getLocalDateStr(),
            }
          : null
      );
      if (!ok) return;

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
    } finally {
      setSalvando(false);
    }
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
          <button onClick={handleSalvarSinal} disabled={salvando} className="rounded-xl bg-wine-500 px-4 py-2 text-xs font-bold text-white hover:bg-wine-600 disabled:opacity-60 disabled:cursor-not-allowed">
            {salvando ? "Processando..." : "Confirmar e Iniciar Produção"}
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
                    {[...products].sort((a, b) => compararTexto(a.name, b.name)).map((p) => (
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
  const { updateOrder, updateOrderComTransacao } = useOrderStore();
  const { converterPedidoParaFiado } = useCredoresStore();
  const customerStore = useCustomerStore();
  const [finalizando, setFinalizando] = useState(false);

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

  async function handleFinalizar() {
    const isFiado = destino === "fiado";
    const fullyPaidBySinal = isFiado && saldoRestante <= 0;

    setFinalizando(true);
    try {
      if (fullyPaidBySinal) {
        const ok = await updateOrder(order.id, {
          items,
          total,
          paymentMethod: (formaPagamento as any),
          status: "concluido",
          isFiado: false,
          dataPagamento: dataEntrada,
        });
        if (!ok) return;
        onClose();
        return;
      }

      if (destino === "fiado") {
        const ok = await updateOrder(order.id, {
          items,
          total,
          paymentMethod: (formaPagamento as any),
          status: "confirmado",
          isFiado: true,
        });
        if (!ok) return;

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

        await converterPedidoParaFiado({
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
        const transacao = saldoRestante > 0
          ? {
              tipo: 'RECEITA' as const,
              categoria: 'Vendas / Pedidos',
              valor: saldoRestante,
              formaPagamento: paymentLabelOf(formaPagamento),
              descricao: sinalJaPago > 0 ? `Saldo Pedido #${order.orderNumber || order.id.slice(-6)} — ${order.customerName}` : `Pedido #${order.orderNumber || order.id.slice(-6)} — ${order.customerName}`,
              data: dataEntrada,
            }
          : null;
        const ok = await updateOrderComTransacao(
          order.id,
          {
            items,
            total,
            paymentMethod: (formaPagamento as any),
            status: "concluido",
            dataPagamento: dataEntrada,
          },
          transacao
        );
        if (!ok) return;
      }

      onClose();
    } catch (err: any) {
      alert(err.message || "Erro ao finalizar o pedido.");
    } finally {
      setFinalizando(false);
    }
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
          <button onClick={handleFinalizar} disabled={finalizando} className="rounded-xl bg-wine-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-wine-600 disabled:opacity-60 disabled:cursor-not-allowed">
            {finalizando ? "Processando..." : "Confirmar e Finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EncerrarPedidoModal({ order, tipo, onClose }: { order: Order; tipo: "recusar" | "cancelar"; onClose: () => void }) {
  const updateStatus = useOrderStore((s) => s.updateStatus);
  const [motivo, setMotivo] = useState("");
  const isRecusa = tipo === "recusar";
  const numeroPedido = order.orderNumber || order.id.slice(-6);
  const itensLista = order.items.map((i) => `${i.product.name} ${formatItemQty(i.quantity, i.product.isCustomWeight)}`).join(", ");
  const preview = isRecusa
    ? montarRecusaPedido({ customerName: order.customerName, numeroPedido, items: order.items, motivo })
    : montarCancelamentoPedido({ customerName: order.customerName, numeroPedido, items: order.items });

  function handleConfirmar() {
    const digitos = (order.customerPhone || "").replace(/\D/g, "");
    const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
    if (numero.length >= 12) {
      window.open(urlWaMe(order.customerPhone, preview), "_blank");
    } else {
      alert("Número de WhatsApp inválido — o pedido foi atualizado sem envio da mensagem.");
    }
    updateStatus(order.id, isRecusa ? "recusado" : "cancelado");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{isRecusa ? "Recusar Pedido" : "Cancelar Pedido"}</h2>
            <p className="text-xs text-neutral-400">#{numeroPedido} • {order.customerName}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <p className="text-xs text-neutral-400">{itensLista}</p>
            <p className="mt-1 text-sm font-bold text-emerald-400">{formatCurrency(order.total)}</p>
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Mensagem que será enviada</p>
            <p className="mt-1 text-xs text-neutral-300 whitespace-pre-line">{preview}</p>
          </div>

          {isRecusa ? (
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1">Motivo da recusa (opcional)</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ex.: data indisponível, volume acima do permitido..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>
          ) : (
            <p className="text-xs text-orange-400">
              O cliente será avisado do cancelamento e poderá pedir estorno ou reagendamento por aqui.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4 bg-neutral-950">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800">
            Voltar
          </button>
          <button
            onClick={handleConfirmar}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold text-white ${isRecusa ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
          >
            {isRecusa ? "Recusar e Enviar WhatsApp" : "Cancelar e Enviar WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
