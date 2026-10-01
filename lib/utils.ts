export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

export type PaymentLabel = "PIX" | "Dinheiro" | "Cartão Débito" | "Cartão Crédito" | "Fiado" | "Outros";

export function paymentLabelOf(raw: string | null | undefined): PaymentLabel {
  const normalized = (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Outros";
  if (normalized.includes("debito")) return "Cartão Débito";
  if (normalized.includes("credito")) return "Cartão Crédito";
  if (normalized.includes("dinheiro") || normalized.includes("cash")) return "Dinheiro";
  if (normalized.includes("pix")) return "PIX";
  if (normalized.includes("fiado") || normalized.includes("prazo") || normalized.includes("creditorio") || normalized.includes("conta cliente")) return "Fiado";
  return "Outros";
}

/** Fuso horário explícito do negócio. America/Sao_Paulo é UTC-3 e não tem DST desde 2019. */
export const FUSO_BRASIL = "America/Sao_Paulo";

const formatadorDataBrasil = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_BRASIL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function partesDataBrasil(d: Date): { ano: string; mes: string; dia: string } | null {
  if (Number.isNaN(d.getTime())) return null;
  const partes = formatadorDataBrasil.formatToParts(d);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value || "";
  return { ano: valor("year"), mes: valor("month"), dia: valor("day") };
}

/**
 * Retorna a data "YYYY-MM-DD" no fuso explícito America/Sao_Paulo.
 * Nunca usa o UTC puro de `toISOString()`: um instante das 23:59:59.999 BRT
 * permanece no mesmo dia local, e as 00:00:00.000 BRT pertencem ao dia seguinte.
 */
export function getLocalDateStr(date?: Date): string {
  const partes = partesDataBrasil(date || new Date());
  if (!partes) return "";
  return `${partes.ano}-${partes.mes}-${partes.dia}`;
}

/** Retorna "YYYY-MM" no fuso explícito America/Sao_Paulo. */
export function getLocalMonthStr(date?: Date): string {
  const partes = partesDataBrasil(date || new Date());
  if (!partes) return "";
  return `${partes.ano}-${partes.mes}`;
}

/**
 * Converte um instante ISO gravado em UTC (ex.: `createdAt` vindo de
 * `toISOString()`) para a data local "YYYY-MM-DD" de America/Sao_Paulo.
 * É o único caminho correto para comparar `createdAt` com chaves de período.
 * Retorna "" para valor ausente ou inválido.
 */
export function getLocalDateStrFromISO(iso?: string | null): string {
  if (!iso) return "";
  const entrada = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(entrada)) return entrada;
  return getLocalDateStr(new Date(entrada));
}

/** Gera ID seguro para transações/despesas usando horário local. */
export function generateId(prefix: string): string {
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `${prefix}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
}

export function formatWeightKg(qty: number): string {
  return `${qty.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

export function formatItemQty(qty: number, isCustomWeight?: boolean): string {
  return isCustomWeight ? formatWeightKg(qty) : `x${qty}`;
}
