"use client";

import { useEffect, useRef, useState } from "react";
import { useExpenseStore, EXPENSE_STATUS_COLORS, EXPENSE_CATEGORIA_COLORS } from "@/lib/store";
import { classNames, formatCurrency } from "@/lib/utils";
import type { EntradaMercadoria, Expense } from "@/types/database";

interface Props {
  desp: Expense;
  entrada?: EntradaMercadoria;
  onClose: () => void;
}

function dataBR(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function DespesaDetailsDrawer({ desp, entrada, onClose }: Props) {
  const [visivel, setVisivel] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const expenses = useExpenseStore((s) => s.expenses);
  const { markAsPaid, updateExpense, deleteExpense } = useExpenseStore.getState();

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

  const dataVenc = desp.vencimento || desp.data;
  const diffDias = Math.ceil((new Date(dataVenc + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isVencida = diffDias < 0 && desp.status !== "Pago";
  const diasLabel =
    desp.status === "Pago"
      ? ""
      : isVencida
      ? `${Math.abs(diffDias)}d de atraso`
      : diffDias === 0
      ? "vence hoje"
      : `vence em ${diffDias}d`;

  const ehEntrada = Boolean(desp.entradaId) && Boolean(entrada);
  const mParcela = desp.descricao.match(/parcela\s+(\d+)\s*\/\s*(\d+)/i);
  const ehParcela = ehEntrada && (Boolean(mParcela) || dataVenc !== desp.data);
  const chipLabel = mParcela ? `${mParcela[1]}/${mParcela[2]}` : ehParcela ? "Parcela" : "À Vista";

  const idxParcela = entrada && ehEntrada ? entrada.despesaIds.indexOf(desp.id) : -1;

  function excluir() {
    const aviso = desp.entradaId
      ? "Excluir esta despesa? Ela pertence a uma entrada de mercadoria — se quiser remover a compra inteira, use Estornar na tela de Entradas."
      : "Excluir esta despesa? Esta acao nao pode ser desfeita.";
    if (!confirm(aviso)) return;
    deleteExpense(desp.id);
    fechar();
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Detalhes de ${desp.descricao}`}>
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
              <p className="text-xs text-neutral-500">Despesa</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{desp.descricao}</h2>
            </div>
            <button
              onClick={fechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={classNames("rounded-full border px-3 py-1 text-xs font-bold", EXPENSE_STATUS_COLORS[desp.status])}>
              {desp.status}
            </span>
            {ehEntrada && (
              <span
                className={classNames(
                  "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                  ehParcela
                    ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                )}
              >
                {chipLabel}
              </span>
            )}
            {diasLabel && (
              <span
                className={classNames(
                  "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                  isVencida
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-amber-500/30 bg-amber-500/15 text-amber-400"
                )}
              >
                {diasLabel}
              </span>
            )}
            {desp.status !== "Pago" ? (
              <button
                onClick={() => markAsPaid(desp.id)}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                Marcar Pago
              </button>
            ) : (
              <button
                onClick={() => updateExpense(desp.id, { status: "Pendente" })}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20"
              >
                Reabrir
              </button>
            )}
            <button
              onClick={excluir}
              className="rounded-lg border border-wine-500/30 bg-wine-500/10 px-3 py-2 text-xs font-bold text-wine-400 transition-colors hover:bg-wine-500/20"
            >
              Excluir
            </button>
          </div>
        </div>

        {/* ═══════ CONTEÚDO ═══════ */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Dados da Despesa</p>
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Valor</span>
                <span className="text-base font-bold text-red-400">- {formatCurrency(desp.valor)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Categoria</span>
                <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <span className={classNames("h-2 w-2 rounded-full", EXPENSE_CATEGORIA_COLORS[desp.categoria] || "bg-neutral-500")} />
                  {desp.categoria}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Emissao</span>
                <span className="font-semibold text-slate-900 dark:text-white">{dataBR(desp.data)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Vencimento</span>
                <span className={classNames("font-semibold", isVencida ? "text-red-400" : "text-slate-900 dark:text-white")}>{dataBR(dataVenc)}</span>
              </div>
              {desp.createdAt && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Lancada em</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {new Date(desp.createdAt).toLocaleDateString("pt-BR")}{" "}
                    {new Date(desp.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>
          </section>

          {ehEntrada && entrada && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Compra Vinculada</p>
              <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Fornecedor</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{entrada.fornecedor}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Pagamento</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{entrada.formaPagamento}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Data da compra</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{dataBR(entrada.data)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Subtotal + frete</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(entrada.subtotal)}
                    {entrada.frete !== 0 ? ` + ${formatCurrency(entrada.frete)}` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Total</span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(entrada.total)}</span>
                </div>
              </div>

              <div className="mt-2 space-y-1 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                {entrada.itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-400">
                      {item.nome} × {item.qtd}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(item.qtd * item.custoUnitario)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ehEntrada && entrada && entrada.parcelas.length > 1 && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Parcelas ({idxParcela >= 0 ? idxParcela + 1 : "?"}/{entrada.parcelas.length})
              </p>
              <div className="space-y-1 rounded-xl border border-neutral-800 bg-neutral-950 p-2">
                {entrada.parcelas.map((p, i) => {
                  const irma = expenses.find((e) => e.id === entrada.despesaIds[i]);
                  const atual = entrada.despesaIds[i] === desp.id;
                  return (
                    <div
                      key={p.numero}
                      className={classNames(
                        "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs",
                        atual && "border border-wine-500/40 bg-wine-500/10"
                      )}
                    >
                      <span className={classNames("min-w-0 truncate", atual ? "font-bold text-slate-900 dark:text-white" : "text-neutral-400")}>
                        {p.numero}/{entrada.parcelas.length} · {dataBR(p.vencimento)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(p.valor)}</span>
                        <span
                          className={classNames(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                            EXPENSE_STATUS_COLORS[irma?.status || "Pendente"]
                          )}
                        >
                          {irma ? irma.status : "—"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
