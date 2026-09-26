import { describe, it, expect } from "vitest";
import {
  subtotalParaBrindeComRegras,
  itemContaParaBrinde,
  itemLineTotal,
  paidSubtotal,
  type RegrasCategoriasBrinde,
} from "@/lib/brindeCategorias";
import type { CartItem, Product } from "@/types/database";

type RegrasComMeta = RegrasCategoriasBrinde & { valorMinimo: number };

function makeProduct(id: string, category_id: string, price: number, name?: string): Product {
  return {
    id,
    category_id,
    name: name ?? id,
    description: null,
    price,
    image_url: null,
    is_available: true,
    display_order: 1,
    brand: "",
  };
}

function makeItem(product: Product, quantity: number, extra?: Partial<CartItem>): CartItem {
  return { product, quantity, ...extra };
}

const TODAS: RegrasComMeta = { valorMinimo: 80, todasCategorias: true, categoriasPromo: [] };
const ESPECIFICAS: RegrasComMeta = {
  valorMinimo: 80,
  todasCategorias: false,
  categoriasPromo: ["cat-bolos"],
};

const bolo = makeProduct("p1", "cat-bolos", 50, "Bolo de Chocolate");
const sobremesa = makeProduct("p2", "cat-sobremesas", 40, "Mousse");
const gelinho = makeProduct("p3", "cat-gelinhos", 8.5, "Gelinho Coco");

describe("itemContaParaBrinde", () => {
  it("todas as categorias: qualquer item conta", () => {
    expect(itemContaParaBrinde(makeItem(bolo, 1), TODAS)).toBe(true);
    expect(itemContaParaBrinde(makeItem(gelinho, 2), TODAS)).toBe(true);
  });

  it("categorias especificas: so conta item da categoria participante", () => {
    expect(itemContaParaBrinde(makeItem(bolo, 1), ESPECIFICAS)).toBe(true);
    expect(itemContaParaBrinde(makeItem(sobremesa, 1), ESPECIFICAS)).toBe(false);
    expect(itemContaParaBrinde(makeItem(gelinho, 1), ESPECIFICAS)).toBe(false);
  });

  it("item de brinde nunca conta", () => {
    expect(itemContaParaBrinde(makeItem(bolo, 1, { is_brinde: true, preco_unitario: 0 }), TODAS)).toBe(false);
    expect(itemContaParaBrinde(makeItem(bolo, 1, { is_brinde: true, preco_unitario: 0 }), ESPECIFICAS)).toBe(false);
  });

  it("categoria fora da lista nao conta mesmo com quantidade alta", () => {
    const fora = makeItem(sobremesa, 5);
    expect(itemContaParaBrinde(fora, ESPECIFICAS)).toBe(false);
  });
});

describe("subtotalParaBrinde", () => {
  it("todas as categorias: soma o subtotal pago completo", () => {
    const items = [makeItem(bolo, 1), makeItem(sobremesa, 2), makeItem(gelinho, 3)];
    expect(subtotalParaBrindeComRegras(items, TODAS)).toBe(50 + 80 + 25.5);
  });

  it("categorias especificas: ignora itens fora da categoria participante", () => {
    const items = [makeItem(bolo, 1), makeItem(sobremesa, 2), makeItem(gelinho, 3)];
    expect(subtotalParaBrindeComRegras(items, ESPECIFICAS)).toBe(50);
  });

  it("nenhuma categoria participante: subtotal zero (meta nunca atingida)", () => {
    const items = [makeItem(sobremesa, 10), makeItem(gelinho, 10)];
    expect(subtotalParaBrindeComRegras(items, { ...ESPECIFICAS, categoriasPromo: [] })).toBe(0);
  });

  it("itens de brinde (valor zero) nao somam", () => {
    const items = [
      makeItem(bolo, 1),
      makeItem(gelinho, 1, { is_brinde: true, preco_unitario: 0 }),
    ];
    expect(subtotalParaBrindeComRegras(items, TODAS)).toBe(50);
    expect(subtotalParaBrindeComRegras(items, ESPECIFICAS)).toBe(50);
  });

  it("respeita preco_unitario personalizado", () => {
    const items = [makeItem(bolo, 2, { preco_unitario: 30 })];
    expect(subtotalParaBrindeComRegras(items, TODAS)).toBe(60);
    expect(subtotalParaBrindeComRegras(items, ESPECIFICAS)).toBe(60);
  });

  it("lista vazia retorna zero", () => {
    expect(subtotalParaBrindeComRegras([], TODAS)).toBe(0);
    expect(subtotalParaBrindeComRegras([], ESPECIFICAS)).toBe(0);
  });

  it("regra de meta: itens de outras categorias nao atingem o minimo", () => {
    const items = [makeItem(sobremesa, 3), makeItem(gelinho, 4)];
    const sub = subtotalParaBrindeComRegras(items, ESPECIFICAS);
    expect(sub).toBe(0);
    expect(sub >= ESPECIFICAS.valorMinimo).toBe(false);
  });

  it("regra de meta: categoria participante atinge o minimo", () => {
    const items = [makeItem(bolo, 2)];
    const sub = subtotalParaBrindeComRegras(items, ESPECIFICAS);
    expect(sub).toBe(100);
    expect(sub >= ESPECIFICAS.valorMinimo).toBe(true);
  });
});

describe("itemLineTotal / paidSubtotal", () => {
  it("item de brinde vale zero", () => {
    expect(itemLineTotal(makeItem(bolo, 2, { is_brinde: true, preco_unitario: 0 }))).toBe(0);
    expect(paidSubtotal([makeItem(bolo, 1), makeItem(gelinho, 2, { is_brinde: true, preco_unitario: 0 })])).toBe(50);
  });

  it("soma quantidade vezes unitario", () => {
    expect(itemLineTotal(makeItem(gelinho, 3))).toBe(25.5);
    expect(paidSubtotal([makeItem(bolo, 1), makeItem(sobremesa, 2)])).toBe(130);
  });
});
