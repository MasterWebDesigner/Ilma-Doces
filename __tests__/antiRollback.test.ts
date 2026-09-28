import { describe, it, expect } from "vitest";
import {
  ehPedidoLiquidado,
  ehCompraLiquidada,
  deveBloquearReversaoPedido,
  divergenciaDeReversaoCredor,
} from "@/lib/antiRollback";
import type { Credor, CompraCredor } from "@/types/database";

function compra(overrides: Partial<CompraCredor> = {}): CompraCredor {
  return {
    id: "c1",
    origem: "manual",
    descricao: "Bolo de chocolate",
    valor: 100,
    valorPendente: 100,
    status: "PENDENTE",
    data: "2026-09-01",
    pago: false,
    ...overrides,
  };
}

function credor(compras: CompraCredor[], overrides: Partial<Credor> = {}): Credor {
  return {
    id: "cr1",
    clienteId: "cli1",
    nome: "Maria",
    whatsapp: "11999999999",
    compras,
    pagamentos: [],
    ...overrides,
  };
}

describe("antiRollback — status de pedido liquidado", () => {
  it("reconhece estados finais de pedido", () => {
    expect(ehPedidoLiquidado("concluido")).toBe(true);
    expect(ehPedidoLiquidado("pago")).toBe(true);
    expect(ehPedidoLiquidado("liquidado")).toBe(true);
    expect(ehPedidoLiquidado("quitado")).toBe(true);
    expect(ehPedidoLiquidado("finalizado")).toBe(true);
  });

  it("não considera liquidado estados em aberto", () => {
    expect(ehPedidoLiquidado("pendente")).toBe(false);
    expect(ehPedidoLiquidado("confirmado")).toBe(false);
    expect(ehPedidoLiquidado("em_producao")).toBe(false);
    expect(ehPedidoLiquidado("saiu_entrega")).toBe(false);
    expect(ehPedidoLiquidado(undefined)).toBe(false);
    expect(ehPedidoLiquidado(null)).toBe(false);
    expect(ehPedidoLiquidado("")).toBe(false);
  });

  it("bloqueia reversão de pedido liquidado para estado aberto", () => {
    expect(deveBloquearReversaoPedido("concluido", "pendente")).toBe(true);
    expect(deveBloquearReversaoPedido("concluido", "confirmado")).toBe(true);
    expect(deveBloquearReversaoPedido("concluido", "em_producao")).toBe(true);
    expect(deveBloquearReversaoPedido("pago", "pendente")).toBe(true);
    expect(deveBloquearReversaoPedido("liquidado", "pronto")).toBe(true);
    expect(deveBloquearReversaoPedido("quitado", "saiu_entrega")).toBe(true);
    expect(deveBloquearReversaoPedido("finalizado", "pendente")).toBe(true);
  });

  it("permite avanços e manutenção de status", () => {
    expect(deveBloquearReversaoPedido("pendente", "confirmado")).toBe(false);
    expect(deveBloquearReversaoPedido("confirmado", "em_producao")).toBe(false);
    expect(deveBloquearReversaoPedido("em_producao", "concluido")).toBe(false);
    expect(deveBloquearReversaoPedido("concluido", "concluido")).toBe(false);
    expect(deveBloquearReversaoPedido(undefined, "pendente")).toBe(false);
    expect(deveBloquearReversaoPedido("concluido", undefined)).toBe(false);
    expect(deveBloquearReversaoPedido("pendente", "em_producao")).toBe(false);
  });

  it("libera a reversão apenas com ação explícita (permitirReverter)", () => {
    expect(deveBloquearReversaoPedido("concluido", "pendente", true)).toBe(false);
    expect(deveBloquearReversaoPedido("concluido", "pendente", false)).toBe(true);
    expect(deveBloquearReversaoPedido("concluido", "pendente", undefined)).toBe(true);
  });

  it("permite recusar novo pedido e cancelar aceito, mas não cancelar concluído", () => {
    expect(deveBloquearReversaoPedido("pendente", "recusado")).toBe(false);
    expect(deveBloquearReversaoPedido("confirmado", "cancelado")).toBe(false);
    expect(deveBloquearReversaoPedido("em_producao", "cancelado")).toBe(false);
    expect(deveBloquearReversaoPedido("concluido", "cancelado")).toBe(true);
    expect(ehPedidoLiquidado("recusado")).toBe(false);
    expect(ehPedidoLiquidado("cancelado")).toBe(false);
  });
});

describe("antiRollback — compra liquidada", () => {
  it("considera quitada e cancelada como liquidada", () => {
    expect(ehCompraLiquidada(compra({ pago: true, status: "QUITADO", valorPendente: 0 }))).toBe(true);
    expect(ehCompraLiquidada(compra({ status: "CANCELADO", pago: false, valorPendente: 0 }))).toBe(true);
    expect(ehCompraLiquidada(compra({ pago: true, status: "PENDENTE" }))).toBe(true);
  });

  it("compra em aberto não é liquidada", () => {
    expect(ehCompraLiquidada(compra())).toBe(false);
    expect(ehCompraLiquidada(compra({ status: "PENDENTE", pago: false, valorPendente: 50 }))).toBe(false);
  });

  it("aceita valores ausentes", () => {
    expect(ehCompraLiquidada(null)).toBe(false);
    expect(ehCompraLiquidada(undefined)).toBe(false);
  });
});

describe("antiRollback — divergência de credor", () => {
  it("bloqueia remoção de compra quitada", () => {
    const remoto = credor([compra({ id: "c1", pago: true, status: "QUITADO", valorPendente: 0 })]);
    const atualizado = credor([]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(true);
  });

  it("bloqueia remoção de compra pendente (perda de dívida)", () => {
    expect(divergenciaDeReversaoCredor(credor([compra()]), credor([]))).toBe(true);
  });

  it("bloqueia compra quitada que voltou para aberta", () => {
    const remoto = credor([compra({ id: "c1", pago: true, status: "QUITADO", valorPendente: 0 })]);
    const atualizado = credor([compra({ id: "c1", pago: false, status: "PENDENTE", valorPendente: 100 })]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(true);
  });

  it("bloqueia compra cancelada que voltou para pendente", () => {
    const remoto = credor([compra({ id: "c1", status: "CANCELADO", pago: false, valorPendente: 0 })]);
    const atualizado = credor([compra({ id: "c1", status: "PENDENTE", pago: false, valorPendente: 100 })]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(true);
  });

  it("permite editar campos de compra já quitada mantendo a quitação", () => {
    const liquidada = compra({ id: "c1", pago: true, status: "QUITADO", valorPendente: 0, descricao: "Antigo" });
    const remoto = credor([liquidada]);
    const atualizado = credor([{ ...liquidada, descricao: "Novo nome" }]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(false);
  });

  it("permite adicionar compra nova mantendo as existentes", () => {
    const remoto = credor([compra({ id: "c1", pago: true, status: "QUITADO" })]);
    const atualizado = credor([compra({ id: "c1", pago: true, status: "QUITADO" }), compra({ id: "c2" })]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(false);
  });

  it("permite avanço de pendente para quitada", () => {
    const remoto = credor([compra()]);
    const atualizado = credor([compra({ pago: true, status: "QUITADO", valorPendente: 0 })]);
    expect(divergenciaDeReversaoCredor(remoto, atualizado)).toBe(false);
  });

  it("não diverge quando nenhum tinha compras", () => {
    expect(divergenciaDeReversaoCredor(credor([]), credor([]))).toBe(false);
  });
});
