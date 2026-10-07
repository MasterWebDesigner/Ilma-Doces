import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonthsClamped,
  agruparDespesasPorParcela,
  aplicarVencimentos,
  calcularTotais,
  categoriaDoInsumo,
  custoUnitarioComFrete,
  descricaoDespesaEntrada,
  dividirValorEm,
  dividirValorPorCategoria,
  ehFornecedorNovo,
  money,
  montarDadosDespesaEntrada,
  montarDadosEntrada,
  parcelasAvista,
  parcelasEmDias,
  parcelasEmDiasApartirDe,
  parcelasMensais,
  parcelasMensaisApartirDe,
  ratearFrete,
  round2,
  slugFornecedor,
  somaParcelasConfere,
  sugestoesFornecedor,
  validarEntrada,
} from "@/lib/entradas";
import type { EntradaMercadoria, Expense } from "@/types/database";

const ENTRADA_BASE: EntradaMercadoria = {
  id: "cf-1",
  fornecedor: "Atacado São Jorge",
  data: "2026-10-06",
  itens: [
    { insumoId: "in-1", nome: "Leite", brandId: "", qtd: 12, custoUnitario: 4.35 },
    { insumoId: "in-2", nome: "Chocolate", brandId: "br-01", qtd: 2, custoUnitario: 30.99 },
  ],
  subtotal: 114.18,
  frete: 5.82,
  total: 120,
  formaPagamento: "Boleto",
  parcelas: [
    { numero: 1, vencimento: "2026-11-05", valor: 60 },
    { numero: 2, vencimento: "2026-12-05", valor: 60 },
  ],
  criadoEm: "2026-10-06T12:00:00.000Z",
  despesaIds: ["dep-1", "dep-2"],
  loteIds: ["b-1", "b-2"],
};

describe("numeros e texto", () => {
  it("round2 arredonda para centavos", () => {
    expect(round2(10.005)).toBeCloseTo(10.01, 10);
    expect(round2(10.004)).toBeCloseTo(10, 10);
    expect(round2(-3.333)).toBeCloseTo(-3.33, 10);
  });

  it("money formata em BRL", () => {
    expect(money(1234.5)).toBe("1234,50");
    expect(money(0)).toBe("0,00");
    expect(money(NaN)).toBe("0,00");
  });

  it("slugFornecedor normaliza acentos, caixa e espacos", () => {
    expect(slugFornecedor("  Atacado São Jorge  ")).toBe("atacado-sao-jorge");
    expect(slugFornecedor("DISTRIB. RAPIDO LTDA")).toBe("distrib-rapido-ltda");
    expect(slugFornecedor("???")).toBeTruthy();
  });

  it("sugestoesFornecedor junta cadastrados e compras sem duplicar (case-insensitive)", () => {
    const lista = sugestoesFornecedor(["Atacado São Jorge", "Doce Fortuna"], ["ATACADO SÃO JORGE", "Nova Entrada", "  "]);
    expect(lista).toEqual(["Atacado São Jorge", "Doce Fortuna", "Nova Entrada"]);
  });

  it("ehFornecedorNovo detecta nome inedito e ignora vazio", () => {
    expect(ehFornecedorNovo(["Jorge"], "jorge")).toBe(false);
    expect(ehFornecedorNovo(["Jorge"], "  Jorge  ")).toBe(false);
    expect(ehFornecedorNovo(["Jorge"], "Maria")).toBe(true);
    expect(ehFornecedorNovo(["Jorge"], "")).toBe(false);
  });

  it("aplicarVencimentos sobrescreve apenas os numeros com override", () => {
    const geradas = [
      { numero: 1, vencimento: "2026-11-06", valor: 50 },
      { numero: 2, vencimento: "2026-12-06", valor: 50 },
    ];
    const aplicadas = aplicarVencimentos(geradas, { 2: "2027-01-10" });
    expect(aplicadas.map((p) => p.vencimento)).toEqual(["2026-11-06", "2027-01-10"]);
    expect(geradas[1].vencimento).toBe("2026-12-06");
    expect(aplicarVencimentos(geradas, {})).toEqual(geradas);
  });
});

