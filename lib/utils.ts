export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
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

/** Retorna a data de hoje em formato "YYYY-MM-DD" no horário LOCAL (não UTC). */
export function getLocalDateStr(date?: Date): string {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Retorna "YYYY-MM" no horário LOCAL. */
export function getLocalMonthStr(date?: Date): string {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
