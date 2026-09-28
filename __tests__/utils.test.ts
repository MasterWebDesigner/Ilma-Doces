import { describe, it, expect } from "vitest";
import { compararTexto, formatCurrency, getLocalDateStr, getLocalMonthStr, generateId, paymentLabelOf } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats BRL currency correctly", () => {
    expect(formatCurrency(10.5)).toContain("10,50");
    expect(formatCurrency(1000)).toContain("1.000");
  });

  it("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0,00");
  });
});

describe("getLocalDateStr", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = getLocalDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns correct date for specific input", () => {
    const date = new Date(2026, 0, 15); // January 15, 2026
    const result = getLocalDateStr(date);
    expect(result).toBe("2026-01-15");
  });
});

describe("getLocalMonthStr", () => {
  it("returns YYYY-MM format", () => {
    const result = getLocalMonthStr();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("generateId", () => {
  it("generates ID with prefix", () => {
    const result = generateId("test");
    expect(result).toMatch(/^test-/);
  });

  it("generates unique IDs", () => {
    const id1 = generateId("test");
    const id2 = generateId("test");
    expect(id1).not.toBe(id2);
  });
});

describe("paymentLabelOf", () => {
  it("handles snake_case PaymentMethod values", () => {
    expect(paymentLabelOf("pix")).toBe("PIX");
    expect(paymentLabelOf("dinheiro")).toBe("Dinheiro");
    expect(paymentLabelOf("cartao_debito")).toBe("Cartão Débito");
    expect(paymentLabelOf("cartao_credito")).toBe("Cartão Crédito");
  });

  it("handles uppercase and accented labels", () => {
    expect(paymentLabelOf("PIX")).toBe("PIX");
    expect(paymentLabelOf("CARTÃO DÉBITO")).toBe("Cartão Débito");
    expect(paymentLabelOf("Cartão Crédito")).toBe("Cartão Crédito");
    expect(paymentLabelOf("DINHEIRO")).toBe("Dinheiro");
  });

  it("handles mixed formats from various writes", () => {
    expect(paymentLabelOf("CARTAO_CREDITO")).toBe("Cartão Crédito");
    expect(paymentLabelOf("cartão débito")).toBe("Cartão Débito");
    expect(paymentLabelOf("Crédito")).toBe("Cartão Crédito");
    expect(paymentLabelOf("Débito")).toBe("Cartão Débito");
    expect(paymentLabelOf("BOLETO")).toBe("Outros");
    expect(paymentLabelOf("")).toBe("Outros");
    expect(paymentLabelOf(null)).toBe("Outros");
    expect(paymentLabelOf(undefined)).toBe("Outros");
  });

  it("maps fiado / prazo payment methods", () => {
    expect(paymentLabelOf("fiado")).toBe("Fiado");
    expect(paymentLabelOf("A Prazo / Fiado")).toBe("Fiado");
    expect(paymentLabelOf("conta cliente")).toBe("Fiado");
  });
});

describe("compararTexto", () => {
  it("ordena alfabeticamente A-Z ignorando caixa e acentos", () => {
    const lista = ["São Jorge", "amêndoa", "Bolo de Chocolate", "Abacaxi", "Chocolate"];
    const ordenada = [...lista].sort(compararTexto);
    expect(ordenada).toEqual(["Abacaxi", "amêndoa", "Bolo de Chocolate", "Chocolate", "São Jorge"]);
  });

  it("trata diferencas de caixa como equivalente", () => {
    expect(compararTexto("bolo", "Bolo")).toBe(0);
    expect(compararTexto("açúcar", "acucar")).toBe(0);
    expect(compararTexto("Chocolate", "Amêndoa")).toBeGreaterThan(0);
    expect(compararTexto("Amêndoa", "Chocolate")).toBeLessThan(0);
  });
});
