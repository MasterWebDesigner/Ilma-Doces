import { describe, it, expect, beforeEach } from "vitest";
import { SEED_STOCK, SEED_BATCHES, SEED_LINKS, SEED_BRANDS } from "@/lib/seedData";
import { obterPrecoMedioInsumo } from "@/lib/precoMedio";
import { converterCustoFicha } from "@/lib/units";
import { LOTES_LIMPOS_KEY, SALDOS_ZERO_KEY, limparLotesUmaVez, loadBatchesData, saveBatchesData, seedBatchesIfEmpty } from "@/lib/stockStorage";

describe("SEED_STOCK e SEED_BATCHES", () => {
  it("SEED_STOCK tem exatamente 99 itens únicos", () => {
    expect(SEED_STOCK).toHaveLength(99);
    expect(new Set(SEED_STOCK.map((i) => i.id)).size).toBe(99);
    expect(new Set(SEED_STOCK.map((i) => i.name)).size).toBe(99);
  });

  it("todos os 99 itens possuem pelo menos 1 lote de entrada", () => {
    const idsEstoque = new Set(SEED_STOCK.map((i) => i.id));
    const idsComLote = new Set(SEED_BATCHES.map((b) => b.insumoId));
    expect(idsComLote).toEqual(idsEstoque);
    expect(SEED_BATCHES.length).toBeGreaterThanOrEqual(99);
  });

  it("todos os lotes são válidos (id único, quantidade, preço, data)", () => {
    const ids = new Set<string>();
    for (const lote of SEED_BATCHES) {
      expect(lote.id, lote.id).toBeTruthy();
      expect(ids.has(lote.id), lote.id).toBe(false);
      ids.add(lote.id);
      expect(SEED_STOCK.some((i) => i.id === lote.insumoId), lote.id).toBe(true);
      expect(lote.quantidadeInicial, lote.id).toBeGreaterThan(0);
      expect(lote.quantidadeRestante, lote.id).toBe(lote.quantidadeInicial);
      expect(lote.precoUnitario, lote.id).toBeGreaterThan(0);
      expect(lote.dataEntrada, lote.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("marca de cada lote é vazia (Sem marca) ou vinculada ao item", () => {
    const brandIds = new Set(SEED_BRANDS.map((b) => b.id));
    for (const lote of SEED_BATCHES) {
      if (lote.brandId === "") {
        expect(SEED_LINKS[lote.insumoId], lote.id).toBeUndefined();
      } else {
        expect(brandIds.has(lote.brandId), lote.id).toBe(true);
        expect(SEED_LINKS[lote.insumoId], lote.id).toContain(lote.brandId);
      }
    }
  });

  it("Açúcar tem 3 lotes por marca com preço médio 4,167/kg", () => {
    const acucar = SEED_BATCHES.filter((b) => b.insumoId === "si-01");
    expect(acucar).toHaveLength(3);
    expect(acucar.reduce((s, b) => s + b.quantidadeInicial, 0)).toBe(3);
    expect(obterPrecoMedioInsumo(SEED_BATCHES, "si-01")).toBeCloseTo(4.1667, 3);
    expect(obterPrecoMedioInsumo(SEED_BATCHES, "si-01", undefined, "br-01")).toBeCloseTo(4, 5);
    expect(obterPrecoMedioInsumo(SEED_BATCHES, "si-01", undefined, "br-02")).toBeCloseTo(3.5, 5);
    expect(obterPrecoMedioInsumo(SEED_BATCHES, "si-01", undefined, "br-03")).toBeCloseTo(5, 5);
  });

  it("todos os 99 itens têm preço médio (custoUnitário) > 0", () => {
    const semCusto = SEED_STOCK.filter((i) => obterPrecoMedioInsumo(SEED_BATCHES, i.id) <= 0);
    expect(semCusto.map((i) => i.name)).toEqual([]);
  });

  it("valor total em estoque é calculado dinamicamente dos lotes ativos", () => {
    const total = SEED_STOCK.reduce((s, item) => {
      const qty = SEED_BATCHES
        .filter((b) => b.insumoId === item.id)
        .reduce((t, b) => t + b.quantidadeRestante, 0);
      return s + qty * obterPrecoMedioInsumo(SEED_BATCHES, item.id);
    }, 0);
    expect(total).toBeGreaterThan(1000);
  });
});

describe("seedBatchesIfEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("preenche todos os 99 itens quando não há lotes", () => {
    seedBatchesIfEmpty();
    const lotes = loadBatchesData<{ insumoId: string }>();
    expect(lotes).toHaveLength(SEED_BATCHES.length);
    expect(new Set(lotes.map((b) => b.insumoId)).size).toBe(99);
  });

  it("preserva lotes existentes e só completa itens sem lote", () => {
    saveBatchesData([
      {
        id: "b-user",
        insumoId: "si-01",
        brandId: "br-01",
        dataEntrada: "2026-09-01",
        quantidadeInicial: 9,
        quantidadeRestante: 9,
        precoUnitario: 9.9,
      },
    ]);
    seedBatchesIfEmpty();
    const lotes = loadBatchesData<{ id: string; insumoId: string }>();
    expect(lotes.filter((b) => b.insumoId === "si-01")).toHaveLength(1);
    expect(lotes.some((b) => b.id === "b-user")).toBe(true);
    expect(new Set(lotes.map((b) => b.insumoId)).size).toBe(99);
    expect(lotes).toHaveLength(SEED_BATCHES.length - 2);
  });

  it("é idempotente", () => {
    seedBatchesIfEmpty();
    seedBatchesIfEmpty();
    expect(loadBatchesData()).toHaveLength(SEED_BATCHES.length);
  });

  it("não reinsere lotes fictícios depois da limpeza", () => {
    localStorage.setItem(LOTES_LIMPOS_KEY, "1");
    seedBatchesIfEmpty();
    expect(loadBatchesData()).toHaveLength(0);
  });
});

describe("limparLotesUmaVez", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("apaga todos os lotes e seta as flags de limpeza", () => {
    seedBatchesIfEmpty();
    expect(loadBatchesData().length).toBeGreaterThan(0);
    limparLotesUmaVez();
    expect(loadBatchesData()).toHaveLength(0);
    expect(localStorage.getItem(LOTES_LIMPOS_KEY)).toBe("1");
    expect(localStorage.getItem(SALDOS_ZERO_KEY)).toBe("1");
  });

  it("é idempotente e impede novo seed", () => {
    limparLotesUmaVez();
    limparLotesUmaVez();
    seedBatchesIfEmpty();
    expect(loadBatchesData()).toHaveLength(0);
  });
});

