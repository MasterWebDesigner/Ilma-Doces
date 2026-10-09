import type { MixCaixa, Product, ProductCombo } from "@/types/database";
import { formatItemQty } from "./utils";

export function ehCombo(product: Product): boolean {
  const combo = product.combo;
  if (!combo || combo.total <= 0) return false;
  return !!combo.categoriaId || combo.sabores.length > 0;
}

export function saboresDoCombo(combo: ProductCombo | null | undefined, products: Product[]): string[] {
  if (!combo) return [];
  if (combo.categoriaId) {
    return products
      .filter(
        (p) =>
          p.category_id === combo.categoriaId &&
          p.is_available !== false &&
          !p.combo
      )
      .map((p) => p.name.trim())
      .filter(Boolean);
  }
  return combo.sabores ?? [];
}

export function parseSabores(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatarSabores(sabores: string[]): string {
  return sabores.join("\n");
}

export function criarMixVazio(sabores: string[]): MixCaixa {
  const mix: MixCaixa = {};
  for (const sabor of sabores) mix[sabor] = 0;
  return mix;
}

export function totalDoMix(mix: MixCaixa): number {
  return Object.values(mix).reduce((acc, qtd) => acc + (Number(qtd) || 0), 0);
}

export function mixCompleto(mix: MixCaixa, total: number): boolean {
  return totalDoMix(mix) === total;
}

export function todosCompletos(mixes: MixCaixa[], total: number): boolean {
  return mixes.length > 0 && mixes.every((m) => mixCompleto(m, total));
}

export function alterarQtdMix(mix: MixCaixa, sabor: string, delta: number, total: number): MixCaixa {
  const atual = Math.max(0, (mix[sabor] ?? 0) + delta);
  const semEste = totalDoMix(mix) - (mix[sabor] ?? 0);
  const limite = Math.max(0, total - semEste);
  return { ...mix, [sabor]: Math.min(atual, limite) };
}

export function ajustarMixParaQuantidade(mix: MixCaixa[], quantidade: number): MixCaixa[] {
  if (quantidade <= 0) return [];
  if (quantidade <= mix.length) return mix.slice(0, quantidade);
  const ultimo = mix[mix.length - 1] ?? {};
  const extras: MixCaixa[] = Array.from({ length: quantidade - mix.length }, () => ({ ...ultimo }));
  return [...mix, ...extras];
}

export function validarCombo(total: number, sabores: string[], passo?: number): string | null {
  if (!Number.isFinite(total) || total < 1) return "Informe quantos docinhos tem a caixa (minimo 1).";
  const limpos = sabores.map((s) => s.trim()).filter(Boolean);
  if (limpos.length < 2) return "Cadastre pelo menos 2 sabores disponiveis.";
  if (new Set(limpos).size !== limpos.length) return "Ha sabores repetidos na lista de sabores.";
  if (passo && passo > 0) {
    if (passo > total) return "O multiplo por sabor nao pode ser maior que a caixa.";
    if (total % passo !== 0) return `O total da caixa deve ser multiplo de ${passo} (ex.: 50 com passo 25).`;
  }
  return null;
}

export function formatarMix(mix: MixCaixa): string {
  const partes = Object.entries(mix)
    .filter(([, qtd]) => qtd > 0)
    .map(([sabor, qtd]) => `${qtd}x ${sabor}`);
  return partes.length > 0 ? partes.join(", ") : "caixa vazia";
}

export function formatarMixes(mixes: MixCaixa[]): string {
  if (mixes.length === 0) return "";
  if (mixes.length === 1) return formatarMix(mixes[0]);
  return mixes.map((m, i) => `Caixa ${i + 1}: ${formatarMix(m)}`).join(" | ");
}

export interface ResumoItemPedido {
  texto: string;
  detalhes?: string[];
}

export function resumoItemPedido(nome: string, quantity: number, mix?: MixCaixa[] | null, isCustomWeight?: boolean): ResumoItemPedido {
  if (mix && mix.length > 0) {
    return {
      texto: `${nome} ${quantity} caixa(s)`,
      detalhes: mix.map((m, mi) => `${mix.length > 1 ? `Caixa ${mi + 1}: ` : ""}${formatarMix(m)}`),
    };
  }
  return { texto: `${nome} ${formatItemQty(quantity, isCustomWeight)}` };
}
