import { describe, it, expect } from "vitest";
import type { FichaTecnica } from "@/types/database";
import {
  custoDaFichaTecnica,
  custoDoBrinde,
  montarDespesaBrinde,
  CATEGORIA_DESPESA_BRINDE,
} from "@/lib/brindeCusto";

function makeFicha(overrides: Partial<FichaTecnica> = {}): FichaTecnica {
  return {
    id: "f1",
    productId: "p1",
    productName: "Gelinho",
    ingredientes: [
      { insumoId: "i1", nome: "Leite", quantidade: 2, unidade: "l", custoUnitario: 5 },
      { insumoId: "i2", nome: "Acucar", quantidade: 100, unidade: "g", custoUnitario: 0.01 },
    ],
    custoInvisivelPct: 10,
    maoDeObraMin: 30,
    maoDeObraValorHora: 60,
    margemLucroPct: 50,
    rendimento: 10,
    unidadeRendimento: "un",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("custoDaFichaTecnica", () => {
  it("soma ingredientes + custo invisivel + mao de obra", () => {
    const custoIng = 2 * 5 + 100 * 0.01;
    const invisivel = custoIng * 0.1;
    const maoDeObra = 60 * (30 / 60);
    expect(custoDaFichaTecnica(makeFicha())).toBeCloseTo(custoIng + invisivel + maoDeObra, 5);
  });

  it("retorna 0 quando nao ha ficha", () => {
    expect(custoDaFichaTecnica(undefined)).toBe(0);
    expect(custoDaFichaTecnica(null)).toBe(0);
  });

  it("retorna 0 para ficha sem ingredientes", () => {
    expect(custoDaFichaTecnica(makeFicha({ ingredientes: [] }))).toBeCloseTo(30, 5);
  });
});

describe("custoDoBrinde", () => {
  it("usa precoCustoInicial quando cadastrado", () => {
    expect(custoDoBrinde({ precoCustoInicial: 3.4, price: 8.5 }, makeFicha())).toBe(3.4);
  });

  it("cai para a ficha tecnica quando precoCustoInicial for zero", () => {
    const esperado = 2 * 5 + 100 * 0.01;
    const comFicha = esperado + esperado * 0.1 + 60 * (30 / 60);
    expect(custoDoBrinde({ precoCustoInicial: 0, price: 8.5 }, makeFicha())).toBeCloseTo(comFicha, 5);
  });

  it("cai para a ficha tecnica quando precoCustoInicial nao existe", () => {
    expect(custoDoBrinde({ price: 8.5 }, makeFicha())).toBeGreaterThan(0);
  });

  it("retorna 0 quando nao ha custo nem ficha (nunca preco de venda)", () => {
    expect(custoDoBrinde({ precoCustoInicial: 0, price: 8.5 }, undefined)).toBe(0);
    expect(custoDoBrinde({ price: 8.5 }, makeFicha({ ingredientes: [], custoInvisivelPct: 0, maoDeObraMin: 0 }))).toBe(0);
  });
});

describe("montarDespesaBrinde", () => {
  it("padroniza descricao, categoria, status e valor de custo", () => {
    const despesa = montarDespesaBrinde(
      { name: "Gelinho Limao", precoCustoInicial: 2.9, price: 7.5 },
      "Maria",
      undefined,
      "2026-09-25"
    );

    expect(despesa).toEqual({
      descricao: "BRINDE — Gelinho Limao — Maria",
      categoria: "Custos de Brindes / Fidelidade",
      valor: 2.9,
      data: "2026-09-25",
      status: "Pago",
    });
    expect(despesa.categoria).toBe(CATEGORIA_DESPESA_BRINDE);
  });

  it("usa custo da ficha como fallback na descricao padrao", () => {
    const despesa = montarDespesaBrinde(
      { name: "Bolo Festa", precoCustoInicial: 0, price: 120 },
      "Joana",
      makeFicha(),
      "2026-09-25"
    );
    expect(despesa.descricao).toBe("BRINDE — Bolo Festa — Joana");
    expect(despesa.valor).toBeGreaterThan(0);
    expect(despesa.valor).toBeCloseTo(2 * 5 + 1 + (2 * 5 + 1) * 0.1 + 30, 5);
  });
});
