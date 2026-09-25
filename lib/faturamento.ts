import type { Order } from "@/types/database";
import type { FinancialTransaction } from "@/types/database";

export function getPaidDate(order: Order): string | null {
  if (order.dataPagamento) return order.dataPagamento.slice(0, 10);
  if (order.isFiado) return null;
  if (order.status === "concluido" && order.createdAt) return order.createdAt.slice(0, 10);
  return null;
}

export function isOrderPaid(order: Order): boolean {
  return getPaidDate(order) !== null;
}

export function isPaidInPeriod(order: Order, prefix: string): boolean {
  const d = getPaidDate(order);
  return !!d && d.slice(0, prefix.length) === prefix;
}

export function orderRemaining(order: Order): number {
  if (isOrderPaid(order)) return 0;
  const total = Number(order.total) || 0;
  const sinal = Number(order.valorPagoSinal) || 0;
  return Math.max(0, total - sinal);
}

export function sumReceitasByDate(
  transactions: FinancialTransaction[],
  datePrefix: string
): number {
  return transactions
    .filter(
      (t) =>
        t.tipo === "RECEITA" &&
        t.data &&
        t.data.slice(0, datePrefix.length) === datePrefix
    )
    .reduce((s, t) => s + (Number(t.valor) || 0), 0);
}

export function filterPaidOrders(
  orders: Order[],
  prefix: string
): Order[] {
  return orders.filter((o) => isPaidInPeriod(o, prefix));
}

export function filterUnpaidOrders(
  orders: Order[],
  prefix: string
): Order[] {
  return orders.filter((o) => {
    if (isOrderPaid(o)) return false;
    const created = (o.createdAt || "").slice(0, prefix.length);
    return created === prefix;
  });
}
