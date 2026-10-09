"use client";

import { useEffect, useRef, useState } from "react";
import { useOrderStore, estornarTransacaoSinal, CAMPOS_SINAL_ESTORNADO } from "@/lib/store";
import { confirmOrderWhatsApp, enviarMensagemStatus } from "@/lib/whatsapp";
import { useNotificationStore, playNotificationSound, notifyError } from "@/lib/notifications";
import type { GatilhoMensagem } from "@/lib/mensagensWhatsapp";
import { classNames, formatCurrency, formatItemQty, paymentLabelOf } from "@/lib/utils";
import { formatarMix } from "@/lib/combo";
import { itemLineTotal } from "@/lib/brinde";
import { detalheSinalPedido } from "@/lib/faturamento";
import { formatarTelefone } from "@/lib/phone";
import type { Order, OrderStatus } from "@/types/database";

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-[#8B1D22] text-white font-medium" },
  confirmado: { label: "Confirmado", color: "bg-blue-600 text-white font-medium" },
  em_producao: { label: "Em Produção", color: "bg-purple-600 text-white font-medium" },
  pronto: { label: "Pronto", color: "bg-cyan-600 text-white font-medium" },
  saiu_entrega: { label: "Saiu Entrega", color: "bg-indigo-600 text-white font-medium" },
  concluido: { label: "Concluído", color: "bg-emerald-600 text-white font-medium" },
  recusado: { label: "Recusado", color: "bg-red-600 text-white font-medium" },
  cancelado: { label: "Cancelado", color: "bg-red-700 text-white font-medium" },
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

function formatarDataHoraBR(iso: string) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${data} às ${hora}`;
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
  const detalheSinal = detalheSinalPedido(order);
  const entradaRecebida = detalheSinal.recebido;
  const restante = Math.max(0, order.total - entradaRecebida);
  const podeRegistrarSinal = !detalheSinal.pago && !terminado;

  function estornarEntrada() {
    const ok = window.confirm(
      `Estornar a entrada de ${formatCurrency(entradaRecebida)}? O lançamento será removido do Faturamento e a entrada voltará para Pendente.`
    );
    if (!ok) return;
    void updateOrder(order.id, CAMPOS_SINAL_ESTORNADO).then((salvo) => {
      if (salvo) estornarTransacaoSinal(order);
    });
  }
  const mostrarPesoReal = order.status === "pendente" && order.items.some((i) => i.product.isCustomWeight);

  function disparar(gatilho: GatilhoMensagem) {
    const resultado = enviarMensagemStatus(order, gatilho);
    if (resultado === "sem_telefone") {
      notifyError("WhatsApp", "Telefone do cliente inválido — a mensagem não foi enviada.");
    }
  }

  function aceitarPedido() {
    confirmOrderWhatsApp({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryType: order.deliveryType,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      items: order.items,
      total: order.total,
      orderNumber: order.orderNumber || order.id.slice(-6),
    });
    void updateStatus(order.id, "confirmado");
  }

  function proximaAcao(): { label: string; classe: string; exec: () => void } | null {
    switch (order.status) {
      case "pendente":
        return { label: "Aceitar Pedido", classe: "bg-blue-600 hover:bg-blue-700", exec: aceitarPedido };
      case "confirmado":
        return {
          label: "Iniciar Produção",
          classe: "bg-blue-600 hover:bg-blue-700",
          exec: () => {
            disparar("em_producao");
            void updateStatus(order.id, "em_producao");
          },
        };
      case "em_producao":
        return {
          label: ehEntrega ? "Pronto p/ Entrega" : "Pronto p/ Retirada",
          classe: "bg-blue-600 hover:bg-blue-700",
          exec: () => {
            disparar("pronto");
            void updateStatus(order.id, "pronto");
          },
        };
      case "pronto":
        return ehEntrega
          ? {
              label: "Saiu p/ Entrega",
              classe: "bg-blue-600 hover:bg-blue-700",
              exec: () => {
                disparar("saiu_entrega");
                void updateStatus(order.id, "saiu_entrega");
              },
            }
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
      orderNumber: order.orderNumber || order.id.slice(-6),
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
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{order.customerName}</h2>
            </div>
            <button
              onClick={fechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-sm ${status.color}`}>{status.label}</span>
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
            {order.scheduledDate && !terminado && (
              <button
                onClick={() => disparar("lembrete_agendamento")}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20"
              >
                Enviar Lembrete
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-amber-400">
              {ehEntrega ? "Entrega" : "Retirada"} Agendada
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {order.scheduledDate ? (
                <>
                  {order.scheduledDate.split("-").reverse().join("/")}
                  {order.scheduledTime && ` às ${order.scheduledTime}`}
                </>
              ) : (
                formatarDataHoraBR(order.createdAt)
              )}
            </p>
          </div>

          {/* Dados do Cliente */}
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Dados do Cliente</p>
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-neutral-500">Nome</span>
                <span className="font-semibold text-slate-900 dark:text-white">{order.customerName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-neutral-500">WhatsApp</span>
                <a
                  href={waMeLink(order.customerPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-slate-900 transition-colors hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  {formatarTelefone(order.customerPhone)}
                </a>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-neutral-500">Modalidade</span>
                <span className="font-semibold text-slate-900 dark:text-white">{ehEntrega ? "Entrega" : "Retirada na Loja"}</span>
              </div>
              {order.address && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-slate-600 dark:text-neutral-500">Endereço</span>
                  <span className="text-right font-semibold text-slate-900 dark:text-white">{order.address}</span>
                </div>
              )}
              {!!order.trocoPara && order.trocoPara > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-600 dark:text-neutral-500">Troco Para</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(order.trocoPara)}</span>
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
                      {item.product.name} {item.mix && item.mix.length > 0 ? `${item.quantity} caixa(s)` : formatItemQty(item.quantity, item.product.isCustomWeight)}
                    </p>
                    {item.mix && item.mix.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.mix.map((m, mi) => (
                          <p key={mi} className="text-[11px] text-neutral-400">
                            {item.mix!.length > 1 ? `Caixa ${mi + 1}: ` : ""}
                            {formatarMix(m)}
                          </p>
                        ))}
                      </div>
                    )}
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
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatItemQty(order.items.find((i) => i.product.isCustomWeight)?.quantity ?? 0, true)}
                  </span>
                </div>
              </div>
            )}

            {order.generalNotes && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-100 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-amber-500">Observações Gerais</p>
                <p className="mt-1 text-sm text-slate-800 dark:text-neutral-300">{order.generalNotes}</p>
              </div>
            )}
          </section>
        </div>

        {/* ═══════ RESUMO FINANCEIRO ═══════ */}
        <div className="border-t border-neutral-800 bg-neutral-950 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Resumo Financeiro</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600 dark:text-neutral-400">Forma de pagamento</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">{order.isFiado ? "Fiado / A Pagar" : paymentLabelOf(order.paymentMethod)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600 dark:text-neutral-400">Sinal Exigido</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {detalheSinal.exigido ? `Sim (${formatCurrency(detalheSinal.valor)})` : "Não"}
              </dd>
            </div>
            {detalheSinal.exigido && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600 dark:text-neutral-400">Status da Entrada</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      detalheSinal.pago ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {detalheSinal.pago ? "Pago" : "Pendente"}
                  </span>
                  {detalheSinal.pago ? (
                    <button
                      onClick={estornarEntrada}
                      className="rounded-lg border border-neutral-700 px-2 py-1 text-[10px] font-semibold text-neutral-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                      title="Estornar a entrada e remover do Faturamento"
                    >
                      Estornar
                    </button>
                  ) : (
                    <button
                      onClick={onRegistrarSinal}
                      className="rounded-lg border border-neutral-700 px-2 py-1 text-[10px] font-semibold text-neutral-400 transition-colors hover:border-amber-500/40 hover:text-amber-400"
                      title="Registrar recebimento da entrada (valor editável)"
                    >
                      Marcar Pago
                    </button>
                  )}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm font-bold text-slate-900 dark:text-white">Total do Pedido</dt>
              <dd className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(order.total)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-600 dark:text-neutral-400">
                Entrada Recebida
                {entradaRecebida > 0 && <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">Pago</span>}
              </dt>
              <dd className="text-right">
                <span className="font-semibold text-slate-900 dark:text-amber-400">
                  {entradaRecebida > 0
                    ? `${formatCurrency(entradaRecebida)}${order.formaPagamentoSinal ? ` (${paymentLabelOf(order.formaPagamentoSinal)})` : ""}`
                    : "—"}
                </span>
                {entradaRecebida > 0 && (
                  <span className="block text-[10px] text-slate-500 dark:text-neutral-500">Adicionada ao faturamento de hoje</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-600 dark:text-neutral-400">Valor Restante a Receber</dt>
              <dd className="text-right">
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(restante)}</span>
                {restante > 0 && !terminado && (
                  <span className="block text-[10px] text-slate-500 dark:text-neutral-500">Previsto até a finalização</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
