import type { CompraCredor, Credor } from "@/types/database";

export const STATUS_PEDIDO_LIQUIDADO: readonly string[] = [
  "concluido",
  "pago",
  "liquidado",
  "quitado",
  "finalizado",
];

export const STATUS_PEDIDO_FINAL: readonly string[] = ["concluido", "recusado", "cancelado"];

export const STATUS_PEDIDO_ANTERIOR: readonly string[] = ["pendente", "confirmado", "em_producao"];

export type OpcoesReversao = { permitirReverter?: boolean };

export function ehPedidoLiquidado(status?: string | null): boolean {
  return !!status && STATUS_PEDIDO_LIQUIDADO.includes(status);
}

export function ehPedidoFinal(status?: string | null): boolean {
  return !!status && STATUS_PEDIDO_FINAL.includes(status);
}

export function ehEstadoAnteriorPedido(status?: string | null): boolean {
  return !!status && STATUS_PEDIDO_ANTERIOR.includes(status);
}

export function ehPedidoEncerrado(status?: string | null): boolean {
  return ehPedidoLiquidado(status) || ehPedidoFinal(status);
}

export function ehCompraLiquidada(compra?: CompraCredor | null): boolean {
  if (!compra) return false;
  return compra.pago === true || compra.status === "QUITADO" || compra.status === "CANCELADO";
}

export function deveBloquearReversaoPedido(
  statusRemoto: string | null | undefined,
  statusNovo: string | null | undefined,
  permitirReverter = false
): boolean {
  if (permitirReverter || !statusNovo) return false;
  if (ehPedidoEncerrado(statusRemoto) && statusNovo !== statusRemoto) return true;
  return false;
}

export function divergenciaDeReversaoCredor(remoto: Credor, atualizado: Credor): boolean {
  const comprasAtualizadas = new Map((atualizado.compras || []).map((compra) => [compra.id, compra]));
  for (const compraRemota of remoto.compras || []) {
    const compraAtualizada = comprasAtualizadas.get(compraRemota.id);
    if (!compraAtualizada) return true;
    if (ehCompraLiquidada(compraRemota) && !ehCompraLiquidada(compraAtualizada)) return true;
  }
  return false;
}
