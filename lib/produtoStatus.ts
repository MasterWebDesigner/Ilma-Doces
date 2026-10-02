import type { Product } from "@/types/database";

export type StatusProduto = "ativo" | "inativo" | "esgotado";

export function statusProduto(product: Product): StatusProduto {
  if (product.ativo === false) return "inativo";
  if (product.is_available === false) return "esgotado";
  if (product.controlarEstoque && (product.estoque ?? 0) <= 0) return "esgotado";
  return "ativo";
}

export function produtoVisivel(product: Product): boolean {
  return product.ativo !== false;
}

export function produtoEsgotado(product: Product): boolean {
  return statusProduto(product) === "esgotado";
}
