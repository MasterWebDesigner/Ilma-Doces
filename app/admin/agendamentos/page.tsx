"use client";

import { useState, useEffect, useRef } from "react";
import { useOrderStore } from "@/lib/store";
import { confirmOrderWhatsApp } from "@/lib/whatsapp";
import { formatCurrency, paymentLabelOf } from "@/lib/utils";
import type { Order, OrderStatus, PaymentMethod } from "@/types/database";
import { formatarTelefone, mascaraTelefone, higienizarTelefone, estadoTelefone, MENSAGEM_WHATSAPP_INVALIDO } from "@/lib/phone";

type ViewMode = "dia" | "grade" | "lista";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  em_producao: "Em Produção",
  pronto: "Pronto",
  saiu_entrega: "Saiu Entrega",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  confirmado: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  em_producao: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  pronto: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  saiu_entrega: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  concluido: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelado: "bg-red-500/15 text-red-400 border-red-500/30",
};

const TIME_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const h = Math.floor(i / 2 + 8);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAY_NAMES_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const DAY_NAMES_MIN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

export default function AdminAgendamentos() {
  const orders = useOrderStore((s) => s.orders);
  const updateStatus = useOrderStore((s) => s.updateStatus);

  const [viewMode, setViewMode] = useState<ViewMode>("dia");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scheduledOrders = orders.filter((o) => o.scheduledDate);

  function getOrdersForDate(date: Date): Order[] {
    const dateStr = formatDate(date);
    return scheduledOrders.filter((o) => {
      if (o.scheduledDate !== dateStr) return false;
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone.includes(q);
        const matchItems = o.items.some((i) => i.product.name.toLowerCase().includes(q));
        if (!matchName && !matchPhone && !matchItems) return false;
      }
      return true;
    });
  }

  function getDaysWithOrders(year: number, month: number): number[] {
    const days = new Set<number>();
    scheduledOrders.forEach((o) => {
      if (!o.scheduledDate) return;
      const d = parseDate(o.scheduledDate);
      if (d && d.getFullYear() === year && d.getMonth() === month) {
        days.add(d.getDate());
      }
    });
    return [...days];
  }

  function navigateMonth(delta: number) {
    let newMonth = calMonth + delta;
    let newYear = calYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  }

  function selectDate(day: number) {
    setSelectedDate(new Date(calYear, calMonth, day));
    setCalendarOpen(false);
  }

  function goToToday() {
    const today = new Date();
    setSelectedDate(today);
    setCalMonth(today.getMonth());
    setCalYear(today.getFullYear());
    setCalendarOpen(false);
  }

  const weekDays = getWeekDays(selectedDate);
  const todayOrders = getOrdersForDate(selectedDate);
  const daysWithOrders = getDaysWithOrders(calYear, calMonth);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-0">
      {/* ═══════ TOP BAR: View Switcher + Calendar Button ═══════ */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-6 py-4">
        <div className="flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-1">
          {(["dia", "grade", "lista"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-5 py-2 text-xs font-bold transition-all ${
                viewMode === mode
                  ? "bg-[#8B1D22] text-white border border-[#8B1D22] shadow-sm dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 dark:shadow-amber-500/10"
                  : "text-stone-700 hover:bg-stone-100 hover:text-stone-900 border border-transparent dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              }`}
            >
              {mode === "dia" ? "Dia" : mode === "grade" ? "Grade" : "Lista"}
            </button>
          ))}
        </div>

        <div className="relative" ref={calendarRef}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setCalendarOpen(!calendarOpen)}
              className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:border-amber-500/40 hover:bg-neutral-700"
            >
              {MONTH_NAMES[calMonth]} {calYear}
              <svg className={`h-4 w-4 text-neutral-500 transition-transform ${calendarOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {calendarOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <button onClick={() => navigateMonth(-1)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-sm font-bold text-white">{MONTH_NAMES[calMonth]} {calYear}</span>
                <button onClick={() => navigateMonth(1)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1">
                {DAY_NAMES_MIN.map((d) => (
                  <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const date = new Date(calYear, calMonth, day);
                  const isSelected = isSameDay(date, selectedDate);
                  const isTodayDate = isSameDay(date, new Date());
                  const hasOrders = daysWithOrders.includes(day);

                  return (
                    <button
                      key={day}
                      onClick={() => selectDate(day)}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-[#8B1D22] text-white border border-[#8B1D22] dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
                          : isTodayDate
                            ? "bg-[#8B1D22]/10 text-[#8B1D22] border border-[#8B1D22]/30 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                            : "bg-white text-stone-700 border border-[#8B1D22]/30 hover:bg-stone-50 dark:bg-transparent dark:text-neutral-400 dark:border-transparent dark:hover:bg-neutral-800 dark:hover:text-white"
                      }`}
                    >
                      {day}
                      {hasOrders && (
                        <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#8B1D22] dark:bg-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-center">
                <button
                  onClick={goToToday}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#8B1D22] transition-colors hover:bg-[#8B1D22]/10 dark:text-amber-400 dark:hover:bg-amber-500/10"
                >
                  Ir para Hoje
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ WEEK STRIP ═══════ */}
      <div className="border-b border-neutral-800 bg-neutral-950 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>

          <div className="grid flex-1 grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const isSelected = isSameDay(d, selectedDate);
              const todayCheck = isSameDay(d, new Date());
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={`flex flex-col items-center rounded-xl py-3 transition-all ${
                    isSelected
                      ? "bg-[#8B1D22] border border-[#8B1D22] shadow-sm dark:bg-amber-500/15 dark:border-amber-500/40 dark:shadow-amber-500/10"
                      : "bg-white border border-[#8B1D22]/30 hover:bg-stone-50 dark:bg-transparent dark:border-transparent dark:hover:bg-neutral-900"
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? "text-white dark:text-amber-400" : "text-stone-500 dark:text-neutral-500"}`}>
                    {DAY_NAMES_SHORT[d.getDay()]}
                  </span>
                  <span className={`mt-1 text-2xl font-bold ${isSelected ? "text-white dark:text-amber-300" : todayCheck ? "text-stone-900 dark:text-white" : "text-stone-700 dark:text-neutral-400"}`}>
                    {d.getDate()}
                  </span>
                  {daysWithOrders.includes(d.getDate()) && d.getMonth() === calMonth && (
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#8B1D22] dark:bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>

          <button
            onClick={goToToday}
            className="flex-shrink-0 rounded-lg border border-[#8B1D22] bg-[#8B1D22] px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-[#721519] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* ═══════ DATE LABEL ═══════ */}
      <div className="px-6 pt-4 pb-2">
        <p className="text-sm font-bold text-[#8B1D22] dark:text-amber-400">
          {isToday ? "Hoje " : ""}
          {DAY_NAMES_MIN[selectedDate.getDay()]}.

          {formatShortDate(selectedDate).replace(".", " de set.")}
        </p>
      </div>

      {/* ═══════ FILTERS ═══════ */}
      <div className="flex flex-wrap items-center gap-3 px-6 pb-4">
        {/* Status filters */}
        <div className="flex gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
          {["todos", "pendente", "confirmado", "em_producao", "concluido", "cancelado"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                statusFilter === s
                  ? "bg-[#8B1D22] text-white border border-[#8B1D22] dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40"
                  : "text-stone-700 hover:bg-stone-100 hover:text-stone-900 border border-transparent dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              }`}
            >
              {s === "todos" ? "Todos" : STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="ml-auto flex-1 max-w-xs">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-amber-500"
              placeholder="Buscar cliente, produto ou telefone..."
            />
          </div>
        </div>
      </div>

      {/* ═══════ DAY VIEW ═══════ */}
      {viewMode === "dia" && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 mx-6 mb-6">
          <div className="divide-y divide-neutral-800/50">
            {TIME_SLOTS.map((time) => {
              const slotOrders = todayOrders.filter((o) => o.scheduledTime === time);
              return (
                <div key={time} className="flex min-h-[52px]">
                  <div className="flex w-20 flex-shrink-0 items-start justify-end border-r border-neutral-800 px-3 pt-2.5">
                    <span className="text-xs font-semibold text-neutral-600">{time}</span>
                  </div>
                  <div className="flex-1 px-4 py-2">
                    {slotOrders.length === 0 ? (
                      <div className="flex h-full items-center pt-1">
                        <span className="text-xs text-neutral-700">—</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {slotOrders.map((order) => (
                          <button
                            key={order.id}
                            onClick={() => setDetailOrder(order)}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-left transition-all hover:border-amber-500/30 hover:bg-neutral-800"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">{order.customerName}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${STATUS_COLORS[order.status] ?? "bg-neutral-700 text-neutral-400"}`}>
                                  {STATUS_LABELS[order.status] ?? order.status}
                                </span>
                                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-purple-500/15 text-purple-400">
                                  Retirada
                                </span>
                              </div>
                              <span className="text-sm font-bold text-emerald-400">R$ {order.total.toFixed(2).replace(".", ",")}</span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-500 line-clamp-1">
                              {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(", ")}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ GRID/WEEK VIEW ═══════ */}
      {viewMode === "grade" && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 mx-6 mb-6 overflow-x-auto">
          <div className="min-w-[700px]">
            {(() => {
              const gridWeekDays = getWeekDays(selectedDate);
              return (
                <>
                  <div className="grid grid-cols-8 border-b border-neutral-800">
                    <div className="border-r border-neutral-800 px-2 py-3" />
                    {gridWeekDays.map((d) => {
                      const todayCheck = isSameDay(d, new Date());
                      const isSelected = isSameDay(d, selectedDate);
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => setSelectedDate(d)}
                          className={`border-r border-neutral-800 px-2 py-3 text-center transition-colors ${
                            isSelected ? "bg-[#8B1D22] dark:bg-amber-500/10" : todayCheck ? "bg-neutral-800/50" : ""
                          }`}
                        >
                          <p className={`text-[10px] font-semibold uppercase ${isSelected ? "text-white/80 dark:text-neutral-500" : "text-neutral-500"}`}>{DAY_NAMES_SHORT[d.getDay()]}</p>
                          <p className={`text-lg font-bold ${isSelected ? "text-white dark:text-amber-300" : todayCheck ? "text-stone-900 dark:text-white" : "text-stone-700 dark:text-neutral-400"}`}>{d.getDate()}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-8">
                    <div className="border-r border-neutral-800">
                      {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((time) => (
                        <div key={time} className="h-14 border-b border-neutral-800/50 px-2 pt-1">
                          <span className="text-[10px] font-semibold text-neutral-600">{time}</span>
                        </div>
                      ))}
                    </div>
                    {gridWeekDays.map((d) => {
                      const dayOrders = getOrdersForDate(d);
                      return (
                        <div key={d.toISOString()} className="border-r border-neutral-800">
                          {TIME_SLOTS.filter((_, i) => i % 2 === 0).map((time) => {
                            const slotOrders = dayOrders.filter((o) => o.scheduledTime === time);
                            return (
                              <div key={time} className="h-14 border-b border-neutral-800/50 p-1">
                                {slotOrders.map((order) => (
                                  <button
                                    key={order.id}
                                    onClick={() => setDetailOrder(order)}
                                    className="mb-0.5 w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-semibold transition-colors hover:brightness-110"
                                    style={{
                                       backgroundColor: order.status === "concluido" ? "rgba(16,185,129,0.15)" : (order.status as string) === "cancelado" ? "rgba(239,68,68,0.15)" : "rgba(168,85,247,0.15)",
                                       color: order.status === "concluido" ? "#34d399" : (order.status as string) === "cancelado" ? "#f87171" : "#c084fc",
                                    }}
                                  >
                                    {order.customerName}
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════ LIST VIEW ═══════ */}
      {viewMode === "lista" && (
        <div className="mx-6 mb-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Horario</th>
                <th className="px-6 py-3">Cliente</th>
                <th className="px-6 py-3">Itens</th>
                <th className="px-6 py-3 text-center">Tipo</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-center">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {scheduledOrders
                .filter((o) => {
                  if (statusFilter !== "todos" && o.status !== statusFilter) return false;
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const matchName = o.customerName.toLowerCase().includes(q);
                    const matchPhone = o.customerPhone.includes(q);
                    const matchItems = o.items.some((i) => i.product.name.toLowerCase().includes(q));
                    if (!matchName && !matchPhone && !matchItems) return false;
                  }
                  return true;
                })
                .sort((a, b) => {
                  const da = a.scheduledDate ?? "";
                  const db = b.scheduledDate ?? "";
                  if (da !== db) return da.localeCompare(db);
                  return (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "");
                })
                .map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-neutral-800/30">
                    <td className="px-6 py-4 text-sm text-white">
                      {order.scheduledDate ? parseDate(order.scheduledDate)?.toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-amber-400">{order.scheduledTime ?? "—"}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-white">{order.customerName}</p>
                      <p className="text-xs text-neutral-500">{formatarTelefone(order.customerPhone)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="max-w-xs text-xs text-neutral-400 line-clamp-1">
                        {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(", ")}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-400">
                        Retirada
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[order.status] ?? "bg-neutral-700 text-neutral-400"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-emerald-400">
                      R$ {order.total.toFixed(2).replace(".", ",")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setDetailOrder(order)}
                        className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/25"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {scheduledOrders.length === 0 && (
            <div className="py-12 text-center text-neutral-500">
              <p className="text-lg font-semibold">Nenhum pedido agendado.</p>
              <p className="mt-1 text-sm">Pedidos com data agendada aparecerão aqui.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ ORDER DETAIL MODAL ═══════ */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetailOrder(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{detailOrder.customerName}</h2>
                <p className="text-sm text-neutral-500">{formatarTelefone(detailOrder.customerPhone)}</p>
              </div>
              <button onClick={() => setDetailOrder(null)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${STATUS_COLORS[detailOrder.status] ?? "bg-neutral-700 text-neutral-400"}`}>
                {STATUS_LABELS[detailOrder.status] ?? detailOrder.status}
              </span>
              <span className="rounded-full px-3 py-1 text-[10px] font-bold bg-purple-500/15 text-purple-400">
                Retirada
              </span>
              <span className="rounded-full bg-neutral-800 px-3 py-1 text-[10px] font-bold text-neutral-400">
                {paymentLabelOf(detailOrder.paymentMethod)}
              </span>
            </div>

            <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex items-center gap-2 text-sm">
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-neutral-400">
                  {detailOrder.scheduledDate ? parseDate(detailOrder.scheduledDate)?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Sem data"}
                </span>
                {detailOrder.scheduledTime && (
                  <>
                    <span className="text-neutral-600">as</span>
                    <span className="font-bold text-amber-300">{detailOrder.scheduledTime}</span>
                  </>
                )}
              </div>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Itens</h3>
              <div className="space-y-2">
                {detailOrder.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {item.is_brinde && "🎁 "}
                        {item.quantity}x {item.product.name}
                        {item.is_brinde && (
                          <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                            BRINDE FIDELIDADE
                          </span>
                        )}
                      </p>
                      {item.notes && <p className="mt-0.5 text-xs text-amber-400/80">Obs: {item.notes}</p>}
                    </div>
                    {item.is_brinde ? (
                      <span className="text-sm font-bold text-emerald-400">
                        <span className="mr-1 text-neutral-500 line-through">{formatCurrency(item.product.price)}</span>
                        R$ 0,00
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-emerald-400">
                        R$ {(item.product.price * item.quantity).toFixed(2).replace(".", ",")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {detailOrder.generalNotes && (
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Observacoes Gerais</p>
                <p className="mt-1 text-sm text-neutral-300">{detailOrder.generalNotes}</p>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3">
              <span className="text-sm font-semibold text-neutral-400">Total</span>
              <span className="text-xl font-bold text-emerald-400">R$ {detailOrder.total.toFixed(2).replace(".", ",")}</span>
            </div>

            <div className="mt-4 flex gap-3">
              <button onClick={() => setDetailOrder(null)} className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">
                Fechar
              </button>

              <button
                onClick={() => { setEditOrder(detailOrder); setDetailOrder(null); }}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
              >
                Editar
              </button>

              {detailOrder.status === "pendente" && (
                <button
                  onClick={() => {
                    updateStatus(detailOrder.id, "confirmado");
                    confirmOrderWhatsApp({
                      customerName: detailOrder.customerName,
                      customerPhone: detailOrder.customerPhone,
                      deliveryType: detailOrder.deliveryType,
                      scheduledDate: detailOrder.scheduledDate,
                      scheduledTime: detailOrder.scheduledTime,
                      items: detailOrder.items,
                      total: detailOrder.total,
                    });
                    setDetailOrder({ ...detailOrder, status: "confirmado" });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Confirmar e Avisar Cliente
                </button>
              )}

              {detailOrder.status !== "pendente" && (
                <a
                  href={`https://wa.me/55${detailOrder.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Ola ${detailOrder.customerName}, seu pedido esta pronto!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOrder && (
        <EditOrderModal order={editOrder} onClose={() => setEditOrder(null)} />
      )}
    </div>
  );
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_debito", label: "Cartao Debito" },
  { value: "cartao_credito", label: "Cartao Credito" },
];

function EditOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrder } = useOrderStore();
  const [form, setForm] = useState({
    customerName: order.customerName,
    customerPhone: mascaraTelefone(order.customerPhone),
    total: order.total,
    paymentMethod: order.paymentMethod,
    status: order.status,
    scheduledDate: order.scheduledDate || "",
    scheduledTime: order.scheduledTime || "",
    generalNotes: order.generalNotes || "",
  });
  const [phoneError, setPhoneError] = useState("");

  function handleSave() {
    const phone = higienizarTelefone(form.customerPhone);
    if (!phone) {
      setPhoneError(MENSAGEM_WHATSAPP_INVALIDO);
      return;
    }
    setPhoneError("");
    updateOrder(order.id, {
      customerName: form.customerName,
      customerPhone: phone,
      total: form.total,
      paymentMethod: form.paymentMethod,
      status: form.status,
      scheduledDate: form.scheduledDate || undefined,
      scheduledTime: form.scheduledTime || undefined,
      generalNotes: form.generalNotes || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-neutral-900 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Editar Agendamento</h2>
            <p className="text-xs text-neutral-500">#{order.orderNumber || order.id.slice(-8)}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome</label>
              <input type="text" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Telefone</label>
              <input type="tel" inputMode="numeric" value={form.customerPhone} onChange={(e) => { setPhoneError(""); setForm((f) => ({ ...f, customerPhone: mascaraTelefone(e.target.value) })); }}
                onBlur={() => { const e = estadoTelefone(form.customerPhone); setForm((f) => ({ ...f, customerPhone: e.valor })); setPhoneError(e.erro); }}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" />
              {phoneError && <p className="mt-1.5 text-xs font-medium text-red-400">{phoneError}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Data Agendada</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Horario</label>
              <select value={form.scheduledTime} onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500">
                <option value="">Selecione...</option>
                <option value="10:00">10:00</option>
                <option value="11:30">11:30</option>
                <option value="14:00">14:00</option>
                <option value="16:30">16:30</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Status</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <button key={s} onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${form.status === s ? STATUS_COLORS[s] + " ring-1 ring-white/20" : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-white"}`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((m) => (
                <button key={m.value} onClick={() => setForm((f) => ({ ...f, paymentMethod: m.value }))}
                  className={`rounded-lg border-2 px-3 py-2.5 text-xs font-semibold transition-all ${form.paymentMethod === m.value ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Valor Total (R$)</label>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 font-bold">R$</span>
              <input type="number" step="0.01" min="0" value={form.total} onChange={(e) => setForm((f) => ({ ...f, total: parseFloat(e.target.value) || 0 }))}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-lg font-bold text-white outline-none focus:border-amber-500" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Observacoes Gerais</label>
            <textarea value={form.generalNotes} onChange={(e) => setForm((f) => ({ ...f, generalNotes: e.target.value }))} rows={2}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500 resize-none"
              placeholder="Observacoes do pedido..." />
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Itens do Pedido</p>
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-neutral-400 py-0.5">
                <span>
                  {item.is_brinde && "🎁 "}
                  {item.product.name} x{item.quantity}{item.notes ? ` (${item.notes})` : ""}
                </span>
                {item.is_brinde ? (
                  <span className="font-bold text-emerald-400">GRÁTIS (R$ 0,00)</span>
                ) : (
                  <span className="text-emerald-400">{formatCurrency(item.product.price * item.quantity)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 border-t border-neutral-800 px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">Cancelar</button>
          <button onClick={handleSave} className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400">Salvar Alteracoes</button>
        </div>
      </div>
    </div>
  );
}
