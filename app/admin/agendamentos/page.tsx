"use client";

import { useState, useEffect, useRef } from "react";
import { useOrderStore } from "@/lib/store";
import { formatarTelefone } from "@/lib/phone";
import type { Order, OrderStatus } from "@/types/database";
import { OrderDetailsDrawer, STATUS_CONFIG } from "@/components/admin/OrderDetailsDrawer";
import { EditOrderModal, EncerrarPedidoModal, FinalizeOrderModal, RegistrarSinalModal } from "@/components/admin/OrderModals";

type ViewMode = "dia" | "grade" | "lista";

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

const HORA_PADRAO = TIME_SLOTS[0];

function normalizarHora(h?: string): string | null {
  if (!h) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(h.trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function horaCelula(o: Order): string {
  const h = normalizarHora(o.scheduledTime);
  return h ? `${h.slice(0, 2)}:00` : HORA_PADRAO;
}

export default function AdminAgendamentos() {
  const orders = useOrderStore((s) => s.orders);

  const [viewMode, setViewMode] = useState<ViewMode>("dia");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [finalizeOrder, setFinalizeOrder] = useState<Order | null>(null);
  const [sinalOrder, setSinalOrder] = useState<Order | null>(null);
  const [encerrarPedido, setEncerrarPedido] = useState<{ order: Order; tipo: "recusar" | "cancelar" } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const drawerOrder = drawerOrderId ? orders.find((o) => o.id === drawerOrderId) ?? null : null;

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
                  ? "bg-[#8B1D22] text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
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
                          ? "bg-[#8B1D22] text-white shadow-sm"
                          : isTodayDate
                            ? "bg-[#8B1D22]/10 text-[#8B1D22] border border-[#8B1D22]/30"
                            : "bg-white text-stone-700 border border-[#8B1D22]/30 hover:bg-stone-50 dark:bg-transparent dark:text-neutral-400 dark:border-transparent dark:hover:bg-neutral-800 dark:hover:text-white"
                      }`}
                    >
                      {day}
                      {hasOrders && (
                        <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#8B1D22]" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-center">
                <button
                  onClick={goToToday}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#8B1D22] transition-colors hover:bg-[#8B1D22]/10"
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
                      ? "bg-[#8B1D22] border border-[#8B1D22] shadow-sm"
                      : "bg-white border border-[#8B1D22]/30 hover:bg-stone-50 dark:bg-transparent dark:border-transparent dark:hover:bg-neutral-900"
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? "text-white" : "text-stone-500 dark:text-neutral-500"}`}>
                    {DAY_NAMES_SHORT[d.getDay()]}
                  </span>
                  <span className={`mt-1 text-2xl font-bold ${isSelected ? "text-white" : todayCheck ? "text-stone-900 dark:text-white" : "text-stone-700 dark:text-neutral-400"}`}>
                    {d.getDate()}
                  </span>
                  {daysWithOrders.includes(d.getDate()) && d.getMonth() === calMonth && (
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#8B1D22]" />
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
            className="flex-shrink-0 rounded-lg border border-[#8B1D22] bg-[#8B1D22] px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-[#721519]"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* ═══════ DATE LABEL ═══════ */}
      <div className="px-6 pt-4 pb-2">
          <p className="text-sm font-bold text-[#8B1D22]">
          {isToday ? "Hoje " : ""}
          {DAY_NAMES_MIN[selectedDate.getDay()]}.

          {formatShortDate(selectedDate).replace(".", " de set.")}
        </p>
      </div>

      {/* ═══════ FILTERS ═══════ */}
      <div className="flex flex-wrap items-center gap-3 px-6 pb-4">
        {/* Status filters */}
        <div className="flex gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
          {["todos", "pendente", "confirmado", "em_producao", "concluido", "recusado", "cancelado"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                statusFilter === s
                  ? "bg-[#8B1D22] text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
              }`}
            >
              {s === "todos" ? "Todos" : STATUS_CONFIG[s as OrderStatus].label}
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
      {viewMode === "dia" && (() => {
        const comHorario = todayOrders.filter((o) => normalizarHora(o.scheduledTime));
        const semHorario = todayOrders.filter((o) => !normalizarHora(o.scheduledTime));
        const diaExtras = comHorario
          .map((o) => normalizarHora(o.scheduledTime))
          .filter((t): t is string => !!t && !TIME_SLOTS.includes(t));
        const diaSlots = [...new Set([...TIME_SLOTS, ...diaExtras])].sort();
        return (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 mx-6 mb-6">
          {semHorario.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800/50 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Sem horário definido</span>
              {semHorario.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setDrawerOrderId(order.id)}
                  className="rounded-full border border-neutral-700 bg-neutral-800/50 px-3 py-1 text-xs font-semibold text-neutral-300 transition-colors hover:border-amber-500/40 hover:text-white"
                >
                  {order.customerName}
                </button>
              ))}
            </div>
          )}
          <div className="divide-y divide-neutral-800/50">
            {diaSlots.map((time) => {
              const slotOrders = comHorario.filter((o) => normalizarHora(o.scheduledTime) === time);
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
                            onClick={() => setDrawerOrderId(order.id)}
                            className="w-full cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 text-left transition-all hover:border-amber-500/30 hover:bg-neutral-800"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">{order.customerName}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] ${STATUS_CONFIG[order.status].color}`}>
                                  {STATUS_CONFIG[order.status].label}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-purple-500/15 dark:text-purple-400">
                                  {order.deliveryType === "entrega" ? "Entrega" : "Retirada"}
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
        );
      })()}

      {/* ═══════ GRID/WEEK VIEW ═══════ */}
      {viewMode === "grade" && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 mx-6 mb-6 overflow-x-auto">
          <div className="min-w-[700px]">
            {(() => {
              const gridWeekDays = getWeekDays(selectedDate);
              const gradeHours = [...new Set([
                ...TIME_SLOTS.filter((_, i) => i % 2 === 0),
                ...scheduledOrders.map((o) => horaCelula(o)),
              ])].sort();
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
                            isSelected ? "bg-[#8B1D22]" : todayCheck ? "bg-neutral-800/50" : ""
                          }`}
                        >
                          <p className={`text-[10px] font-semibold uppercase ${isSelected ? "text-white/80 dark:text-neutral-500" : "text-neutral-500"}`}>{DAY_NAMES_SHORT[d.getDay()]}</p>
                          <p className={`text-lg font-bold ${isSelected ? "text-white" : todayCheck ? "text-stone-900 dark:text-white" : "text-stone-700 dark:text-neutral-400"}`}>{d.getDate()}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-8">
                    <div className="border-r border-neutral-800">
                      {gradeHours.map((time) => (
                        <div key={time} className="h-14 border-b border-neutral-800/50 px-2 pt-1">
                          <span className="text-[10px] font-semibold text-neutral-600">{time}</span>
                        </div>
                      ))}
                    </div>
                    {gridWeekDays.map((d) => {
                      const dayOrders = getOrdersForDate(d);
                      return (
                        <div key={d.toISOString()} className="border-r border-neutral-800">
                          {gradeHours.map((time) => {
                            const slotOrders = dayOrders.filter((o) => horaCelula(o) === time);
                            return (
                              <div key={time} className="h-14 border-b border-neutral-800/50 p-1">
                                {slotOrders.map((order) => (
                                  <button
                                    key={order.id}
                                    onClick={() => setDrawerOrderId(order.id)}
                                    className={`mb-0.5 w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-[10px] transition-colors hover:brightness-110 ${STATUS_CONFIG[order.status].color}`}
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
                <th className="px-6 py-2.5">Data</th>
                <th className="px-6 py-2.5">Horario</th>
                <th className="px-6 py-2.5">Cliente</th>
                <th className="px-6 py-2.5 text-center">Status</th>
                <th className="px-6 py-2.5 text-right">Total</th>
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
                  <tr
                    key={order.id}
                    onClick={() => setDrawerOrderId(order.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-neutral-800/30"
                  >
                    <td className="px-6 py-2 text-sm text-white">
                      {order.scheduledDate ? parseDate(order.scheduledDate)?.toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-6 py-2 text-sm font-bold text-amber-400">{normalizarHora(order.scheduledTime) ?? "—"}</td>
                    <td className="px-6 py-2">
                      <p className="font-semibold text-white">{order.customerName}</p>
                      <p className="phone-mask text-xs text-neutral-500">{formatarTelefone(order.customerPhone)}</p>
                    </td>
                    <td className="px-6 py-2 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${STATUS_CONFIG[order.status].color}`}>
                        {STATUS_CONFIG[order.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-2 text-right text-sm font-bold text-emerald-400">
                      R$ {order.total.toFixed(2).replace(".", ",")}
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

      {/* ═══════ DRAWER DE DETALHES ═══════ */}
      {drawerOrder && (
        <OrderDetailsDrawer
          order={drawerOrder}
          onClose={() => setDrawerOrderId(null)}
          onRegistrarSinal={() => setSinalOrder(drawerOrder)}
          onEditar={() => setEditingOrder(drawerOrder)}
          onFinalizar={() => setFinalizeOrder(drawerOrder)}
          onEncerrar={(tipo) => setEncerrarPedido({ order: drawerOrder, tipo })}
        />
      )}

      {finalizeOrder && <FinalizeOrderModal order={finalizeOrder} onClose={() => setFinalizeOrder(null)} />}
      {editingOrder && <EditOrderModal order={editingOrder} onClose={() => setEditingOrder(null)} />}
      {sinalOrder && <RegistrarSinalModal order={sinalOrder} onClose={() => setSinalOrder(null)} />}
      {encerrarPedido && (
        <EncerrarPedidoModal order={encerrarPedido.order} tipo={encerrarPedido.tipo} onClose={() => setEncerrarPedido(null)} />
      )}
    </div>
  );
}
