import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order, Customer, Credor, CartItem, Product } from "@/types/database";

const estado = vi.hoisted(() => ({
  config: {
    brindeAtivo: true,
    valorMinimoBrinde: 80,
    brindeCategoriaId: "",
    brindeTodasCategorias: true,
    brindeCategoriasPromo: [] as string[],
  },
}));

vi.mock("@/lib/storeConfig", () => ({
  getStoreConfig: () => estado.config,
  DEFAULT_SETTINGS: {
    valorMinimoBrinde: 80,
    brindeAtivo: true,
    brindeCategoriaId: "",
    brindeTodasCategorias: true,
    brindeCategoriasPromo: [],
  },
}));

import {
  loyaltyProgress,
  loyaltyProgressLabel,
  computeLoyaltyAutoTotal,
  computeLoyaltyBalance,
  getCustomerOffset,
  montarDocumentoFidelidade,
  paraFidelidadePublica,
  identidadesFidelidade,
  brindesDisponiveis,
  saldoAposResgate,
} from "@/lib/fidelidade";

function makeItem(price: number, categoryId = "cat-promo"): CartItem {
  return {
    product: {
      id: `p-${price}-${categoryId}`,
      name: "Item",
      price,
      category_id: categoryId,
    } as unknown as Product,
    quantity: 1,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  const base: Order = {
    id: "o1",
    customerName: "Maria",
    customerPhone: "11999998888",
    items: [],
    total: 100,
    deliveryType: "retirada",
    paymentMethod: "pix",
    status: "concluido",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  if (!overrides.items) {
    base.items = [makeItem(base.total)];
  }
  return base;
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "11999998888",
    name: "Maria",
    phone: "11999998888",
    totalOrders: 1,
    totalSpent: 100,
    lastOrderDate: "2026-01-01T00:00:00.000Z",
    status: "Ativa",
    ...overrides,
  };
}

describe("loyaltyProgress", () => {
  it("returns not eligible below meta", () => {
    const p = loyaltyProgress(40, 80);
    expect(p.eligible).toBe(false);
    expect(p.percent).toBe(50);
    expect(p.remaining).toBe(40);
  });

  it("returns eligible at 100%", () => {
    const p = loyaltyProgress(80, 80);
    expect(p.eligible).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it("caps percent at 100 above meta", () => {
    const p = loyaltyProgress(200, 80);
    expect(p.eligible).toBe(true);
    expect(p.percent).toBe(100);
  });
});

describe("loyaltyProgressLabel", () => {
  it("formats R$ X / R$ Y with percent", () => {
    expect(loyaltyProgressLabel(60, 80)).toContain("R$");
    expect(loyaltyProgressLabel(60, 80)).toContain("75%");
    expect(loyaltyProgressLabel(60, 80)).not.toContain("Pronto");
  });

  it("marks ready at 100%", () => {
    const label = loyaltyProgressLabel(80, 80);
    expect(label).toContain("100%");
    expect(label).toContain("Pronto p/ Brinde");
  });
});

describe("brindesDisponiveis", () => {
  it("calcula brindes disponiveis por meta", () => {
    expect(brindesDisponiveis(0, 100)).toBe(0);
    expect(brindesDisponiveis(99, 100)).toBe(0);
    expect(brindesDisponiveis(100, 100)).toBe(1);
    expect(brindesDisponiveis(250, 100)).toBe(2);
    expect(brindesDisponiveis(300, 100)).toBe(3);
  });

  it("usa a meta padrao quando nao informada", () => {
    expect(brindesDisponiveis(160)).toBe(2);
  });

  it("exemplo do produto: 322,50 com meta 100 = 3 brindes", () => {
    expect(brindesDisponiveis(322.5, 100)).toBe(3);
  });

  it("retorna 0 com meta invalida ou saldo negativo", () => {
    expect(brindesDisponiveis(500, 0)).toBe(0);
    expect(brindesDisponiveis(-10, 100)).toBe(0);
  });
});

describe("saldoAposResgate", () => {
  it("desconta apenas 1 meta do saldo (resgate parcial)", () => {
    expect(saldoAposResgate(322.5, 100)).toBe(222.5);
    expect(saldoAposResgate(300, 100)).toBe(200);
    expect(saldoAposResgate(105, 100)).toBe(5);
    expect(saldoAposResgate(100, 100)).toBe(0);
  });

  it("nunca fica negativo e zera com meta invalida", () => {
    expect(saldoAposResgate(50, 100)).toBe(0);
    expect(saldoAposResgate(500, 0)).toBe(0);
    expect(saldoAposResgate(-10, 100)).toBe(0);
  });

  it("cenario Dan: 3 brindes, resgatar 1, sobram 2", () => {
    const meta = 100;
    const saldo = 322.5;
    expect(brindesDisponiveis(saldo, meta)).toBe(3);
    const restante = saldoAposResgate(saldo, meta);
    expect(restante).toBe(222.5);
    expect(brindesDisponiveis(restante, meta)).toBe(2);
    const restante2 = saldoAposResgate(restante, meta);
    expect(brindesDisponiveis(restante2, meta)).toBe(1);
    expect(saldoAposResgate(restante2, meta)).toBe(22.5);
    expect(brindesDisponiveis(22.5, meta)).toBe(0);
  });
});

describe("computeLoyaltyAutoTotal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.config = {
      brindeAtivo: true,
      valorMinimoBrinde: 80,
      brindeCategoriaId: "",
      brindeTodasCategorias: true,
      brindeCategoriasPromo: [],
    };
  });

  it("sums only completed orders", () => {
    const orders = [
      makeOrder({ total: 50, status: "concluido" }),
      makeOrder({ id: "o2", total: 30, status: "pendente" }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", "Maria", orders, [])).toBe(50);
  });

  it("ignores other customers", () => {
    const orders = [
      makeOrder({ total: 50 }),
      makeOrder({ id: "o2", customerPhone: "11888887777", customerName: "Joao", total: 999 }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", undefined, orders, [])).toBe(50);
  });

  it("adds manual credor purchases", () => {
    const credores: Credor[] = [
      {
        id: "c1",
        clienteId: "1",
        nome: "Maria",
        whatsapp: "11999998888",
        compras: [
          { id: "k1", origem: "manual", descricao: "Bolo", valor: 40, data: "2026-01-02", pago: true },
          { id: "k2", origem: "pedido", descricao: "Vinculado", valor: 99, referenciaId: "ord-xyz", data: "2026-01-03", pago: true },
        ],
        pagamentos: [],
      },
    ];
    expect(computeLoyaltyAutoTotal("11999998888", undefined, [], credores)).toBe(40);
  });

  it("pedido misto soma apenas os itens da categoria permitida", () => {
    estado.config = {
      ...estado.config,
      brindeTodasCategorias: false,
      brindeCategoriasPromo: ["cat-gelados"],
    };
    const orders = [
      makeOrder({
        total: 120,
        items: [makeItem(70, "cat-bolo"), makeItem(50, "cat-gelados")],
      }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", "Maria", orders, [])).toBe(50);
  });

  it("pedido so de bolo nao acumula quando so a categoria de gelinhos vale", () => {
    estado.config = {
      ...estado.config,
      brindeTodasCategorias: false,
      brindeCategoriasPromo: ["cat-gelados"],
    };
    const orders = [
      makeOrder({ total: 200, items: [makeItem(200, "cat-bolo")] }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", "Maria", orders, [])).toBe(0);
  });

  it("com todas as categorias o total inteiro do pedido acumula", () => {
    const orders = [
      makeOrder({
        total: 120,
        items: [makeItem(70, "cat-bolo"), makeItem(50, "cat-gelados")],
      }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", "Maria", orders, [])).toBe(120);
  });

  it("itens de brinde nao contam no acumulado", () => {
    const orders = [
      makeOrder({
        total: 50,
        items: [makeItem(50, "cat-gelados"), { ...makeItem(80, "cat-gelados"), is_brinde: true, preco_unitario: 0 }],
      }),
    ];
    expect(computeLoyaltyAutoTotal("11999998888", "Maria", orders, [])).toBe(50);
  });
});

describe("computeLoyaltyBalance closed cycle", () => {
  it("balance = autoTotal - offset", () => {
    const orders = [makeOrder({ total: 100 })];
    const customers = [makeCustomer({ fidelidadeOffset: 20 })];
    const { balance, autoTotal, offset } = computeLoyaltyBalance(
      "11999998888",
      "Maria",
      orders,
      [],
      customers
    );
    expect(autoTotal).toBe(100);
    expect(offset).toBe(20);
    expect(balance).toBe(80);
  });

  it("offset total zera o saldo (zerar manual)", () => {
    const orders = [makeOrder({ total: 100 })];
    const customers = [makeCustomer({ fidelidadeOffset: 100 })];
    const { balance } = computeLoyaltyBalance("11999998888", "Maria", orders, [], customers);
    expect(balance).toBe(0);
  });

  it("new purchase after redeem accumulates again from 0", () => {
    const orders = [
      makeOrder({ id: "old", total: 100 }),
      makeOrder({ id: "new", total: 35 }),
    ];
    const customers = [makeCustomer({ fidelidadeOffset: 100 })];
    const { balance } = computeLoyaltyBalance("11999998888", "Maria", orders, [], customers);
    expect(balance).toBe(35);
  });

  it("never returns negative balance", () => {
    const orders: Order[] = [];
    const customers = [makeCustomer({ fidelidadeOffset: 50 })];
    const { balance } = computeLoyaltyBalance("11999998888", "Maria", orders, [], customers);
    expect(balance).toBe(0);
  });
});

describe("getCustomerOffset", () => {
  it("returns offset by clean phone", () => {
    expect(getCustomerOffset([makeCustomer({ fidelidadeOffset: 30 })], "11999998888")).toBe(30);
  });

  it("returns 0 when missing", () => {
    expect(getCustomerOffset([], "11999998888")).toBe(0);
  });
});

describe("montarDocumentoFidelidade", () => {
  it("guarda apenas saldo liquido e autoTotal", () => {
    const orders = [makeOrder({ total: 100 })];
    const customers = [makeCustomer({ fidelidadeOffset: 30 })];
    expect(montarDocumentoFidelidade("11999998888", "Maria", orders, [], customers)).toEqual({
      saldo: 70,
      autoTotal: 100,
    });
  });

  it("saldo totalmente zerado fica 0", () => {
    const orders = [makeOrder({ total: 100 })];
    const customers = [makeCustomer({ fidelidadeOffset: 100 })];
    expect(montarDocumentoFidelidade("11999998888", "Maria", orders, [], customers)).toEqual({
      saldo: 0,
      autoTotal: 100,
    });
  });
});

describe("paraFidelidadePublica", () => {
  it("reconstrói offset a partir do saldo", () => {
    expect(paraFidelidadePublica({ saldo: 70, autoTotal: 100 })).toEqual({
      autoTotal: 100,
      offset: 30,
      balance: 70,
    });
  });

  it("retorna zeros sem documento", () => {
    expect(paraFidelidadePublica(null)).toEqual({ autoTotal: 0, offset: 0, balance: 0 });
    expect(paraFidelidadePublica(undefined)).toEqual({ autoTotal: 0, offset: 0, balance: 0 });
    expect(paraFidelidadePublica({})).toEqual({ autoTotal: 0, offset: 0, balance: 0 });
  });

  it("nunca devolve saldo ou offset negativos", () => {
    expect(paraFidelidadePublica({ saldo: -10, autoTotal: NaN })).toEqual({
      autoTotal: 0,
      offset: 0,
      balance: 0,
    });
  });

  it("round trip com montarDocumentoFidelidade preserva o ciclo", () => {
    const orders = [makeOrder({ total: 100 })];
    const customers = [makeCustomer({ fidelidadeOffset: 25 })];
    const doc = montarDocumentoFidelidade("11999998888", "Maria", orders, [], customers);
    expect(paraFidelidadePublica(doc)).toEqual({ autoTotal: 100, offset: 25, balance: 75 });
  });
});

describe("identidadesFidelidade", () => {
  it("agrupa telefones de clientes, pedidos e credores sem repetir", () => {
    const mapa = identidadesFidelidade(
      [makeCustomer()],
      [makeOrder({ id: "o2", customerPhone: "11888887777", customerName: "Joao" })],
      [
        {
          id: "c1",
          clienteId: "2",
          nome: "Ana",
          whatsapp: "11 7777-6666",
          compras: [],
          pagamentos: [],
        },
      ]
    );
    expect([...mapa.keys()]).toEqual(["11999998888", "11888887777", "1177776666"]);
  });

  it("ignora telefones incompletos", () => {
    expect(identidadesFidelidade([makeCustomer({ phone: "123" })], [], []).size).toBe(0);
  });

  it("o nome do cadastro prevalece sobre o do pedido", () => {
    const mapa = identidadesFidelidade(
      [makeCustomer({ name: "Maria" })],
      [makeOrder({ customerName: "Maria Digitada" })],
      []
    );
    expect(mapa.get("11999998888")).toBe("Maria");
  });
});
