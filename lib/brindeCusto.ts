import type { Product, FichaTecnica, Expense } from "@/types/database";

export const CATEGORIA_DESPESA_BRINDE = "Custos de Brindes / Fidelidade";

export function custoDaFichaTecnica(ficha?: FichaTecnica | null): number {
  if (!ficha) return 0;
  const ingredientes = Array.isArray(ficha.ingredientes) ? ficha.ingredientes : [];
  const custoIngredientes = ingredientes.reduce(
    (soma, ing) => soma + (Number(ing.quantidade) || 0) * (Number(ing.custoUnitario) || 0),
    0
  );
  const custoInvisivel = custoIngredientes * ((Number(ficha.custoInvisivelPct) || 0) / 100);
  const maoDeObra = (Number(ficha.maoDeObraValorHora) || 0) * ((Number(ficha.maoDeObraMin) || 0) / 60);
  return custoIngredientes + custoInvisivel + maoDeObra;
}

export function custoDoBrinde(
  product: Pick<Product, "precoCustoInicial" | "price">,
  ficha?: FichaTecnica | null
): number {
  const custoInicial = Number(product.precoCustoInicial) || 0;
  if (custoInicial > 0) return custoInicial;
  const custoFicha = custoDaFichaTecnica(ficha);
  if (custoFicha > 0) return custoFicha;
  return 0;
}

export function montarDespesaBrinde(
  product: Pick<Product, "name" | "precoCustoInicial" | "price">,
  clienteNome: string,
  ficha: FichaTecnica | undefined,
  data: string
): Omit<Expense, "id" | "createdAt"> {
  return {
    descricao: `BRINDE — ${product.name} — ${clienteNome}`,
    categoria: CATEGORIA_DESPESA_BRINDE,
    valor: custoDoBrinde(product, ficha),
    data,
    status: "Pago",
  };
}
