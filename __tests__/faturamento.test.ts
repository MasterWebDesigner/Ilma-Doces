import { describe, it, expect } from "vitest";
import {
  getPaidDate,
  isOrderPaid,
  isPaidInPeriod,
  orderRemaining,
  sumReceitasByDate,
  filterPaidOrders,
  filterUnpaidOrders,
  isFiadoPendente,
  saldoPendenteDoPedido,
  formaPagamentoDoPedido,
} from "@/lib/faturamento";
import type { Order, FinancialTransaction, Credor, CompraCredor } from "@/types/database";

function makeOrder(partial: Partial<Order>): Order {
  return {
    id: "ord-1",
    customerName: "Ana",
    customerPhone: "11999999999",
    items: [],
    total: 100,
    deliveryType: "retirada",
    paymentMethod: "pix",
    status: "pendente",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...partial,
  } as Order;
}

function makeTx(partial: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: "fin-1",
    tipo: "RECEITA",
    categoria: "Vendas / Pedidos",
    valor: 100,
    formaPagamento: "PIX",
    descricao: "Pedido",
    data: "2026-09-05",
    createdAt: "2026-09-05T12:00:00.000Z",
    ...partial,
  } as FinancialTransaction;
}

describe("getPaidDate", () => {
  it("uses dataPagamento when set", () => {
    const o = makeOrder({ dataPagamento: "2026-09-05", status: "concluido" });
    expect(getPaidDate(o)).toBe("2026-09-05");
  });

  it("returns null for unpaid fiado even if concluido", () => {
    const o = makeOrder({ status: "concluido", isFiado: true });
    expect(getPaidDate(o)).toBeNull();
  });

  it("falls back to createdAt for concluded non-fiado", () => {
    const o = makeOrder({ status: "concluido", isFiado: false });
    expect(getPaidDate(o)).toBe("2026-09-01");
  });

  it("returns null for open order without dataPagamento", () => {
    const o = makeOrder({ status: "pendente" });
    expect(getPaidDate(o)).toBeNull();
  });
});

describe("isOrderPaid / isPaidInPeriod", () => {
  it("paid when dataPagamento matches period prefix", () => {
    const o = makeOrder({ dataPagamento: "2026-09-05", status: "concluido" });
    expect(isOrderPaid(o)).toBe(true);
    expect(isPaidInPeriod(o, "2026-09")).toBe(true);
    expect(isPaidInPeriod(o, "2026-08")).toBe(false);
  });

  it("created day 01 paid day 05 is paid only on day 05", () => {
    const o = makeOrder({
      createdAt: "2026-09-01T10:00:00.000Z",
      dataPagamento: "2026-09-05",
      status: "concluido",
    });
    expect(isPaidInPeriod(o, "2026-09-01")).toBe(false);
    expect(isPaidInPeriod(o, "2026-09-05")).toBe(true);
  });
});

describe("orderRemaining", () => {
  it("is zero when paid", () => {
    const o = makeOrder({ total: 100, dataPagamento: "2026-09-05", status: "concluido" });
    expect(orderRemaining(o)).toBe(0);
  });

  it("subtracts sinal when unpaid", () => {
    const o = makeOrder({ total: 100, valorPagoSinal: 40, status: "em_producao" });
    expect(orderRemaining(o)).toBe(60);
  });
});

describe("sumReceitasByDate", () => {
  it("sums RECEITA matching date prefix", () => {
    const txs = [
      makeTx({ id: "1", valor: 50, data: "2026-09-05" }),
      makeTx({ id: "2", valor: 30, data: "2026-09-05" }),
      makeTx({ id: "3", valor: 99, data: "2026-08-01" }),
      makeTx({ id: "4", tipo: "DESPESA", valor: 10, data: "2026-09-05" }),
    ];
    expect(sumReceitasByDate(txs, "2026-09-05")).toBe(80);
    expect(sumReceitasByDate(txs, "2026-09")).toBe(80);
  });

  it("returns 0 when none match", () => {
    expect(sumReceitasByDate([], "2026-09-05")).toBe(0);
  });
});

describe("filterPaidOrders / filterUnpaidOrders", () => {
  const orders = [
    makeOrder({ id: "a", createdAt: "2026-09-01T10:00:00.000Z", dataPagamento: "2026-09-05", status: "concluido" }),
    makeOrder({ id: "b", createdAt: "2026-09-01T11:00:00.000Z", status: "pendente" }),
    makeOrder({ id: "c", createdAt: "2026-09-05T09:00:00.000Z", status: "concluido" }),
  ];

  it("paid orders match by payment date not creation", () => {
    const paid05 = filterPaidOrders(orders, "2026-09-05").map((o) => o.id);
    expect(paid05).toEqual(["a", "c"]);
    const paid01 = filterPaidOrders(orders, "2026-09-01").map((o) => o.id);
    expect(paid01).toEqual([]);
  });

  it("unpaid orders match by creation date", () => {
    const unpaid01 = filterUnpaidOrders(orders, "2026-09-01").map((o) => o.id);
    expect(unpaid01).toEqual(["b"]);
  });

  it("ignora pedidos recusados e cancelados", () => {
    const lista = [
      makeOrder({ id: "r", createdAt: "2026-09-01T10:00:00.000Z", status: "recusado" }),
      makeOrder({ id: "x", createdAt: "2026-09-01T11:00:00.000Z", status: "cancelado" }),
      makeOrder({ id: "b", createdAt: "2026-09-01T12:00:00.000Z", status: "pendente" }),
    ];
    expect(filterUnpaidOrders(lista, "2026-09-01").map((o) => o.id)).toEqual(["b"]);
  });
});