describe("Bolo de Chocolate - custo de produção e preço sugerido", () => {
  const FICHA_B1 = [
    { insumoId: "si-02", qtd: 0.25, un: "kg" },
    { insumoId: "si-07", qtd: 4, un: "un" },
    { insumoId: "si-01", qtd: 0.2, un: "kg" },
    { insumoId: "si-06", qtd: 0.06, un: "L" },
    { insumoId: "si-05", qtd: 0.05, un: "kg" },
    { insumoId: "si-04", qtd: 0.015, un: "kg" },
    { insumoId: "si-11", qtd: 1, un: "lata" },
    { insumoId: "si-14", qtd: 1, un: "caixa" },
    { insumoId: "si-05", qtd: 0.03, un: "kg" },
    { insumoId: "si-18", qtd: 0.05, un: "kg" },
  ];

  function custoIngrediente(ing: { insumoId: string; qtd: number; un: string }): number {
    const insumo = SEED_STOCK.find((i) => i.id === ing.insumoId);
    if (!insumo) throw new Error(`insumo não encontrado: ${ing.insumoId}`);
    const precoMedio = obterPrecoMedioInsumo(SEED_BATCHES, ing.insumoId);
    return converterCustoFicha(ing.qtd, ing.un, precoMedio, insumo.unit);
  }

  it("todos os ingredientes têm preço médio e custo > 0 vindos dos lotes", () => {
    for (const ing of FICHA_B1) {
      expect(obterPrecoMedioInsumo(SEED_BATCHES, ing.insumoId), ing.insumoId).toBeGreaterThan(0);
      expect(custoIngrediente(ing), ing.insumoId).toBeGreaterThan(0);
    }
  });

  it("recalcula custo de produção e preço sugerido", () => {
    const custoIng = FICHA_B1.reduce((s, ing) => s + custoIngrediente(ing), 0);
    const custoInvisivel = custoIng * 0.15;
    const maoDeObra = (69 / 60) * 0.0024305555555555556;
    const custoTotal = custoIng + custoInvisivel + maoDeObra;
    const precoSugerido = custoTotal / (1 - 0.5);
    expect(custoIng).toBeCloseTo(20.75, 1);
    expect(custoTotal).toBeGreaterThan(custoIng);
    expect(precoSugerido).toBeGreaterThan(custoTotal);
    expect(precoSugerido).toBeCloseTo(47.73, 1);
  });
});
