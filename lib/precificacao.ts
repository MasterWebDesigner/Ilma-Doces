/* === Motor de Precificacao (fonte unica dos calculos de precos) === */

export interface EntradaPrecificacao {
  custoIngredientes: number;
  percentualInvisivel: number;
  horasTrabalhadasMes: number;
  salarioMensal: number;
  tempoProducaoMinutos: number;
  quantidadeProduzida: number;
  margemDesejada: number;
  precoCardapio: number;
}

export interface ResultadoPrecificacao {
  custoInvisivel: number;
  taxaMinutoMO: number;
  custoMaoDeObra: number;
  custoTotalLote: number;
  custoIngredientesUnitario: number;
  custoUnitario: number;
  precoSugeridoLote: number;
  precoSugeridoUnitario: number;
  lucroLiquidoUnitarioAtual: number;
  margemLucroRealAtual: number;
  diferencaPrecoUnitario: number;
  lucroLiquidoUnitarioSugerido: number;
  margemLucroRealSugerida: number;
}

export function calcularPrecificacao(entrada: EntradaPrecificacao): ResultadoPrecificacao {
  const custoInvisivel = entrada.custoIngredientes * (entrada.percentualInvisivel / 100);
  const taxaMinutoMO =
    entrada.horasTrabalhadasMes > 0 && entrada.salarioMensal > 0
      ? entrada.salarioMensal / (entrada.horasTrabalhadasMes * 60)
      : 0;
  const custoMaoDeObra = entrada.tempoProducaoMinutos * taxaMinutoMO;
  const custoTotalLote = entrada.custoIngredientes + custoInvisivel + custoMaoDeObra;
  const custoUnitario =
    entrada.quantidadeProduzida > 0 ? custoTotalLote / entrada.quantidadeProduzida : custoTotalLote;
  const custoIngredientesUnitario =
    entrada.quantidadeProduzida > 0
      ? entrada.custoIngredientes / entrada.quantidadeProduzida
      : entrada.custoIngredientes;
  const precoSugeridoLote =
    entrada.margemDesejada < 100
      ? custoTotalLote / (1 - entrada.margemDesejada / 100)
      : custoTotalLote;
  const precoSugeridoUnitario =
    entrada.quantidadeProduzida > 0
      ? precoSugeridoLote / entrada.quantidadeProduzida
      : precoSugeridoLote;
  const lucroLiquidoUnitarioAtual = entrada.precoCardapio - custoUnitario;
  const margemLucroRealAtual =
    entrada.precoCardapio > 0 ? (lucroLiquidoUnitarioAtual / entrada.precoCardapio) * 100 : 0;
  const diferencaPrecoUnitario = entrada.precoCardapio - precoSugeridoUnitario;
  const lucroLiquidoUnitarioSugerido = precoSugeridoUnitario - custoUnitario;
  const margemLucroRealSugerida =
    precoSugeridoUnitario > 0 ? (lucroLiquidoUnitarioSugerido / precoSugeridoUnitario) * 100 : 0;
  return {
    custoInvisivel,
    taxaMinutoMO,
    custoMaoDeObra,
    custoTotalLote,
    custoIngredientesUnitario,
    custoUnitario,
    precoSugeridoLote,
    precoSugeridoUnitario,
    lucroLiquidoUnitarioAtual,
    margemLucroRealAtual,
    diferencaPrecoUnitario,
    lucroLiquidoUnitarioSugerido,
    margemLucroRealSugerida,
  };
}

export interface IngredienteCusto {
  quantidade: number;
  custoUnitario?: number;
}

export function somarCustoIngredientes(ingredientes: IngredienteCusto[]): number {
  return ingredientes.reduce(
    (total, ing) => total + (ing.quantidade || 0) * (ing.custoUnitario ?? 0),
    0
  );
}

export function ehReceitaPorUnidade(rendimento: number, unidade: string): boolean {
  return rendimento === 1 && (unidade === "un" || unidade === "Unidade");
}

export function normalizarQuantidadeProduzida(valor: number, unidade: string): number {
  const numero = Number.isFinite(valor) && valor > 0 ? valor : 1;
  if (unidade === "kg") return Math.max(0.1, numero);
  return Math.max(1, Math.floor(numero));
}
