"use client";

import { useEffect, useRef, useState } from "react";
import { useOrderStore } from "@/lib/store";
import { confirmOrderWhatsApp } from "@/lib/whatsapp";
import { useNotificationStore, playNotificationSound } from "@/lib/notifications";
import { classNames, formatCurrency, formatItemQty, paymentLabelOf } from "@/lib/utils";
import { itemLineTotal } from "@/lib/brinde";
import { formatarTelefone } from "@/lib/phone";
import type { Order, OrderStatus } from "@/types/database";

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400" },
  confirmado: { label: "Confirmado", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400" },
  em_producao: { label: "Em Produção", color: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-400" },
  pronto: { label: "Pronto", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400" },
  saiu_entrega: { label: "Saiu Entrega", color: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400" },
  concluido: { label: "Concluído", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400" },
  recusado: { label: "Recusado", color: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400" },
  cancelado: { label: "Cancelado", color: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400" },
};

const STATUS_TERMINAIS: OrderStatus[] = ["concluido", "recusado", "cancelado"];

interface OrderDetailsDrawerProps {
  order: Order;
  onClose: () => void;
  onRegistrarSinal: () => void;
  onEditar: () => void;
  onFinalizar: () => void;
  onEncerrar: (tipo: "recusar" | "cancelar") => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function waMeLink(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}`;
}

export function OrderDetailsDrawer({ order, onClose, onRegistrarSinal, onEditar, onFinalizar, onEncerrar }: OrderDetailsDrawerProps) {
  const updateStatus = useOrderStore((s) => s.updateStatus);
  const updateOrder = useOrderStore((s) => s.updateOrder);
  const [visivel, setVisivel] = useState(false);
  const [pesoInput, setPesoInput] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisivel(true));
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function fechar() {
    setVisivel(false);
    window.setTimeout(onClose, 200);
  }

  const status = STATUS_CONFIG[order.status];
  const ehEntrega = order.deliveryType === "entrega";
  const terminado = STATUS_TERMINAIS.includes(order.status);
  const sinalPago = Number(order.valorPagoSinal) || 0;
  const restante = Math.max(0, order.total - sinalPago);
  const podeRegistrarSinal = !sinalPago && !terminado;
  const mostrarPesoReal = order.status === "pendente" && order.items.some((i) => i.product.isCustomWeight);

  function aceitarPedido() {
    confirmOrderWhatsApp({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryType: order.deliveryType,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      items: order.items,
      total: order.total,
    });
    void updateStatus(order.id, "confirmado");
  }

  function proximaAcao(): { label: string; classe: string; exec: () => void } | null {
    switch (order.status) {
      case "pendente":
        return { label: "Aceitar Pedido", classe: "bg-blue-600 hover:bg-blue-700", exec: aceitarPedido };
      case "confirmado":
        return { label: "Iniciar Produção", classe: "bg-blue-600 hover:bg-blue-700", exec: () => void updateStatus(order.id, "em_producao") };
      case "em_producao":
        return {
          label: ehEntrega ? "Pronto p/ Entrega" : "Pronto p/ Retirada",
          classe: "bg-blue-600 hover:bg-blue-700",
          exec: () => void updateStatus(order.id, "pronto"),
        };
      case "pronto":
        return ehEntrega
          ? { label: "Saiu p/ Entrega", classe: "bg-blue-600 hover:bg-blue-700", exec: () => void updateStatus(order.id, "saiu_entrega") }
          : { label: "Concluir Pedido", classe: "bg-blue-600 hover:bg-blue-700", exec: onFinalizar };
      case "saiu_entrega":
        return { label: "Concluir Pedido", classe: "bg-blue-600 hover:bg-blue-700", exec: onFinalizar };
      default:
        return null;
    }
  }

  function confirmarPesoReal() {
    const fallback = String(order.peso_real_kg ?? order.items.find((i) => i.product.isCustomWeight)?.quantity ?? "");
    const bruto = pesoInput || fallback;
    const pesoReal = Math.round((parseFloat(bruto.replace(",", ".")) || 0) * 10) / 10;
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
    setPesoInput("");
  }

  const acao = proximaAcao();

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Detalhes do pedido de ${order.customerName}`}>
      <div
        onClick={fechar}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${visivel ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl transition-transform duration-300 ease-out ${
          visivel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ═══════ CABEÇALHO ═══════ */}
        <div className="border-b border-neutral-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Pedido #{order.orderNumber || order.id.slice(-6)}</p>
              <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{order.customerName}</h2>
            </div>
            <button
              onClick={fechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${status.color}`}>{status.label}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-neutral-800 dark:text-neutral-400">
              {ehEntrega ? "Entrega" : "Retirada"}
            </span>
            <span className={`rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ${order.origem === "manual" ? "dark:bg-blue-500/15 dark:text-blue-400" : "dark:bg-purple-500/15 dark:text-purple-400"}`}>
              {order.origem === "manual" ? "Manual" : "Site / Automático"}
            </span>
          </div>
          {acao && (
            <button
              onClick={acao.exec}
              className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition-colors ${acao.classe}`}
            >
              {acao.label}
            </button>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {podeRegistrarSinal && (
              <button
                onClick={onRegistrarSinal}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
              >
                Registrar Sinal
              </button>
            )}
            <button
              onClick={onEditar}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-[#8B1D22]/30 dark:text-[#e8b4b8] dark:hover:bg-[#8B1D22]/10 dark:hover:text-white"
            >
              Editar Pedido
            </button>
            {!terminado && (
              <button
                onClick={onFinalizar}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                Finalizar Pedido
              </button>
            )}
            {!terminado && (
              <button
                onClick={() => onEncerrar(order.status === "pendente" ? "recusar" : "cancelar")}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                {order.status === "pendente" ? "Recusar Pedido" : "Cancelar Pedido"}
              </button>
            )}
          </div>
        </div>

        {/* ═══════ CONTEÚDO ═══════ */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Agendamento */}
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-amber-400">
              {ehEntrega ? "Entrega" : "Retirada"} Agendada
            </p>
            <p className="mt-1 text-sm font-bold text-slate-800 dark:text-white">
              {order.scheduledDate ? (
                <>
                  {order.scheduledDate.split("-").reverse().join("/")}
                  {order.scheduledTime && ` às ${order.scheduledTime}`}
                </>
              ) : (
                formatDate(order.createdAt)
              )}
            </p>
          </div>

          {/* Dados do Cliente */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Dados do Cliente</p>
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Nome</span>
                <span className="font-semibold text-gray-900 dark:text-white">{order.customerName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">WhatsApp</span>
                <a
                  href={waMeLink(order.customerPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-400 transition-colors hover:text-emerald-300 hover:underline"
                >
                  {formatarTelefone(order.customerPhone)}
                </a>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Modalidade</span>
                <span className="font-semibold text-gray-900 dark:text-white">{ehEntrega ? "Entrega" : "Retirada na Loja"}</span>
              </div>
              {order.address && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-neutral-500">Endereço</span>
                  <span className="text-right text-gray-900 dark:text-white">{order.address}</span>
                </div>
              )}
              {!!order.trocoPara && order.trocoPara > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Troco Para</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(order.trocoPara)}</span>
                </div>
              )}
            </div>
          </section>

          {/* Itens e Observações */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Itens e Observações</p>
            <div className="space-y-1 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className={classNames(
                    "flex items-start justify-between gap-3 rounded-md px-2 py-1.5",
                    item.is_brinde ? "border border-emerald-500/30 bg-emerald-500/10" : ""
                  )}
                >
                  <div className="min-w-0">
                    <p className={classNames("text-sm", item.is_brinde ? "font-semibold text-emerald-300" : "text-neutral-300")}>
                      {item.is_brinde && (
                        <span className="mr-1.5 rounded bg-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                          🎁 BRINDE FIDELIDADE
                        </span>
                      )}
                      {item.product.name} {formatItemQty(item.quantity, item.product.isCustomWeight)}
                    </p>
                    {item.notes && <p className="mt-0.5 text-xs text-amber-400/80">Obs: {item.notes}</p>}
                  </div>
                  {item.is_brinde ? (
                    <span className="shrink-0 text-sm font-bold text-emerald-400">
                      <span className="mr-1 text-neutral-500 line-through">{formatCurrency(item.product.price)}</span>
                      R$ 0,00
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm font-bold text-emerald-400">{formatCurrency(itemLineTotal(item))}</span>
                  )}
                </div>
              ))}
              {order.peso_real_kg !== undefined && (
                <p className="mt-1 rounded-lg border border-blue-500/25 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300">
                  ⚖️ Peso real confirmado: {order.peso_real_kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                </p>
              )}
            </div>

            {mostrarPesoReal && (
              <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">⚖️ Peso Real do Bolo (kg) — Aprovação Obrigatória</p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/70">
                    Confira na balança, informe o peso final. O total será recalculado, o pedido virará Confirmado e o cliente será avisado do valor final.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={pesoInput || (order.peso_real_kg ?? order.items.find((i) => i.product.isCustomWeight)?.quantity ?? 1)}
                    onChange={(e) => setPesoInput(e.target.value)}
                    className="w-32 rounded-lg border border-amber-500/50 bg-neutral-950 px-3 py-2 text-sm font-bold text-amber-400 outline-none focus:border-amber-400"
                    title="Peso real (kg)"
                  />
                  <span className="text-xs font-semibold text-amber-400">kg</span>
                  <button
                    onClick={confirmarPesoReal}
                    className="ml-auto rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
                  >
                    Confirmar Peso &amp; Aprovar Pedido
                  </button>
                </div>
                <div className="flex justify-between border-t border-amber-500/20 pt-2 text-[11px]">
                  <span className="text-amber-800 dark:text-amber-200/60">Peso solicitado pelo cliente</span>
                  <span className="font-semibold text-white">
                    {formatItemQty(order.items.find((i) => i.product.isCustomWeight)?.quantity ?? 0, true)}
                  </span>
                </div>
              </div>
            )}

            {order.generalNotes && (
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Observações Gerais</p>
                <p className="mt-1 text-sm text-neutral-300">{order.generalNotes}</p>
              </div>
            )}
          </section>
        </div>

        {/* ═══════ RESUMO FINANCEIRO ═══════ */}
        <div className="border-t border-neutral-800 bg-neutral-950 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Resumo Financeiro</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-400">Forma de pagamento</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">{order.isFiado ? "Fiado / A Pagar" : paymentLabelOf(order.paymentMethod)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-400">Sinal pago</dt>
              <dd className="font-semibold text-gray-900 dark:text-amber-400">
                {sinalPago > 0
                  ? `${formatCurrency(sinalPago)}${order.formaPagamentoSinal ? ` (${paymentLabelOf(order.formaPagamentoSinal)})` : ""}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-neutral-400">Valor restante</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">{formatCurrency(restante)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-2">
              <dt className="text-sm font-bold text-gray-900 dark:text-white">Total</dt>
              <dd className="text-base font-bold text-gray-900 dark:text-emerald-400">{formatCurrency(order.total)}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
