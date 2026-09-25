import { describe, it, expect } from "vitest";
import {
  getPaidDate,
  isOrderPaid,
  isPaidInPeriod,
  orderRemaining,
  sumReceitasByDate,
  filterPaidOrders,
  filterUnpaidOrders,
} from "@/lib/faturamento";
import type { Order, FinancialTransaction } from "@/types/database";

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
});
