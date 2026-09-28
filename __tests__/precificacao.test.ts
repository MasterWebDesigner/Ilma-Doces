import { describe, it, expect } from "vitest";
import { calcularPrecificacao, ehReceitaPorUnidade, normalizarQuantidadeProduzida, somarCustoIngredientes } from "@/lib/precificacao";

const base = {
  custoIngredientes: 100,
  percentualInvisivel: 15,
  horasTrabalhadasMes: 160,
  salarioMensal: 2400,
  tempoProducaoMinutos: 40,
  quantidadeProduzida: 5,
  margemDesejada: 50,
  precoCardapio: 45,
};

describe("calcularPrecificacao", () => {
  it("calcula lote e unitarios conforme o motor", () => {
    const r = calcularPrecificacao(base);
    expect(r.custoInvisivel).toBeCloseTo(15, 10);
    expect(r.taxaMinutoMO).toBeCloseTo(0.25, 10);
    expect(r.custoMaoDeObra).toBeCloseTo(10, 10);
    expect(r.custoTotalLote).toBeCloseTo(125, 10);
    expect(r.custoUnitario).toBeCloseTo(25, 10);
    expect(r.custoIngredientesUnitario).toBeCloseTo(20, 10);
    expect(r.precoSugeridoLote).toBeCloseTo(250, 10);
    expect(r.precoSugeridoUnitario).toBeCloseTo(50, 10);
    expect(r.lucroLiquidoUnitarioAtual).toBeCloseTo(20, 10);
    expect(r.margemLucroRealAtual).toBeCloseTo(44.4444, 3);
    expect(r.diferencaPrecoUnitario).toBeCloseTo(-5, 10);
    expect(r.lucroLiquidoUnitarioSugerido).toBeCloseTo(25, 10);
    expect(r.margemLucroRealSugerida).toBeCloseTo(50, 10);
  });

  it("lucro real unitario usa preco do cardapio menos custo unitario", () => {
    const r = calcularPrecificacao(base);
    expect(r.lucroLiquidoUnitarioAtual).toBe(base.precoCardapio - r.custoUnitario);
    expect(r.margemLucroRealAtual).toBeCloseTo((r.lucroLiquidoUnitarioAtual / base.precoCardapio) * 100, 10);
  });

  it("salario ou horas zerados zera a taxa de mao de obra", () => {
    expect(calcularPrecificacao({ ...base, salarioMensal: 0 }).taxaMinutoMO).toBe(0);
    expect(calcularPrecificacao({ ...base, salarioMensal: 0 }).custoMaoDeObra).toBe(0);
    expect(calcularPrecificacao({ ...base, horasTrabalhadasMes: 0 }).taxaMinutoMO).toBe(0);
    expect(calcularPrecificacao({ ...base, horasTrabalhadasMes: 0 }).custoMaoDeObra).toBe(0);
    expect(calcularPrecificacao({ ...base, horasTrabalhadasMes: 0 }).custoTotalLote).toBeCloseTo(115, 10);
  });

  it("quantidade produzida zerada usa os valores do lote", () => {
    const r = calcularPrecificacao({ ...base, quantidadeProduzida: 0 });
    expect(r.custoUnitario).toBe(r.custoTotalLote);
    expect(r.precoSugeridoUnitario).toBe(r.precoSugeridoLote);
    expect(r.custoIngredientesUnitario).toBe(base.custoIngredientes);
  });

  it("margem igual ou acima de 100 nao divide por zero", () => {
    const r100 = calcularPrecificacao({ ...base, margemDesejada: 100 });
    expect(r100.precoSugeridoLote).toBeCloseTo(125, 10);
    const r120 = calcularPrecificacao({ ...base, margemDesejada: 120 });
    expect(r120.precoSugeridoLote).toBeCloseTo(125, 10);
    expect(r120.margemLucroRealSugerida).toBe(0);
  });

  it("preco de cardapio zerado zera a margem real", () => {
    const r = calcularPrecificacao({ ...base, precoCardapio: 0 });
    expect(r.margemLucroRealAtual).toBe(0);
    expect(r.lucroLiquidoUnitarioAtual).toBeLessThan(0);
    expect(r.diferencaPrecoUnitario).toBe(-r.precoSugeridoUnitario);
  });

  it("coerencia lote x unidade", () => {
    const r = calcularPrecificacao(base);
    expect(r.precoSugeridoUnitario * base.quantidadeProduzida).toBeCloseTo(r.precoSugeridoLote, 8);
    expect(r.custoUnitario * base.quantidadeProduzida).toBeCloseTo(r.custoTotalLote, 8);
    expect(r.custoIngredientesUnitario * base.quantidadeProduzida).toBeCloseTo(base.custoIngredientes, 8);
  });

  it("diferenca compara cardapio unitario com sugerido unitario (nunca com o lote)", () => {
    const r = calcularPrecificacao({ ...base, quantidadeProduzida: 10, precoCardapio: 60 });
    expect(r.diferencaPrecoUnitario).toBe(60 - r.precoSugeridoUnitario);
    expect(r.diferencaPrecoUnitario).not.toBe(60 - r.precoSugeridoLote);
    expect(r.precoSugeridoLote).toBe(250);
    expect(r.precoSugeridoUnitario).toBe(25);
    expect(r.diferencaPrecoUnitario).toBe(35);
  });
});

