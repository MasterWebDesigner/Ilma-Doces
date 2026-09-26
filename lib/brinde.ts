import type { CartItem, Product, Category } from "@/types/database";
import { getStoreConfig, DEFAULT_SETTINGS } from "./storeConfig";
import {
  itemContaParaBrinde as contaParaBrinde,
  subtotalParaBrindeComRegras,
  type RegrasCategoriasBrinde,
} from "./brindeCategorias";

export { itemLineTotal, paidSubtotal } from "./brindeCategorias";

export const CATEGORIA_BRINDE_NAME = "Gelinhos";
export const VALOR_MINIMO_BRINDE = DEFAULT_SETTINGS.valorMinimoBrinde;

export interface BrindeRegras extends RegrasCategoriasBrinde {
  ativo: boolean;
  valorMinimo: number;
}

export function getBrindeRegras(): BrindeRegras {
  const s = getStoreConfig();
  return {
    ativo: s.brindeAtivo,
    valorMinimo: s.valorMinimoBrinde,
    todasCategorias: s.brindeTodasCategorias !== false,
    categoriasPromo: Array.isArray(s.brindeCategoriasPromo) ? s.brindeCategoriasPromo : [],
  };
}

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

export function itemContaParaBrinde(item: CartItem, regras?: BrindeRegras): boolean {
  return contaParaBrinde(item, regras ?? getBrindeRegras());
}

export function subtotalParaBrinde(items: CartItem[], regras?: BrindeRegras): number {
  return subtotalParaBrindeComRegras(items, regras ?? getBrindeRegras());
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
  const sub = subtotalParaBrinde(items);
  if (sub < getValorMinimoBrinde()) {
    return items.filter((i) => !i.is_brinde);
  }
  return items;
}