function makeCredor(compras: Array<Partial<CompraCredor>>): Credor[] {
  return [
    {
      id: "cr1",
      clienteId: "cli1",
      nome: "Maria",
      whatsapp: "11999999999",
      compras: compras.map((c, i) => ({
        id: `comp-${i}`,
        origem: "pedido",
        descricao: "Bolo",
        valor: 100,
        valorPendente: 100,
        status: "PENDENTE",
        data: "2026-09-01",
        pago: false,
        ...c,
      })) as CompraCredor[],
      pagamentos: [],
    },
  ];
}

describe("saldoPendenteDoPedido / isFiadoPendente", () => {
  it("usa o saldo real do credor vinculado ao pedido", () => {
    const o = makeOrder({ id: "ord-1", status: "concluido", isFiado: true, dataPagamento: "2026-09-10" });
    const credores = makeCredor([{ referenciaId: "ord-1", valor: 100, valorPendente: 60, pago: false }]);
    expect(saldoPendenteDoPedido(o, credores)).toBe(60);
    expect(isFiadoPendente(o, credores)).toBe(true);
  });

  it("nao considera a receber quando o credor esta quitado", () => {
    const o = makeOrder({ id: "ord-1", status: "concluido", isFiado: true, dataPagamento: "2026-09-10" });
    const credores = makeCredor([{ referenciaId: "ord-1", valor: 100, valorPendente: 0, pago: true, status: "QUITADO" }]);
    expect(saldoPendenteDoPedido(o, credores)).toBe(0);
    expect(isFiadoPendente(o, credores)).toBe(false);
  });

  it("ignora compras de outros pedidos e compras canceladas", () => {
    const o = makeOrder({ id: "ord-1", status: "concluido", isFiado: true });
    const credores = makeCredor([
      { referenciaId: "ord-OUTRO", valorPendente: 999 },
      { referenciaId: "ord-1", status: "CANCELADO", valorPendente: 500 },
    ]);
    expect(saldoPendenteDoPedido(o, credores)).toBe(0);
    expect(isFiadoPendente(o, credores)).toBe(false);
  });

  it("sem credor vinculado cai no restante do pedido (fiado parcial com sinal)", () => {
    const o = makeOrder({ status: "concluido", isFiado: true, total: 100, valorPagoSinal: 40 });
    expect(saldoPendenteDoPedido(o, [])).toBe(60);
    expect(isFiadoPendente(o, [])).toBe(true);
  });

  it("pedido fiado totalmente quitado sem credor nao fica a receber", () => {
    const o = makeOrder({ status: "concluido", isFiado: true, total: 100, dataPagamento: "2026-09-20" });
    expect(isFiadoPendente(o, [])).toBe(false);
  });

  it("pedidos recusados e cancelados nunca ficam a receber", () => {
    const credores = makeCredor([{ referenciaId: "ord-1", valorPendente: 80 }]);
    expect(isFiadoPendente(makeOrder({ id: "ord-1", status: "recusado", isFiado: true }), credores)).toBe(false);
    expect(isFiadoPendente(makeOrder({ id: "ord-1", status: "cancelado", isFiado: true }), credores)).toBe(false);
    expect(saldoPendenteDoPedido(makeOrder({ id: "ord-1", status: "cancelado" }), credores)).toBe(0);
  });

  it("nao fiado com saldo em aberto nao e marcado como fiado pendente", () => {
    const credores = makeCredor([{ referenciaId: "ord-1", valorPendente: 80 }]);
    const o = makeOrder({ id: "ord-1", status: "concluido", isFiado: false, paymentMethod: "pix" });
    expect(isFiadoPendente(o, credores)).toBe(false);
    expect(saldoPendenteDoPedido(o, credores)).toBe(80);
  });

  it("formaPagamentoDoPedido reflete fiado pendente e metodo real quando quitado", () => {
    const aberto = makeOrder({ status: "concluido", isFiado: true, paymentMethod: "pix", total: 100 });
    expect(formaPagamentoDoPedido(aberto, [])).toBe("Fiado");
    const quitado = makeOrder({ status: "concluido", isFiado: true, paymentMethod: "pix", total: 100, dataPagamento: "2026-09-20" });
    expect(formaPagamentoDoPedido(quitado, [])).toBe("PIX");
  });
});
