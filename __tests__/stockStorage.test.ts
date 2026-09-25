import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BATCH_KEY,
  STOCK_CHANGED_EVENT,
  STOCK_KEY,
  loadBatchesData,
  loadStockData,
  notifyStockChanged,
  saveBatchesData,
  saveStockData,
} from "@/lib/stockStorage";

describe("stockStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and loads stock", () => {
    const items = [{ id: "si-01", name: "Açúcar" }];
    saveStockData(items);
    expect(loadStockData()).toEqual(items);
    expect(localStorage.getItem(STOCK_KEY)).toBe(JSON.stringify(items));
  });

  it("saves and loads batches", () => {
    const batches = [{ id: "b-1", insumoId: "si-01", precoUnitario: 4.5 }];
    saveBatchesData(batches);
    expect(loadBatchesData()).toEqual(batches);
    expect(localStorage.getItem(BATCH_KEY)).toBe(JSON.stringify(batches));
  });

  it("returns null/empty when nothing stored", () => {
    expect(loadStockData()).toBeNull();
    expect(loadBatchesData()).toEqual([]);
  });

  it("dispatches STOCK_CHANGED_EVENT on save and notify", () => {
    const handler = vi.fn();
    window.addEventListener(STOCK_CHANGED_EVENT, handler);

    saveStockData([]);
    expect(handler).toHaveBeenCalledTimes(1);

    saveBatchesData([]);
    expect(handler).toHaveBeenCalledTimes(2);

    notifyStockChanged();
    expect(handler).toHaveBeenCalledTimes(3);

    window.removeEventListener(STOCK_CHANGED_EVENT, handler);
  });
});
