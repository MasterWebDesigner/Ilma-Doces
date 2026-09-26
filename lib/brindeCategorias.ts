import type { CartItem } from "@/types/database";

export interface RegrasCategoriasBrinde {
  todasCategorias: boolean;
  categoriasPromo: string[];
}

export function itemLineTotal(item: Pick<CartItem, "product" | "quantity" | "is_brinde" | "preco_unitario">): number {
  if (item.is_brinde) return 0;
  const unit = item.preco_unitario ?? item.product.price;
  return unit * item.quantity;
}

export function paidSubtotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + itemLineTotal(i), 0);
}

export function itemContaParaBrinde(item: CartItem, regras: RegrasCategoriasBrinde): boolean {
  if (item.is_brinde) return false;
  if (regras.todasCategorias) return true;
  return regras.categoriasPromo.includes(item.product.category_id);
}

export function subtotalParaBrindeComRegras(items: CartItem[], regras: RegrasCategoriasBrinde): number {
  if (regras.todasCategorias) return paidSubtotal(items);
  return items.reduce((s, i) => (itemContaParaBrinde(i, regras) ? s + itemLineTotal(i) : s), 0);
}