describe("datas", () => {
  it("addDays soma dias ignorando horario de verao", () => {
    expect(addDays("2026-10-06", 30)).toBe("2026-11-05");
    expect(addDays("2026-10-06", 90)).toBe("2027-01-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addMonthsClamped prende o dia ao ultimo dia do mes", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 12)).toBe("2027-01-31");
    expect(addMonthsClamped("2026-01-31", 13)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-10-06", 2)).toBe("2026-12-06");
  });
});

describe("dividirValorEm", () => {
  it("divide em partes iguais com o resto na ultima", () => {
    expect(dividirValorEm(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(dividirValorEm(10, 4)).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(dividirValorEm(9, 3)).toEqual([3, 3, 3]);
  });

  it("a soma sempre bate com o total", () => {
    for (const [total, n] of [
      [120.01, 7],
      [0.05, 3],
      [9999.99, 13],
    ] as const) {
      const soma = round2(dividirValorEm(total, n).reduce((s, v) => s + v, 0));
      expect(soma).toBeCloseTo(total, 10);
    }
  });

  it("com n invalido cai em 1 parte", () => {
    expect(dividirValorEm(50, 0)).toEqual([50]);
  });
});

describe("geradores de parcelas", () => {
  it("a vista gera 1 parcela com vencimento na data da compra", () => {
    expect(parcelasAvista(120, "2026-10-06")).toEqual([
      { numero: 1, vencimento: "2026-10-06", valor: 120 },
    ]);
  });

  it("boleto 30/60/90 gera datas crescentes com soma igual ao total", () => {
    const p = parcelasEmDias(120, "2026-10-06", 3, 30);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-05", "2026-12-05", "2027-01-04"]);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3]);
    expect(round2(p.reduce((s, x) => s + x.valor, 0))).toBe(120);
  });

  it("carne mensal usa vencimentos mesais", () => {
    const p = parcelasMensais(90, "2026-10-06", 3);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-06", "2026-12-06", "2027-01-06"]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(90, 10);
  });

  it("parcelasEmDiasApartirDe ancora a primeira parcela na data escolhida", () => {
    const p = parcelasEmDiasApartirDe(90, "2026-10-20", 3, 30);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-10-20", "2026-11-19", "2026-12-19"]);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3]);
    expect(round2(p.reduce((s, x) => s + x.valor, 0))).toBe(90);
  });

  it("parcelasMensaisApartirDe ancora na data escolhida com clamping de mes", () => {
    const p = parcelasMensaisApartirDe(90, "2026-11-05", 3);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(90, 10);
  });

  it("somaParcelasConfere aceita diferenca de centavos e nega o resto", () => {
    expect(somaParcelasConfere(100, [{ valor: 50 }, { valor: 50.01 }])).toBe(true);
    expect(somaParcelasConfere(100, [{ valor: 50 }, { valor: 49.9 }])).toBe(false);
    expect(somaParcelasConfere(100, [{ valor: 100.01 }])).toBe(true);
  });
});

describe("rateio de frete", () => {
  it("rateia proporcionalmente ao valor do item", () => {
    const itens = [
      { qtd: 1, custoUnitario: 30 },
      { qtd: 1, custoUnitario: 70 },
    ];
    expect(ratearFrete(100, 10, itens)).toEqual([3, 7]);
  });

  it("ajusta centavos restantes no ultimo item", () => {
    const itens = [
      { qtd: 1, custoUnitario: 30 },
      { qtd: 1, custoUnitario: 60 },
      { qtd: 1, custoUnitario: 10 },
    ];
    const rateio = ratearFrete(100, 10, itens);
    expect(rateio).toEqual([3, 6, 1]);
    expect(round2(rateio.reduce((s, v) => s + v, 0))).toBe(10);
  });

  it("sem frete ou sem subtotal devolve zeros", () => {
    expect(ratearFrete(100, 0, [{ qtd: 1, custoUnitario: 100 }])).toEqual([0]);
    expect(ratearFrete(0, 10, [{ qtd: 1, custoUnitario: 0 }])).toEqual([0]);
    expect(ratearFrete(100, 10, [])).toEqual([]);
  });

  it("custoUnitarioComFrete embute o rateio no custo do lote", () => {
    expect(custoUnitarioComFrete({ qtd: 2, custoUnitario: 5 }, 10)).toBe(10);
    expect(custoUnitarioComFrete({ qtd: 3, custoUnitario: 10 }, -3)).toBe(9);
    expect(custoUnitarioComFrete({ qtd: 0, custoUnitario: 7 }, 5)).toBe(7);
  });
});

describe("calcularTotais", () => {
  it("soma itens e frete arredondando em centavos", () => {
    const r = calcularTotais(
      [
        { qtd: 3, custoUnitario: 4.333 },
        { qtd: 1, custoUnitario: 10 },
      ],
      2.5
    );
    expect(r.subtotal).toBeCloseTo(23, 10);
    expect(r.frete).toBe(2.5);
    expect(r.total).toBeCloseTo(25.5, 10);
  });

  it("frete invalido vira zero", () => {
    expect(calcularTotais([{ qtd: 1, custoUnitario: 10 }], NaN).frete).toBe(0);
  });
});

describe("validarEntrada", () => {
  const valida = {
    fornecedor: "Atacado São Jorge",
    data: "2026-10-06",
    itens: [{ insumoId: "in-1", qtd: 2, custoUnitario: 5 }],
    parcelas: [{ vencimento: "2026-11-05", valor: 10 }],
    total: 10,
  };

  it("aceita uma entrada correta", () => {
    expect(validarEntrada(valida)).toBeNull();
  });

  it("exige fornecedor, data, item valido e parcelas completas", () => {
    expect(validarEntrada({ ...valida, fornecedor: "  " })).toMatch(/fornecedor/i);
    expect(validarEntrada({ ...valida, data: "" })).toMatch(/data/i);
    expect(validarEntrada({ ...valida, itens: [{ insumoId: "", qtd: 2, custoUnitario: 5 }] })).toMatch(/insumo/i);
    expect(validarEntrada({ ...valida, itens: [{ insumoId: "in-1", qtd: 0, custoUnitario: 5 }] })).toMatch(/quantidade/i);
    expect(validarEntrada({ ...valida, parcelas: [] })).toMatch(/parcelas/i);
    expect(validarEntrada({ ...valida, parcelas: [{ vencimento: "", valor: 10 }] })).toMatch(/vencimento/i);
    expect(validarEntrada({ ...valida, parcelas: [{ vencimento: "2026-11-05", valor: 0 }] })).toMatch(/valor/i);
  });

  it("recusa quando a soma das parcelas nao bate com o total", () => {
    expect(validarEntrada({ ...valida, parcelas: [{ vencimento: "2026-11-05", valor: 9.5 }] })).toMatch(/soma/i);
  });
});

describe("payloads Firestore", () => {
  it("montarDadosEntrada nao grava undefined e arredonda", () => {
    const dados = montarDadosEntrada(ENTRADA_BASE);
    expect(JSON.stringify(dados)).not.toContain("undefined");
    expect(dados.itens[0].brandId).toBe("");
    expect(dados.itens[1].brandId).toBe("br-01");
    expect(dados.subtotal).toBe(114.18);
    expect(dados.total).toBe(120);
    expect(dados.parcelas).toHaveLength(2);
    expect(dados.despesaIds).toEqual(["dep-1", "dep-2"]);
    expect(dados.loteIds).toEqual(["b-1", "b-2"]);
  });

  it("montarDadosDespesaEntrada nasce Pendente com vencimento e categoria Insumos", () => {
    const desp = montarDadosDespesaEntrada({
      descricao: "Compra Atacado São Jorge — parcela 1/2",
      valor: 60,
      data: "2026-10-06",
      vencimento: "2026-11-05",
      entradaId: "cf-1",
      criadoEm: "2026-10-06T12:00:00.000Z",
    });
    expect(JSON.stringify(desp)).not.toContain("undefined");
    expect(desp.status).toBe("Pendente");
    expect(desp.categoria).toBe("Insumos");
    expect(desp.data).toBe("2026-10-06");
    expect(desp.vencimento).toBe("2026-11-05");
    expect(desp.entradaId).toBe("cf-1");
    expect(desp.valor).toBe(60);
    expect(desp.createdAt).toBe("2026-10-06T12:00:00.000Z");
  });

  it("descricaoDespesaEntrada marca parcela quando ha mais de uma", () => {
    expect(descricaoDespesaEntrada("Jorge", 1, 1)).toBe("Compra Jorge");
    expect(descricaoDespesaEntrada("Jorge", 2, 3)).toBe("Compra Jorge — parcela 2/3");
  });
});
