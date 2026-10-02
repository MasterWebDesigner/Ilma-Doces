import { describe, it, expect } from "vitest";
import { statusProduto, produtoVisivel, produtoEsgotado } from "@/lib/produtoStatus";
import { listarSemEstoque, type StockInsufficient } from "@/lib/stockGuard";
import type { Product } from "@/types/database";

function makeProduct(extra?: Partial<Product>): Product {
  return {
    id: "p1",
    category_id: "cat-1",
    name: "Bolo de Chocolate",
    description: null,
    price: 89.9,
    image_url: null,
    is_available: true,
    display_order: 1,
    brand: "",
    ...extra,
  };
}

describe("statusProduto", () => {
  it("produto sem campo ativo (legado) e disponivel = ativo", () => {
    expect(statusProduto(makeProduct())).toBe("ativo");
    expect(statusProduto(makeProduct({ ativo: true }))).toBe("ativo");
  });

  it("ativo false = inativo, mesmo com estoque e disponivel", () => {
    expect(statusProduto(makeProduct({ ativo: false }))).toBe("inativo");
    expect(statusProduto(makeProduct({ ativo: false, is_available: false }))).toBe("inativo");
    expect(
      statusProduto(makeProduct({ ativo: false, controlarEstoque: true, estoque: 0 }))
    ).toBe("inativo");
  });

  it("is_available false = esgotado (marcação manual)", () => {
    expect(statusProduto(makeProduct({ is_available: false }))).toBe("esgotado");
    expect(
      statusProduto(makeProduct({ is_available: false, controlarEstoque: true, estoque: 10 }))
    ).toBe("esgotado");
  });

  it("estoque zerado com controle ativo = esgotado automático", () => {
    expect(statusProduto(makeProduct({ controlarEstoque: true, estoque: 0 }))).toBe("esgotado");
    expect(statusProduto(makeProduct({ controlarEstoque: true, estoque: undefined }))).toBe("esgotado");
  });

  it("estoque positivo com controle ativo = ativo", () => {
    expect(statusProduto(makeProduct({ controlarEstoque: true, estoque: 3 }))).toBe("ativo");
  });

  it("sem controle de estoque o estoque não influencia", () => {
    expect(statusProduto(makeProduct({ controlarEstoque: false, estoque: 0 }))).toBe("ativo");
  });
});

describe("produtoVisivel", () => {
  it("visível quando ativo é true ou ausente", () => {
    expect(produtoVisivel(makeProduct())).toBe(true);
    expect(produtoVisivel(makeProduct({ ativo: true }))).toBe(true);
  });

  it("escondido apenas quando ativo é false", () => {
    expect(produtoVisivel(makeProduct({ ativo: false }))).toBe(false);
    expect(produtoVisivel(makeProduct({ ativo: false, is_available: true }))).toBe(false);
  });

  it("esgotado continua visível no site", () => {
    expect(produtoVisivel(makeProduct({ is_available: false }))).toBe(true);
    expect(produtoVisivel(makeProduct({ controlarEstoque: true, estoque: 0 }))).toBe(true);
  });
});

describe("produtoEsgotado", () => {
  it("detecta esgotado manual e automático", () => {
    expect(produtoEsgotado(makeProduct({ is_available: false }))).toBe(true);
    expect(produtoEsgotado(makeProduct({ controlarEstoque: true, estoque: 0 }))).toBe(true);
    expect(produtoEsgotado(makeProduct())).toBe(false);
  });

  it("inativo não é tratado como esgotado (estado inativo tem prioridade)", () => {
    expect(produtoEsgotado(makeProduct({ ativo: false, is_available: false }))).toBe(false);
  });
});

describe("listarSemEstoque", () => {
  const base: StockInsufficient = {
    productId: "p1",
    nome: "Bolo",
    solicitado: 3,
    disponivel: 1,
  };

  it("sem motivo mostra disponivel x pedido", () => {
    expect(listarSemEstoque([base])).toBe("Bolo (disponível: 1, pedido: 3)");
  });

  it("motivo inativo e esgotado ganham texto próprio", () => {
    expect(listarSemEstoque([{ ...base, motivo: "inativo" }])).toBe(
      "Bolo (indisponível no site)"
    );
    expect(listarSemEstoque([{ ...base, motivo: "esgotado" }])).toBe("Bolo (esgotado)");
  });

  it("lista misturada une por vírgula", () => {
    expect(
      listarSemEstoque([
        { ...base, motivo: "inativo" },
        { productId: "p2", nome: "Torta", solicitado: 1, disponivel: 0 },
      ])
    ).toBe("Bolo (indisponível no site), Torta (disponível: 0, pedido: 1)");
  });
});
