import type { Order } from "@/types/database";
import type { CartItem, FinancialTransaction, PaymentMethod } from "@/types/database";
import { getLocalDateStr, paymentLabelOf } from "./utils";

export const PERCENTUAL_SINAL = 0.5;

export function exigeSinalPedido(items: CartItem[]): boolean {
  return (items || []).some((item) => !item.is_brinde && item.product.cardapioRapido !== true);
}

export function valorSinalPedido(total: number): number {
  return Math.round((Number(total) || 0) * PERCENTUAL_SINAL * 100) / 100;
}

export function sinalRecebidoDoPedido(order: Order): number {
  const explicito = Number(order.valorPagoSinal ?? order.valorSinalPago) || 0;
  if (explicito > 0) return explicito;
  if (order.sinalPago) return Number(order.valorSinal) || 0;
  return 0;
}

export function detalheSinalPedido(order: Order): {
  exigido: boolean;
  valor: number;
  pago: boolean;
  recebido: number;
} {
  const exigido = order.sinalExigido ?? exigeSinalPedido(order.items || []);
  const valor = order.valorSinal ?? (exigido ? valorSinalPedido(order.total) : 0);
  const recebido = sinalRecebidoDoPedido(order);
  const pago = order.sinalPago === true || recebido > 0;
  return { exigido, valor, pago, recebido };
}

export function montarTransacaoSinal(
  order: Order,
  valor: number,
  forma: PaymentMethod = "pix"
): Omit<FinancialTransaction, "id" | "createdAt"> {
  const numero = order.orderNumber || order.id.slice(-6);
  return {
    tipo: "RECEITA",
    categoria: "Sinal de Encomenda",
    valor,
    formaPagamento: paymentLabelOf(forma),
    descricao: `Sinal do Pedido #${numero} — ${order.customerName}`,
    data: getLocalDateStr(),
    pedidoId: order.id,
  };
}

export function localizarTransacaoSinal(
  transactions: FinancialTransaction[],
  order: Order
): FinancialTransaction | undefined {
  const numero = order.orderNumber || order.id.slice(-6);
  const candidatas = (transactions || []).filter(
    (t) =>
      t.tipo === "RECEITA" &&
      t.categoria === "Sinal de Encomenda" &&
      (t.pedidoId === order.id || (t.descricao || "").includes(`#${numero}`))
  );
  if (!candidatas.length) return undefined;
  return candidatas.find((t) => t.pedidoId === order.id) || candidatas[0];
}

export function pedidoEhFiado(order: Order): boolean {
  return !!order.isFiado || order.paymentMethod === "fiado";
}

export function getPaidDate(order: Order): string | null {
  if (order.dataPagamento) return order.dataPagamento.slice(0, 10);
  if (pedidoEhFiado(order)) return null;
  if (order.status === "concluido" && order.createdAt) {
    return getLocalDateStr(new Date(order.createdAt));
  }
  return null;
}

export function isOrderPaid(order: Order): boolean {
  return getPaidDate(order) !== null;
}

export function isPaidInPeriod(order: Order, prefix: string): boolean {
  const d = getPaidDate(order);
  return !!d && d.slice(0, prefix.length) === prefix;
}

export function isFiadoPendente(order: Order): boolean {
  if (order.status === "recusado" || order.status === "cancelado") return false;
  return pedidoEhFiado(order) && getPaidDate(order) === null;
}

export function formaPagamentoDoPedido(order: Order): string {
  if (isFiadoPendente(order)) return "Fiado";
  return paymentLabelOf(order.paymentMethod);
}

export function orderRemaining(order: Order): number {
  if (isOrderPaid(order)) return 0;
  const total = Number(order.total) || 0;
  const sinal = sinalRecebidoDoPedido(order);
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
    if (o.status === "recusado" || o.status === "cancelado") return false;
    if (isOrderPaid(o)) return false;
    const created = (o.createdAt || "").slice(0, prefix.length);
    return created === prefix;
  });
}
