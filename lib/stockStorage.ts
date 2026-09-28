"use client";

import { SEED_BATCHES } from "./seedData";

export const STOCK_KEY = "ilma-stock";
export const STOCK_BRANDS_KEY = "ilma-stock-brands";
export const BATCH_KEY = "ilma-batches";
export const SEED_KEY = "ilma-seeded-v3";
export const STOCK_CHANGED_EVENT = "ilma-stock-changed";
export const SALDOS_ZERO_KEY = "ilma-saldos-zero-v1";
export const LOTES_LIMPOS_KEY = "ilma-lotes-limpos-v1";

export function limparLotesUmaVez(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(LOTES_LIMPOS_KEY)) return;
    saveBatchesData([]);
    localStorage.setItem(LOTES_LIMPOS_KEY, "1");
    localStorage.setItem(SALDOS_ZERO_KEY, "1");
  } catch {}
}

export function notifyStockChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STOCK_CHANGED_EVENT));
}

export function saveStockData(items: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STOCK_KEY, JSON.stringify(items));
  notifyStockChanged();
}

export function saveBatchesData(batches: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BATCH_KEY, JSON.stringify(batches));
  notifyStockChanged();
}

export function loadStockData<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
    }
  } catch {}
  return null;
}

export function loadBatchesData<T>(): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BATCH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as T[];
    }
  } catch {}
  return [];
}

export function seedBatchesIfEmpty(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(LOTES_LIMPOS_KEY)) return;
    const existentes = loadBatchesData<{ insumoId?: string }>();
    const comLote = new Set(existentes.map((b) => b.insumoId));
    const faltantes = SEED_BATCHES.filter((b) => !comLote.has(b.insumoId));
    if (faltantes.length === 0) return;
    saveBatchesData([...existentes, ...faltantes]);
  } catch {}
}
