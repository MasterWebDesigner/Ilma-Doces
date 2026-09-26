import type { CompraCredor, Credor } from "@/types/database";

export const STATUS_PEDIDO_LIQUIDADO: readonly string[] = [
  "concluido",
  "pago",
  "liquidado",
  "quitado",
  "finalizado",
];

export type OpcoesReversao = { permitirReverter?: boolean };

export function ehPedidoLiquidado(status?: string | null): boolean {
  return !!status && STATUS_PEDIDO_LIQUIDADO.includes(status);
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
  return ehPedidoLiquidado(statusRemoto) && !ehPedidoLiquidado(statusNovo);
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
