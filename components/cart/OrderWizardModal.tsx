"use client";

import { useState, useEffect, useRef } from "react";
import { useCartStore, useOrderStore } from "@/lib/store";
import { formatCurrency, classNames } from "@/lib/utils";
import { openWhatsApp } from "@/lib/whatsapp";
import { mascaraTelefone, higienizarTelefone, formatarTelefone, estadoTelefone, MENSAGEM_WHATSAPP_INVALIDO } from "@/lib/phone";
import { useNotificationStore, playNotificationSound } from "@/lib/notifications";
import { useStoreConfig } from "@/lib/storeConfig";

const DELIVERY_FEE = 0;

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getMinDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isBeforeDay(d1: Date, d2: Date): boolean {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return t1 < t2;
}

export default function OrderWizardModal() {
  const { items, isOpen, setOpen, updateQuantity, updateNotes, clearCart } = useCartStore();
  const config = useStoreConfig();
  const TIME_SLOTS = config.timeSlots.map((t) => ({ label: t, value: t, desc: "" }));
  const [step, setStep] = useState(1);
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const minDate = getMinDate();
  const [calMonth, setCalMonth] = useState(minDate.getMonth());
  const [calYear, setCalYear] = useState(minDate.getFullYear());

  const [form, setForm] = useState({
    date: "",
    time: "",
    customerName: "",
    customerPhone: "",
    paymentMethod: "pix" as "pix" | "dinheiro" | "cartao_debito" | "cartao_credito",
    generalNotes: "",
    finalTotal: 0,
  });

  const [totalManualEdit, setTotalManualEdit] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const subtotal = items.reduce((s, i) => s + (i.is_brinde ? 0 : i.product.price * i.quantity), 0);

  useEffect(() => {
    if (!totalManualEdit) {
      setForm((f) => ({ ...f, finalTotal: subtotal }));
    }
  }, [subtotal, totalManualEdit]);

  const total = form.finalTotal;

  const isValid = () => {
    if (step === 1) return items.length > 0;
    if (step === 2) return !!form.date;
    if (step === 3) return form.time.length > 0;
    if (step === 4) return form.customerName.trim().length > 0 && higienizarTelefone(form.customerPhone) !== null;
    if (step === 5) return form.paymentMethod.length > 0 && form.finalTotal > 0;
    return true;
  };

  const validationHint = () => {
    if (step === 2) return "Selecione uma data no calendario";
    if (step === 3) return "Selecione um horario";
    if (step === 4) {
      if (!form.customerName.trim()) return "Informe seu nome";
      if (higienizarTelefone(form.customerPhone) === null) return MENSAGEM_WHATSAPP_INVALIDO;
    }
    if (step === 5) {
      if (form.finalTotal <= 0) return "Informe o valor total";
    }
    return "";
  };

  const nextStep = () => {
    if (!isValid()) return;
    setStep((s) => Math.min(s + 1, 5));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  function selectDate(day: number) {
    const d = new Date(calYear, calMonth, day);
    if (isBeforeDay(d, minDate)) return;
    setForm((f) => ({ ...f, date: formatDateStr(d) }));
    setCalendarOpen(false);
  }

  function navigateCal(delta: number) {
    let newMonth = calMonth + delta;
    let newYear = calYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  }

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  const completeOrder = () => {
    if (!isValid()) return;

    const orderItems = items.map((cartItem) => ({
      product: cartItem.product,
      quantity: cartItem.quantity,
      notes: cartItem.notes || "",
      is_brinde: cartItem.is_brinde || undefined,
      preco_unitario: cartItem.preco_unitario,
    }));

    const normalizedPhone = higienizarTelefone(form.customerPhone) || "";

    useOrderStore.getState().addOrder({
      customerName: form.customerName,
      customerPhone: normalizedPhone,
      items: orderItems as any,
      total,
      deliveryType: "retirada",
      scheduledDate: form.date || undefined,
      scheduledTime: form.time || undefined,
      paymentMethod: form.paymentMethod,
      generalNotes: form.generalNotes || undefined,
      origem: "site",
    });

    useNotificationStore.getState().addNotification({
      title: "Novo Pedido!",
      message: `${form.customerName} — ${formatCurrency(total)} (Retirada)`,
      type: "order",
    });
    playNotificationSound();

    openWhatsApp(items as any, {
      customerName: form.customerName,
      customerPhone: formatarTelefone(normalizedPhone),
      deliveryType: "retirada",
      scheduledDate: form.date,
      scheduledTime: form.time,
      paymentMethod: form.paymentMethod,
      generalNotes: form.generalNotes || undefined,
      deliveryFee: 0,
    });

    clearCart();
    setOpen(false);
    setStep(1);
    setTotalManualEdit(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto relative">
        {/* Progress Bar */}
        <div className="border-b border-neutral-800 px-4 py-3 flex items-center gap-3 sticky top-0 bg-neutral-900 z-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Passo {step} de 5
          </p>
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={classNames("flex-1 rounded-full h-1.5 transition-colors", step > i + 1 ? "bg-emerald-500" : step === i + 1 ? "bg-wine-500" : "bg-neutral-700")} />
            ))}
          </div>
        </div>

        {/* Step 1: Carrinho */}
        {step === 1 && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-neutral-400">Revise seus itens e adicione observacoes personalizadas</p>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {items.map((cartItem) => (
                <li key={cartItem.product.id} className="rounded-xl border border-neutral-800 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-800">
                      {cartItem.product.image_url ? (
                        <img src={cartItem.product.image_url} alt={cartItem.product.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-neutral-400">{cartItem.product.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{cartItem.product.name}</p>
                      <p className="text-xs text-neutral-400">{formatCurrency(cartItem.product.price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(cartItem.product.id, cartItem.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-white">-</button>
                      <span className="w-6 text-center text-sm font-bold text-white">{cartItem.quantity}</span>
                      <button onClick={() => updateQuantity(cartItem.product.id, cartItem.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-white">+</button>
                    </div>
                  </div>
                  <div>
                    <button onClick={() => setExpandedNotes(expandedNotes === cartItem.product.id ? null : cartItem.product.id)} className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors">
                      {cartItem.notes ? "✎ Observacao adicionada" : "+ Adicionar observacao"}
                    </button>
                    {expandedNotes === cartItem.product.id && (
                      <input type="text" placeholder="Ex: Sem gordura, com cobertura extra..." value={cartItem.notes || ""} onChange={(e) => updateNotes(cartItem.product.id, e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-wine-500" autoFocus />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-right text-xs text-neutral-500">{items.length} {items.length === 1 ? "item" : "itens"} no carrinho</p>
          </div>
        )}

        {/* Step 2: Data (Retirada apenas) */}
        {step === 2 && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-neutral-400">Selecione a data de retirada</p>

            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-center">
              <span className="text-lg">🏪</span>
              <p className="mt-1 text-sm font-semibold text-purple-400">Retirada na Loja</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Data de Retirada</label>
              <div className="relative" ref={calendarRef}>
                <button type="button" onClick={() => setCalendarOpen(!calendarOpen)} className="w-full flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white transition-colors hover:border-wine-500/50">
                  <svg className="h-4 w-4 text-wine-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {form.date ? <span className="font-semibold">{formatDateBR(form.date)}</span> : <span className="text-neutral-500">Selecione uma data...</span>}
                  <svg className={`h-4 w-4 ml-auto text-neutral-500 transition-transform ${calendarOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {calendarOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
                    <div className="mb-3 flex items-center justify-between">
                      <button type="button" onClick={() => navigateCal(-1)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                      <span className="text-sm font-bold text-white">{MONTH_NAMES[calMonth]} {calYear}</span>
                      <button type="button" onClick={() => navigateCal(1)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                    <div className="mb-1 grid grid-cols-7 gap-0.5">
                      {DAY_NAMES.map((d) => (<div key={d} className="py-1 text-center text-[9px] font-bold uppercase tracking-wider text-neutral-500">{d}</div>))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {Array.from({ length: firstDay }).map((_, i) => (<div key={`empty-${i}`} />))}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const date = new Date(calYear, calMonth, day);
                        const isSelected = form.date === formatDateStr(date);
                        const isPast = isBeforeDay(date, minDate);
                        const isToday = isSameDay(date, new Date());
                        return (
                          <button key={day} type="button" onClick={() => selectDate(day)} disabled={isPast}
                            className={classNames("flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium transition-all", isPast ? "text-neutral-700 cursor-not-allowed" : isSelected ? "bg-wine-500 text-white shadow-lg shadow-wine-500/20" : isToday ? "border border-wine-500/40 text-wine-400" : "text-neutral-300 hover:bg-neutral-800")}>
                            {day}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-center text-[10px] text-neutral-500">Minimo: amanha · Encomendas especiais: 24h de antecedencia</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Horario */}
        {step === 3 && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-neutral-400">Selecione o horario de retirada</p>
            <div className="space-y-2">
              {TIME_SLOTS.map((slot) => (
                <button key={slot.value} type="button" onClick={() => setForm((f) => ({ ...f, time: slot.value }))}
                  className={classNames("w-full flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left transition-all", form.time === slot.value ? "border-wine-500 bg-wine-500/15 shadow-lg shadow-wine-500/10" : "border-neutral-700 bg-neutral-800 hover:border-neutral-600")}>
                  <div className={classNames("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold", form.time === slot.value ? "bg-wine-500 text-white" : "bg-neutral-700 text-neutral-400")}>
                    {slot.value.split(":")[0]}
                  </div>
                  <div className="flex-1">
                    <p className={classNames("text-sm font-bold", form.time === slot.value ? "text-wine-400" : "text-white")}>{slot.label}</p>
                    <p className="text-[11px] text-neutral-500">{slot.desc}</p>
                  </div>
                  {form.time === slot.value && <svg className="h-5 w-5 text-wine-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500 text-center">Horarios de atendimento: {config.timeSlots.join(" · ")}</p>
          </div>
        )}

        {/* Step 4: Dados do cliente */}
        {step === 4 && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-neutral-400">Seus dados e observacoes do pedido</p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome Completo <span className="text-red-500">*</span></label>
              <input type="text" required value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500" placeholder="Nome completo" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Telefone / WhatsApp <span className="text-red-500">*</span></label>
              <input type="tel" inputMode="numeric" required value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: mascaraTelefone(e.target.value) }))} onBlur={(e) => setForm((f) => ({ ...f, customerPhone: estadoTelefone(f.customerPhone || e.target.value).valor }))} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500" placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Observacoes Gerais do Pedido</label>
              <textarea value={form.generalNotes} onChange={(e) => setForm((f) => ({ ...f, generalNotes: e.target.value }))} rows={3} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500 resize-none" placeholder="Detalhes de personalizacao, restricoes, preferencias..." />
            </div>
          </div>
        )}

        {/* Step 5: Pagamento + Valor + Resumo */}
        {step === 5 && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-neutral-400">Confirme o valor e forma de pagamento</p>

            {/* Valor Total Editavel */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-amber-400">Valor Total do Pedido</label>
                <button type="button" onClick={() => setTotalManualEdit(!totalManualEdit)}
                  className={classNames("rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors", totalManualEdit ? "bg-amber-500/20 text-amber-300" : "bg-neutral-800 text-neutral-500 hover:text-neutral-300")}>
                  {totalManualEdit ? "Editando" : "Editar Valor"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-neutral-500">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.finalTotal || ""}
                  onChange={(e) => { setForm((f) => ({ ...f, finalTotal: parseFloat(e.target.value) || 0 })); setTotalManualEdit(true); }}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-xl font-bold text-white outline-none focus:border-amber-500"
                />
              </div>
              {!totalManualEdit && subtotal !== form.finalTotal && (
                <p className="mt-1 text-[10px] text-neutral-500">Valor calculado automaticamente</p>
              )}
              {totalManualEdit && (
                <p className="mt-1 text-[10px] text-amber-400">Ajuste o valor se necessario (ex: adicionais, descontos)</p>
              )}
            </div>

            {/* Resumo */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-800/50 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Resumo do Pedido</p>
              {items.map((cartItem) => (
                <div key={`${cartItem.product.id}${cartItem.is_brinde ? "-brinde" : ""}`} className="space-y-0.5">
                  <div className="flex justify-between text-sm text-neutral-300">
                    <span>
                      {cartItem.is_brinde && "🎁 "}
                      {cartItem.product.name} x{cartItem.quantity}
                    </span>
                    {cartItem.is_brinde ? (
                      <span className="font-semibold text-emerald-400">
                        <span className="mr-1 text-neutral-500 line-through">{formatCurrency(cartItem.product.price)}</span>
                        GRÁTIS
                      </span>
                    ) : (
                      <span>{formatCurrency(cartItem.product.price * cartItem.quantity)}</span>
                    )}
                  </div>
                  {cartItem.notes && <p className="text-[11px] text-neutral-500 pl-2">obs: {cartItem.notes}</p>}
                </div>
              ))}
              <div className="border-t border-neutral-700 pt-2 mt-2 space-y-1 text-xs text-neutral-400">
                <p><span className="text-neutral-500">Tipo:</span> Retirada</p>
                <p><span className="text-neutral-500">Data:</span> {formatDateBR(form.date)}</p>
                <p><span className="text-neutral-500">Horario:</span> {form.time}</p>
                <p><span className="text-neutral-500">Cliente:</span> {form.customerName}</p>
                {form.generalNotes && <p><span className="text-neutral-500">Obs:</span> {form.generalNotes}</p>}
              </div>
            </div>

            {/* Pagamento */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Forma de Pagamento</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "pix", label: "PIX", icon: "💠" },
                  { key: "dinheiro", label: "Dinheiro", icon: "💵" },
                  { key: "cartao_debito", label: "Cartao Debito", icon: "💳" },
                  { key: "cartao_credito", label: "Cartao Credito", icon: "💳" },
                ] as const).map((m) => (
                  <label key={m.key} className={classNames("flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all cursor-pointer", form.paymentMethod === m.key ? "border-wine-500 bg-wine-500/15 text-wine-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600")}>
                    <input type="radio" name="payment" value={m.key} checked={form.paymentMethod === m.key} onChange={() => setForm((f) => ({ ...f, paymentMethod: m.key }))} className="sr-only" />
                    <span className="text-lg">{m.icon}</span>
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <button onClick={prevStep} className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">Anterior</button>
                <button onClick={completeOrder} disabled={!isValid()} className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600 disabled:opacity-50 disabled:cursor-not-allowed">Finalizar via WhatsApp</button>
              </div>
            </div>
          </div>
        )}

        {/* Navegacao steps 1-4 */}
        {step < 5 && (
          <div className="border-t border-neutral-800 px-4 py-3 space-y-2">
            {!isValid() && validationHint() && <p className="text-[11px] text-amber-400 text-center">{validationHint()}</p>}
            <div className="flex gap-2">
              {step > 1 && <button onClick={prevStep} className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">Anterior</button>}
              <button onClick={nextStep} disabled={!isValid()} className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600 disabled:opacity-50 disabled:cursor-not-allowed">Proximo</button>
            </div>
          </div>
        )}

        <button onClick={() => { setOpen(false); setStep(1); setTotalManualEdit(false); }} className="absolute top-3 right-3 text-neutral-500 hover:text-white text-xl leading-none transition-colors">✕</button>
      </div>
    </div>
  );
}
