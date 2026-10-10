"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrderStore, useCustomerStore, useProductStore } from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import type { CompraItem } from "@/types/database";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { confirmOrderWhatsApp, montarRecusaPedido, montarCancelamentoPedido, urlWaMe } from "@/lib/whatsapp";
import { compararTexto, formatCurrency, getLocalDateStr, getLocalDateStrFromISO, paymentLabelOf } from "@/lib/utils";
import { criarMixVazio, ehCombo, formatarMix, resumoItemPedido, saboresDoCombo, todosCompletos } from "@/lib/combo";
import { itemLineTotal } from "@/lib/brinde";
import { sumReceitasByDate, filterUnpaidOrders, orderRemaining } from "@/lib/faturamento";
import type { Order, PaymentMethod, CartItem, MixCaixa, Product } from "@/types/database";
import { OpcaoTelefone } from "@/lib/phoneBlur";
import ComboPicker from "@/components/ComboPicker";
import { OrderDetailsDrawer, STATUS_CONFIG } from "@/components/admin/OrderDetailsDrawer";
import { EditOrderModal, EncerrarPedidoModal, FinalizeOrderModal, RegistrarSinalModal } from "@/components/admin/OrderModals";
import ResumoItens from "@/components/admin/ResumoItens";

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
  const [comboManualProd, setComboManualProd] = useState<Product | null>(null);
  const [comboManualMixes, setComboManualMixes] = useState<MixCaixa[]>([]);

  const selectedProd = products.find((p) => p.id === selectedProdId);
  const addingWeight = !!selectedProd?.isCustomWeight;
  const addingCombo = ehCombo(selectedProd ?? ({} as Product));

  function adicionarItemManual() {
    if (!selectedProdId) return;
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;
    if (ehCombo(prod)) {
      const sabores = saboresDoCombo(prod.combo, products);
      if (sabores.length < 2) {
        alert(`${prod.name} não tem sabores disponíveis (verifique a categoria do combo no cadastro).`);
        return;
      }
      setComboManualMixes([criarMixVazio(sabores)]);
      setComboManualProd(prod);
      return;
    }
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

  function confirmarComboManual() {
    if (!comboManualProd) return;
    const mixes = comboManualMixes;
    setItensManual((prev) => {
      const existing = prev.find((i) => i.product.id === comboManualProd.id && !i.is_brinde);
      if (existing) {
        return prev.map((i) =>
          i.product.id === comboManualProd.id && !i.is_brinde
            ? { ...i, quantity: i.quantity + mixes.length, mix: [...(i.mix ?? []), ...mixes] }
            : i
        );
      }
      return [...prev, { product: comboManualProd, quantity: mixes.length, mix: mixes }];
    });
    setComboManualProd(null);
    setSelectedProdId("");
    setQtdItem(1);
  }

  function removerItemManual(prodId: string) {
    setItensManual((prev) => prev.filter((i) => i.product.id !== prodId));
  }

  async function handleCreateManualOrder(e: React.FormEvent) {
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

    let newOrder;
    try {
      newOrder = await addOrder({
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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível salvar o pedido no servidor.");
      return;
    }

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
  const todayOrders = orders.filter((o) => getLocalDateStrFromISO(o.createdAt) === today);
  const todayRevenue = sumReceitasByDate(transactions, today);
  const todayPrevisto = filterUnpaidOrders(orders, today).reduce((s, o) => s + orderRemaining(o), 0);
  const pendentes = orders.filter((o) => o.status === "pendente").length;
  const concluidosHoje = todayOrders.filter((o) => o.status === "concluido").length;
  const drawerOrder = orders.find((o) => o.id === drawerOrderId) || null;

  function formatarDataBR(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatarHoraBR(iso: string) {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
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
              : formatarDataBR(order.createdAt);
            const hora = order.scheduledDate
              ? order.scheduledTime || ""
              : formatarHoraBR(order.createdAt);
            return (
              <div
                key={order.id}
                onClick={() => setDrawerOrderId(order.id)}
                className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-neutral-800 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-neutral-700 hover:bg-slate-50 dark:bg-neutral-900 dark:shadow-none dark:hover:bg-neutral-800/50"
              >
                <div className="w-28 shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-center dark:bg-transparent dark:text-left">
                  <p className="text-sm font-bold text-slate-800 dark:text-amber-400">{quando}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-amber-300/80">{hora || "—"}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{order.customerName}</p>
                  <ResumoItens
                    itens={order.items.map((i) => resumoItemPedido(i.product.name, i.quantity, i.mix, i.product.isCustomWeight))}
                    className="mt-0.5 text-xs text-neutral-500"
                    classeItem="leading-5"
                  />
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${status.color}`}>
                  {status.label}
                </span>
                <p className="w-24 shrink-0 text-right text-sm font-bold text-emerald-400">
                  R$ {order.total.toFixed(2).replace(".", ",")}
                </p>
                <svg
                  className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-700 dark:text-neutral-600 dark:group-hover:text-neutral-400"
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
                      disabled={addingCombo}
                      className="w-20 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white text-center outline-none disabled:opacity-40"
                      title={addingCombo ? "Quantidade definida no mix" : addingWeight ? "Peso (kg)" : "Quantidade"}
                      placeholder={addingWeight ? "kg" : "qtd"}
                    />
                    <button
                      type="button"
                      onClick={adicionarItemManual}
                      className="flex-1 rounded-lg bg-wine-500 px-3 py-2 text-xs font-semibold text-white hover:bg-wine-600"
                    >
                      {addingCombo ? "Montar" : addingWeight ? "+ Adicionar kg" : "+ Adicionar"}
                    </button>
                  </div>
                </div>

                {itensManual.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-2 max-h-40 overflow-y-auto">
                    {itensManual.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs text-neutral-300 bg-neutral-900 p-2 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <span>{item.product.isCustomWeight ? `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : `${item.quantity}x`} {item.product.name} (R$ {itemLineTotal(item).toFixed(2).replace(".", ",")})</span>
                          {item.mix && item.mix.length > 0 ? (
                            <div className="mt-0.5 space-y-0.5">
                              {item.mix.map((m, mi) => (
                                <p key={mi} className="text-[10px] text-neutral-500">
                                  {item.mix!.length > 1 ? `Caixa ${mi + 1}: ` : ""}{formatarMix(m)}
                                </p>
                              ))}
                            </div>
                          ) : ehCombo(item.product) ? (
                            <p className="mt-0.5 text-[10px] font-semibold text-amber-400">Mix de sabores não definido</p>
                          ) : null}
                        </div>
                        <button type="button" onClick={() => removerItemManual(item.product.id)} className="text-red-400 hover:text-red-300 text-xs self-start">Excluir</button>
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
          {comboManualProd && comboManualProd.combo && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Montar caixa — {comboManualProd.name}</h3>
                    <p className="text-[11px] text-neutral-400">
                      {comboManualProd.combo.total} docinhos por caixa • R$ {comboManualProd.price.toFixed(2).replace(".", ",")} por caixa
                    </p>
                  </div>
                  <button type="button" onClick={() => setComboManualProd(null)} className="text-neutral-500 hover:text-white">✕</button>
                </div>
                <ComboPicker
                  total={comboManualProd.combo.total}
                  sabores={saboresDoCombo(comboManualProd.combo, products)}
                  mixes={comboManualMixes}
                  onChange={setComboManualMixes}
                  passo={comboManualProd.combo.passo}
                />
                {!todosCompletos(comboManualMixes, comboManualProd.combo.total) && (
                  <p className="mt-2 text-[11px] font-semibold text-amber-400">Complete o mix de todas as caixas.</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setComboManualProd(null)}
                    className="flex-1 rounded-lg border border-neutral-700 px-3 py-2.5 text-xs font-semibold text-neutral-400 hover:bg-neutral-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarComboManual}
                    disabled={!todosCompletos(comboManualMixes, comboManualProd.combo.total)}
                    className="flex-1 rounded-lg bg-wine-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-wine-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Adicionar {comboManualMixes.length} caixa(s) — R$ {(comboManualProd.price * comboManualMixes.length).toFixed(2).replace(".", ",")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
