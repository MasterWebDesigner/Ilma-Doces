import type { CartItem, Product, Category } from "@/types/database";
import { getStoreConfig, DEFAULT_SETTINGS } from "./storeConfig";

export const CATEGORIA_BRINDE_NAME = "Gelinhos";
export const VALOR_MINIMO_BRINDE = DEFAULT_SETTINGS.valorMinimoBrinde;

export function getBrindeConfig(): { ativo: boolean; valorMinimo: number; categoriaId: string } {
  const s = getStoreConfig();
  return {
    ativo: s.brindeAtivo,
    valorMinimo: s.valorMinimoBrinde,
    categoriaId: s.brindeCategoriaId,
  };
}

export function isBrindeAtivo(): boolean {
  return getBrindeConfig().ativo;
}

export function getValorMinimoBrinde(): number {
  return getBrindeConfig().valorMinimo;
}

export function itemLineTotal(item: Pick<CartItem, "product" | "quantity" | "is_brinde" | "preco_unitario">): number {
  if (item.is_brinde) return 0;
  const unit = item.preco_unitario ?? item.product.price;
  return unit * item.quantity;
}

export function paidSubtotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + itemLineTotal(i), 0);
}

export function brindeProgress(subtotal: number): {
  eligible: boolean;
  percent: number;
  remaining: number;
} {
  const min = getValorMinimoBrinde();
  const eligible = min > 0 && subtotal >= min;
  const percent = min > 0 ? Math.min(100, Math.max(0, (subtotal / min) * 100)) : 100;
  return {
    eligible,
    percent,
    remaining: Math.max(0, min - subtotal),
  };
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isBrindeProduct(product: Product, categories: Category[]): boolean {
  const { categoriaId } = getBrindeConfig();
  if (categoriaId && product.category_id === categoriaId) return true;
  const cat = categories.find((c) => c.id === product.category_id);
  if (cat) {
    const configured = categories.find((c) => c.id === getBrindeConfig().categoriaId);
    if (configured && cat.id === configured.id) return true;
    if (normalizeName(cat.name) === normalizeName(CATEGORIA_BRINDE_NAME)) return true;
  }
  return normalizeName(product.name).includes("gelinho");
}

export function availableBrindeFlavors(products: Product[], categories: Category[]): Product[] {
  if (!isBrindeAtivo()) return [];
  return products.filter((p) => {
    if (!isBrindeProduct(p, categories)) return false;
    if (p.is_available === false) return false;
    if (p.controlarEstoque && (p.estoque ?? 0) <= 0) return false;
    return true;
  });
}

export function makeBrindeItem(product: Product): CartItem {
  return {
    product,
    quantity: 1,
    is_brinde: true,
    preco_unitario: 0,
  };
}

export function enforceBrindeRule(items: CartItem[], opts?: { allowLoyalty?: boolean }): CartItem[] {
  if (!isBrindeAtivo()) return items.filter((i) => !i.is_brinde);
  if (opts?.allowLoyalty) return items;
  const sub = paidSubtotal(items);
  if (sub < getValorMinimoBrinde()) {
    return items.filter((i) => !i.is_brinde);
  }
  return items;
}
