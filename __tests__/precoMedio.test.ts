import { describe, it, expect } from "vitest";
import { obterPrecoMedio, obterPrecoMedioInsumo } from "@/lib/precoMedio";

function lote(
  id: string,
  dataEntrada: string,
  precoUnitario: number,
  quantidadeRestante = 10
) {
  return {
    id,
    insumoId: "si-01",
    dataEntrada,
    precoUnitario,
    quantidadeRestante,
  };
}

describe("obterPrecoMedio", () => {
  it("returns precoCustoInicial when empty", () => {
    expect(obterPrecoMedio("si-01", [], 9.5)).toBe(9.5);
    expect(obterPrecoMedio("si-01", [])).toBe(0);
  });

  it("averages only the 5 newest by date", () => {
    const historico = [
      { refId: "si-01", dataEntrada: "2026-01-01", precoUnitario: 10 },
      { refId: "si-01", dataEntrada: "2026-01-02", precoUnitario: 9 },
      { refId: "si-01", dataEntrada: "2026-01-03", precoUnitario: 8 },
      { refId: "si-01", dataEntrada: "2026-01-04", precoUnitario: 7 },
      { refId: "si-01", dataEntrada: "2026-01-05", precoUnitario: 6 },
      { refId: "si-01", dataEntrada: "2026-01-06", precoUnitario: 5 },
    ];
    expect(obterPrecoMedio("si-01", historico)).toBeCloseTo(7);
  });

  it("same day: uses last 5 inserts (newest), not first 5", () => {
    const historico = [5, 4, 3, 2, 1.5, 1, 1, 1, 1, 1].map((preco) => ({
      refId: "si-01",
      dataEntrada: "2026-09-23",
      precoUnitario: preco,
    }));
    expect(obterPrecoMedio("si-01", historico)).toBeCloseTo(1);
  });

  it("keeps average when stock is zero (pricing needs it)", () => {
    const historico = [
      { refId: "si-01", dataEntrada: "2026-09-01", precoUnitario: 10 },
      { refId: "si-01", dataEntrada: "2026-09-02", precoUnitario: 2 },
      { refId: "si-01", dataEntrada: "2026-09-03", precoUnitario: 2 },
      { refId: "si-01", dataEntrada: "2026-09-04", precoUnitario: 2 },
      { refId: "si-01", dataEntrada: "2026-09-05", precoUnitario: 2 },
      { refId: "si-01", dataEntrada: "2026-09-06", precoUnitario: 2 },
    ];
    expect(obterPrecoMedio("si-01", historico, 99)).toBeCloseTo(2);
  });

  it("filters by refId", () => {
    const historico = [
      { refId: "si-01", dataEntrada: "2026-09-01", precoUnitario: 1 },
      { refId: "si-02", dataEntrada: "2026-09-01", precoUnitario: 99 },
    ];
    expect(obterPrecoMedio("si-01", historico)).toBe(1);
  });
});

describe("obterPrecoMedioInsumo", () => {
  it("same day: average of 5 newest inserts is 1.00", () => {
    const batches = [
      lote("b1", "2026-09-23", 5),
      lote("b2", "2026-09-23", 4),
      lote("b3", "2026-09-23", 3),
      lote("b4", "2026-09-23", 2),
      lote("b5", "2026-09-23", 1.5),
      lote("b6", "2026-09-23", 1),
      lote("b7", "2026-09-23", 1),
      lote("b8", "2026-09-23", 1),
      lote("b9", "2026-09-23", 1),
      lote("b10", "2026-09-23", 1),
    ];
    expect(obterPrecoMedioInsumo(batches, "si-01")).toBeCloseTo(1);
  });

  it("five entries all 1.00 average 1.00", () => {
    const batches = [
      lote("b1", "2026-09-23", 1),
      lote("b2", "2026-09-23", 1),
      lote("b3", "2026-09-23", 1),
      lote("b4", "2026-09-23", 1),
      lote("b5", "2026-09-23", 1),
    ];
    expect(obterPrecoMedioInsumo(batches, "si-01")).toBe(1);
  });

  it("keeps average of depleted lots (saldo 0) for precificacao", () => {
    const batches = [
      lote("a", "2026-09-02", 3, 0),
      lote("b", "2026-09-03", 3, 0),
      lote("c", "2026-09-04", 3, 0),
      lote("d", "2026-09-05", 3, 0),
      lote("e", "2026-09-06", 3, 0),
    ];
    expect(obterPrecoMedioInsumo(batches, "si-01", 99)).toBeCloseTo(3);
  });

  it("can filter by brand", () => {
    const batches = [
      { ...lote("b1", "2026-09-01", 10), brandId: "br-01" },
      { ...lote("b2", "2026-09-02", 4), brandId: "br-02" },
      { ...lote("b3", "2026-09-03", 4), brandId: "br-02" },
      { ...lote("b4", "2026-09-04", 4), brandId: "br-02" },
      { ...lote("b5", "2026-09-05", 4), brandId: "br-02" },
      { ...lote("b6", "2026-09-06", 4), brandId: "br-02" },
    ];
    expect(obterPrecoMedioInsumo(batches, "si-01", undefined, "br-02")).toBeCloseTo(4);
    expect(obterPrecoMedioInsumo(batches, "si-01", undefined, "br-01")).toBeCloseTo(10);
  });
});
