export interface EntradaHistorico {
  refId: string;
  dataEntrada: string;
  precoUnitario: number;
  brandId?: string;
}

export function obterPrecoMedio(
  refId: string,
  historico: EntradaHistorico[],
  precoCustoInicial?: number,
  limite = 5
): number {
  const entradas = historico
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => e.refId === refId)
    .sort((a, b) => {
      const porData = b.e.dataEntrada.localeCompare(a.e.dataEntrada);
      if (porData !== 0) return porData;
      return b.idx - a.idx;
    })
    .slice(0, limite)
    .map(({ e }) => e);
  if (entradas.length === 0) return precoCustoInicial ?? 0;
  const soma = entradas.reduce((s, e) => s + e.precoUnitario, 0);
  return soma / entradas.length;
}

interface LoteLike {
  id: string;
  insumoId: string;
  dataEntrada: string;
  precoUnitario: number;
  brandId?: string;
}

export function batchesParaHistorico(batches: LoteLike[]): EntradaHistorico[] {
  return batches.map((b) => ({
    refId: b.insumoId,
    dataEntrada: b.dataEntrada,
    precoUnitario: b.precoUnitario,
    brandId: b.brandId,
  }));
}

export function obterPrecoMedioInsumo(
  batches: LoteLike[],
  insumoId: string,
  precoCustoInicial?: number,
  brandId?: string
): number {
  const filtrados = batches.filter(
    (b) => b.insumoId === insumoId && (brandId ? b.brandId === brandId : true)
  );
  return obterPrecoMedio(insumoId, batchesParaHistorico(filtrados), precoCustoInicial);
}