describe("somarCustoIngredientes", () => {
  it("mantem os dois lances de Chocolate em Po separados", () => {
    const ingredientes = [
      { quantidade: 0.05, custoUnitario: 38 },
      { quantidade: 0.03, custoUnitario: 38 },
    ];
    expect(somarCustoIngredientes(ingredientes)).toBeCloseTo(3.04, 10);
    expect(somarCustoIngredientes(ingredientes.slice(0, 1))).toBeCloseTo(1.9, 10);
    expect(somarCustoIngredientes(ingredientes.slice(1))).toBeCloseTo(1.14, 10);
  });

  it("trata custo unitario ausente como zero", () => {
    expect(somarCustoIngredientes([{ quantidade: 2, custoUnitario: undefined }, { quantidade: 3, custoUnitario: 1.5 }])).toBeCloseTo(4.5, 10);
  });

  it("lista vazia soma zero", () => {
    expect(somarCustoIngredientes([])).toBe(0);
  });
});

describe("receitas por Quilo", () => {
  const porQuilo = { ...base, quantidadeProduzida: 2.5, precoCardapio: 90 };

  it("preco sugerido por quilo = PrecoSugeridoLote / PesoTotalEmKg", () => {
    const r = calcularPrecificacao(porQuilo);
    expect(r.precoSugeridoLote).toBeCloseTo(250, 10);
    expect(r.precoSugeridoUnitario).toBeCloseTo(100, 10);
    expect(r.precoSugeridoUnitario).toBeCloseTo(r.precoSugeridoLote / 2.5, 10);
    expect(r.custoUnitario).toBeCloseTo(50, 10);
    expect(r.custoIngredientesUnitario).toBeCloseTo(40, 10);
  });

  it("comparativo com o cardapio usa base equivalente por quilo", () => {
    const r = calcularPrecificacao(porQuilo);
    expect(r.diferencaPrecoUnitario).toBe(90 - 100);
    expect(r.diferencaPrecoUnitario).not.toBe(90 - r.precoSugeridoLote);
    expect(r.lucroLiquidoUnitarioAtual).toBeCloseTo(40, 10);
    expect(r.margemLucroRealAtual).toBeCloseTo((40 / 90) * 100, 10);
    expect(r.lucroLiquidoUnitarioSugerido).toBeCloseTo(50, 10);
  });

  it("receita por unidade mantem o comportamento padrao (rendimento 1)", () => {
    const r = calcularPrecificacao({ ...base, quantidadeProduzida: 1 });
    expect(r.precoSugeridoUnitario).toBe(r.precoSugeridoLote);
    expect(r.custoUnitario).toBe(r.custoTotalLote);
    expect(r.custoIngredientesUnitario).toBe(base.custoIngredientes);
  });
});

describe("ehReceitaPorUnidade", () => {
  it("padrao: quantidade 1 com unidade Unidade", () => {
    expect(ehReceitaPorUnidade(1, "un")).toBe(true);
    expect(ehReceitaPorUnidade(1, "Unidade")).toBe(true);
  });

  it("nao simplifica para kg ou quantidades diferentes de 1", () => {
    expect(ehReceitaPorUnidade(1, "kg")).toBe(false);
    expect(ehReceitaPorUnidade(2.5, "kg")).toBe(false);
    expect(ehReceitaPorUnidade(2, "un")).toBe(false);
    expect(ehReceitaPorUnidade(1.5, "un")).toBe(false);
  });
});

describe("normalizarQuantidadeProduzida", () => {
  it("Unidade aceita apenas inteiros >= 1", () => {
    expect(normalizarQuantidadeProduzida(1, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(1.1, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(1.9, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(3.9, "un")).toBe(3);
    expect(normalizarQuantidadeProduzida(0.5, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(0, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(-2, "un")).toBe(1);
    expect(normalizarQuantidadeProduzida(NaN, "un")).toBe(1);
  });

  it("kg aceita decimais", () => {
    expect(normalizarQuantidadeProduzida(2.5, "kg")).toBe(2.5);
    expect(normalizarQuantidadeProduzida(1.1, "kg")).toBe(1.1);
    expect(normalizarQuantidadeProduzida(1.5, "kg")).toBe(1.5);
    expect(normalizarQuantidadeProduzida(3, "kg")).toBe(3);
    expect(normalizarQuantidadeProduzida(0.05, "kg")).toBe(0.1);
    expect(normalizarQuantidadeProduzida(NaN, "kg")).toBe(1);
  });

  it("troca de kg para Unidade converte para inteiro >= 1", () => {
    expect(normalizarQuantidadeProduzida(2.5, "un")).toBe(2);
    expect(normalizarQuantidadeProduzida(0.5, "un")).toBe(1);
  });
});
