import type { Order, Customer, Credor } from "@/types/database";
import { formatCurrency } from "./utils";
import { isBrindeAtivo, getValorMinimoBrinde } from "./brinde";

export interface LoyaltyProgress {
  eligible: boolean;
  percent: number;
  remaining: number;
}

export function loyaltyProgress(balance: number, meta?: number): LoyaltyProgress {
  const goal = meta ?? getValorMinimoBrinde();
  const active = isBrindeAtivo();
  const eligible = active && goal > 0 && balance >= goal;
  const percent = goal > 0 ? Math.min(100, Math.max(0, (balance / goal) * 100)) : active ? 100 : 0;
  return {
    eligible,
    percent,
    remaining: Math.max(0, goal - balance),
  };
}

export function loyaltyProgressLabel(balance: number, meta?: number): string {
  const goal = meta ?? getValorMinimoBrinde();
  const p = loyaltyProgress(balance, goal);
  const pct = Math.round(p.percent);
  return `${formatCurrency(balance)} / ${formatCurrency(goal)} (${pct}%${p.eligible ? " - Pronto p/ Brinde" : ""})`;
}

function cleanPhone(raw?: string): string {
  return raw ? raw.replace(/\D/g, "") : "";
}

function matchesIdentity(
  phoneClean: string,
  name: string | undefined,
  target: { customerPhone?: string; customerName?: string }
): boolean {
  const tPhone = cleanPhone(target.customerPhone);
  const tName = (target.customerName || "").toLowerCase().trim();
  const nameL = (name || "").toLowerCase().trim();
  return Boolean(
    (phoneClean && tPhone && phoneClean === tPhone) ||
    (nameL && tName && nameL === tName)
  );
}

function matchesCredor(
  phoneClean: string,
  name: string | undefined,
  cr: Credor
): boolean {
  const crPhone = cleanPhone(cr.whatsapp);
  const crName = (cr.nome || "").toLowerCase().trim();
  const nameL = (name || "").toLowerCase().trim();
  return Boolean(
    (phoneClean && crPhone && phoneClean === crPhone) ||
    (nameL && crName && nameL === crName)
  );
}

export function computeLoyaltyAutoTotal(
  phoneClean: string,
  name: string | undefined,
  orders: Order[],
  credores: Credor[]
): number {
  const completed = orders.filter(
    (o) => o.status === "concluido" && matchesIdentity(phoneClean, name, o)
  );
  const orderTotal = completed.reduce((sum, o) => sum + (o.total || 0), 0);

  const manualCredorTotal = credores
    .filter((cr) => matchesCredor(phoneClean, name, cr))
    .flatMap((cr) => cr.compras || [])
    .filter((c) => c.origem !== "pedido" && !c.referenciaId)
    .reduce((sum, c) => sum + (Number(c.valor) || 0), 0);

  return orderTotal + manualCredorTotal;
}

export function getCustomerOffset(customers: Customer[], phoneClean: string): number {
  if (!phoneClean) return 0;
  const c = customers.find((cu) => cleanPhone(cu.phone) === phoneClean);
  return Math.max(0, Number(c?.fidelidadeOffset) || 0);
}

export function computeLoyaltyBalance(
  phoneClean: string,
  name: string | undefined,
  orders: Order[],
  credores: Credor[],
  customers: Customer[]
): { autoTotal: number; offset: number; balance: number } {
  const autoTotal = computeLoyaltyAutoTotal(phoneClean, name, orders, credores);
  const offset = getCustomerOffset(customers, phoneClean);
  const balance = Math.max(0, autoTotal - offset);
  return { autoTotal, offset, balance };
}
