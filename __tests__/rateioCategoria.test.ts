import { describe, it, expect } from "vitest";
import {
  agruparDespesasPorParcela,
  categoriaDoInsumo,
  dividirValorPorCategoria,
  montarDadosDespesaEntrada,
  round2,
} from "@/lib/entradas";
import type { EntradaMercadoria, Expense } from "@/types/database";

const BASE = {
  data: "2026-10-06",
  vencimento: "2026-11-05",
  entradaId: "cf-1",
  createdAt: "2026-10-06T12:00:00.000Z",
  status: "Pendente",
} as const;

const ENTRADA: EntradaMercadoria = {
  id: "cf-1",
  fornecedor: "Atacado Sao Jorge",
  data: "2026-10-06",
  itens: [{ insumoId: "in-1", nome: "Leite", brandId: "", qtd: 12, custoUnitario: 4.35 }],
  subtotal: 52.2,
  frete: 0,
  total: 52.2,
  formaPagamento: "Boleto",
  parcelas: [
    { numero: 1, vencimento: "2026-11-05", valor: 26.1 },
    { numero: 2, vencimento: "2026-12-05", valor: 26.1 },
  ],
  criadoEm: "2026-10-06T12:00:00.000Z",
  despesaIds: ["dep-1a", "dep-1b", "dep-2"],
  loteIds: ["b-1"],
};

describe("rateio por categoria", () => {
  it("categoriaDoInsumo mapeia Embalagens para Embalacoes e o resto para Insumos", () => {
    expect(categoriaDoInsumo("Embalagens")).toBe("Embalacoes");
    expect(categoriaDoInsumo("Uso Interno")).toBe("Insumos");
    expect(categoriaDoInsumo("Insumos")).toBe("Insumos");
    expect(categoriaDoInsumo(undefined)).toBe("Insumos");
  });

  it("montarDadosDespesaEntrada grava categoria e parcela informadas", () => {
    const desp = montarDadosDespesaEntrada({
      descricao: "Compra Jorge - parcela 1/2 · Embalacoes",
      valor: 15,
      data: BASE.data,
      vencimento: BASE.vencimento,
      entradaId: BASE.entradaId,
      criadoEm: BASE.createdAt,
      status: "Pago",
      categoria: "Embalacoes",
      parcela: 1,
    });
    expect(JSON.stringify(desp)).not.toContain("undefined");
    expect(desp.categoria).toBe("Embalacoes");
    expect(desp.parcela).toBe(1);
    expect(desp.status).toBe("Pago");
  });

  it("montarDadosDespesaEntrada sem parcela nao grava o campo", () => {
    const desp = montarDadosDespesaEntrada({
      descricao: "Compra Jorge",
      valor: 60,
      data: BASE.data,
      vencimento: BASE.vencimento,
      entradaId: BASE.entradaId,
      criadoEm: BASE.createdAt,
    });
    expect("parcela" in desp).toBe(false);
    expect(desp.categoria).toBe("Insumos");
  });

  it("dividirValorPorCategoria mantem uma parte quando ha uma categoria so", () => {
    expect(dividirValorPorCategoria([{ categoria: "Insumos", valor: 120 }], 60)).toEqual([
      { categoria: "Insumos", valor: 60 },
    ]);
  });

  it("dividirValorPorCategoria reparte na proporcao e soma exatamente a parcela", () => {
    const partes = [
      { categoria: "Insumos", valor: 90 },
      { categoria: "Embalacoes", valor: 30 },
    ];
    expect(dividirValorPorCategoria(partes, 60)).toEqual([
      { categoria: "Insumos", valor: 45 },
      { categoria: "Embalacoes", valor: 15 },
    ]);
    const quebrado = dividirValorPorCategoria(partes, 60.07);
    expect(round2(quebrado.reduce((s, p) => s + p.valor, 0))).toBe(60.07);
  });

  it("dividirValorPorCategoria ignora parte zerada", () => {
    expect(
      dividirValorPorCategoria(
        [
          { categoria: "Insumos", valor: 120 },
          { categoria: "Embalacoes", valor: 0 },
        ],
        50
      )
    ).toEqual([{ categoria: "Insumos", valor: 50 }]);
  });

  it("agruparDespesasPorParcela agrupa split pelo campo parcela", () => {
    const desp1a: Expense = { id: "dep-1a", descricao: "Compra A - parcela 1/2 · Insumos", categoria: "Insumos", valor: 20, parcela: 1, ...BASE };
    const desp1b: Expense = { id: "dep-1b", descricao: "Compra A - parcela 1/2 · Embalacoes", categoria: "Embalacoes", valor: 6.1, parcela: 1, ...BASE };
    const desp2: Expense = { id: "dep-2", descricao: "Compra A - parcela 2/2", categoria: "Insumos", valor: 26.1, parcela: 2, ...BASE, vencimento: "2026-12-05" };

    const grupos = agruparDespesasPorParcela(ENTRADA, [desp1a, desp1b, desp2]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].despesas.map((d) => d.id)).toEqual(["dep-1a", "dep-1b"]);
    expect(grupos[1].despesas.map((d) => d.id)).toEqual(["dep-2"]);
    expect(grupos[0].parcela.valor).toBe(26.1);
  });

  it("agruparDespesasPorParcela cai no indice quando as despesas sao antigas", () => {
    const legado1: Expense = { id: "dep-1a", descricao: "Compra A - parcela 1/2", categoria: "Insumos", valor: 26.1, ...BASE };
    const legado2: Expense = { id: "dep-1b", descricao: "Compra A - parcela 2/2", categoria: "Insumos", valor: 26.1, ...BASE, vencimento: "2026-12-05" };
    const legado3: Expense = { id: "dep-2", descricao: "Outra", categoria: "Insumos", valor: 1, ...BASE, vencimento: "2026-12-05" };

    const grupos = agruparDespesasPorParcela(ENTRADA, [legado1, legado2, legado3]);
    expect(grupos[0].despesas.map((d) => d.id)).toEqual(["dep-1a"]);
    expect(grupos[1].despesas.map((d) => d.id)).toEqual(["dep-1b"]);
  });

  it("agruparDespesasPorParcela deixa a parcela vazia quando a despesa foi removida", () => {
    const desp2: Expense = { id: "dep-2", descricao: "Compra A - parcela 2/2", categoria: "Insumos", valor: 26.1, parcela: 2, ...BASE, vencimento: "2026-12-05" };

    const grupos = agruparDespesasPorParcela(ENTRADA, [desp2]);
    expect(grupos[0].despesas).toHaveLength(0);
    expect(grupos[1].despesas.map((d) => d.id)).toEqual(["dep-2"]);
  });
});
