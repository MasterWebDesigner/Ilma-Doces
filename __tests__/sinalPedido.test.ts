import { describe, it, expect } from "vitest";
import {
  exigeSinalPedido,
  valorSinalPedido,
  detalheSinalPedido,
  sinalRecebidoDoPedido,
  montarTransacaoSinal,
  localizarTransacaoSinal,
  orderRemaining,
  PERCENTUAL_SINAL,
} from "@/lib/faturamento";
import { renderMensagem, GATILHOS, mensagemPadrao } from "@/lib/mensagensWhatsapp";
import { getLocalDateStr } from "@/lib/utils";
import type { CartItem, FinancialTransaction, Order } from "@/types/database";

function item(opts?: { rapido?: boolean; brinde?: boolean; preco?: number }): CartItem {
  return {
    product: {
      name: opts?.rapido ? "Gelinho" : "Bolo de Chocolate",
      price: opts?.preco ?? 100,
      isCustomWeight: false,
      cardapioRapido: opts?.rapido,
    } as any,
    quantity: 1,
    is_brinde: opts?.brinde,
  } as CartItem;
}

function pedido(overrides?: Partial<Order>): Order {
  return {
    id: "ord-teste",
    customerName: "Maria",
    customerPhone: "11930657871",
    items: [item()],
    total: 100,
    deliveryType: "retirada",
    paymentMethod: "pix",
    status: "pendente",
    createdAt: "2026-09-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("exigeSinalPedido", () => {
  it("exige sinal quando o carrinho tem itens normais", () => {
    expect(exigeSinalPedido([item(), item({ rapido: true })])).toBe(true);
  });

  it("nao exige sinal quando todos os itens sao do cardapio rapido", () => {
    expect(exigeSinalPedido([item({ rapido: true }), item({ rapido: true })])).toBe(false);
  });

  it("ignora brindes na regra de sinal", () => {
    expect(exigeSinalPedido([item({ brinde: true })])).toBe(false);
    expect(exigeSinalPedido([item({ brinde: true }), item({ rapido: true })])).toBe(false);
    expect(exigeSinalPedido([item({ brinde: true }), item()])).toBe(true);
  });

  it("nao exige sinal para carrinho vazio", () => {
    expect(exigeSinalPedido([])).toBe(false);
  });
});

describe("valorSinalPedido", () => {
  it("calcula exatamente 50% do total", () => {
    expect(PERCENTUAL_SINAL).toBe(0.5);
    expect(valorSinalPedido(100)).toBe(50);
    expect(valorSinalPedido(80)).toBe(40);
    expect(valorSinalPedido(1.1)).toBe(0.55);
    expect(valorSinalPedido(0)).toBe(0);
  });

  it("nao estoura o total por causa do arredondamento", () => {
    const total = 33.33;
    expect(valorSinalPedido(total) * 2).toBeLessThanOrEqual(total + 0.02);
  });

  it("trata total invalido como zero", () => {
    expect(valorSinalPedido(NaN)).toBe(0);
    expect(valorSinalPedido(undefined as unknown as number)).toBe(0);
  });
});

describe("detalheSinalPedido", () => {
  it("deriva a regra dos itens em pedidos antigos sem campos salvos", () => {
    const detalhe = detalheSinalPedido(pedido());
    expect(detalhe).toEqual({ exigido: true, valor: 50, pago: false, recebido: 0 });
  });

  it("nao exige sinal em pedido 100% de cardapio rapido sem campos salvos", () => {
    const detalhe = detalheSinalPedido(pedido({ items: [item({ rapido: true })] }));
    expect(detalhe).toEqual({ exigido: false, valor: 0, pago: false, recebido: 0 });
  });

  it("usa os campos salvos quando existem", () => {
    const detalhe = detalheSinalPedido(
      pedido({ sinalExigido: false, valorSinal: 0, items: [item()] })
    );
    expect(detalhe.exigido).toBe(false);
    expect(detalhe.valor).toBe(0);
  });

  it("considera pago quando sinalPago esta marcado", () => {
    expect(detalheSinalPedido(pedido({ sinalPago: true })).pago).toBe(true);
  });

  it("considera pago quando ja ha valorPagoSinal registrado", () => {
    expect(detalheSinalPedido(pedido({ valorPagoSinal: 30 })).pago).toBe(true);
    expect(detalheSinalPedido(pedido({ valorPagoSinal: 0 })).pago).toBe(false);
  });

  it("respeita valorSinal explicito", () => {
    const detalhe = detalheSinalPedido(pedido({ valorSinal: 45.5 }));
    expect(detalhe.valor).toBe(45.5);
  });
});

describe("sinalRecebidoDoPedido", () => {
  it("usa valorPagoSinal quando informado (dado legado)", () => {
    expect(sinalRecebidoDoPedido(pedido({ valorPagoSinal: 30 }))).toBe(30);
  });

  it("usa valorSinalPago (campo novo) quando valorPagoSinal ausente", () => {
    const p: Order = { ...pedido(), valorSinalPago: 45 };
    expect(sinalRecebidoDoPedido(p)).toBe(45);
  });

  it("usa valorSinal quando marcado como pago sem valor explicito", () => {
    expect(sinalRecebidoDoPedido(pedido({ sinalPago: true, valorSinal: 50 }))).toBe(50);
  });

  it("retorna zero quando nada foi recebido", () => {
    expect(sinalRecebidoDoPedido(pedido())).toBe(0);
    expect(sinalRecebidoDoPedido(pedido({ sinalPago: false }))).toBe(0);
  });
});

describe("orderRemaining (saldo previsto)", () => {
  it("desconta a entrada recebida do restante", () => {
    expect(orderRemaining(pedido({ valorPagoSinal: 50 }))).toBe(50);
    expect(orderRemaining(pedido({ valorSinalPago: 40 }))).toBe(60);
  });

  it("mantem o total previsto quando nada foi recebido", () => {
    expect(orderRemaining(pedido())).toBe(100);
  });

  it("zera o previsto quando o pedido ja foi pago", () => {
    expect(orderRemaining(pedido({ status: "concluido", dataPagamento: "2026-09-30" }))).toBe(0);
  });
});

function transacao(overrides?: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: "fin-1",
    tipo: "RECEITA",
    categoria: "Sinal de Encomenda",
    valor: 50,
    formaPagamento: "PIX",
    descricao: "Sinal do Pedido #0001 — Maria",
    data: "2026-09-30",
    createdAt: "2026-09-30T10:00:00.000Z",
    pedidoId: "ord-teste",
    ...overrides,
  };
}

describe("montarTransacaoSinal", () => {
  it("gera receita de hoje via PIX vinculada ao pedido", () => {
    const tx = montarTransacaoSinal(pedido({ orderNumber: "0001" }), 47.5, "pix");
    expect(tx).toMatchObject({
      tipo: "RECEITA",
      categoria: "Sinal de Encomenda",
      valor: 47.5,
      formaPagamento: "PIX",
      data: getLocalDateStr(),
      pedidoId: "ord-teste",
    });
    expect(tx.descricao).toContain("#0001");
  });

  it("usa PIX como forma padrao", () => {
    expect(montarTransacaoSinal(pedido(), 10).formaPagamento).toBe("PIX");
  });
});

describe("localizarTransacaoSinal", () => {
  it("encontra a transacao pelo pedidoId", () => {
    const alvo = transacao({ id: "fin-2" });
    const outra = transacao({ id: "fin-outro", pedidoId: "outro-pedido" });
    expect(localizarTransacaoSinal([outra, alvo], pedido())?.id).toBe("fin-2");
  });

  it("encontra transacao legada pelo numero na descricao", () => {
    const legada = transacao({
      id: "fin-legado",
      pedidoId: undefined,
      descricao: "Sinal de Produção (Pedido #0001) — Maria",
    });
    expect(localizarTransacaoSinal([legada], pedido({ orderNumber: "0001" }))?.id).toBe("fin-legado");
  });

  it("ignora transacoes de outra categoria", () => {
    expect(localizarTransacaoSinal([transacao({ categoria: "Vendas / Pedidos" })], pedido())).toBeUndefined();
  });

  it("retorna undefined sem correspondencia", () => {
    expect(localizarTransacaoSinal([], pedido())).toBeUndefined();
  });
});

describe("mensagem de entrada (novo_pedido)", () => {
  const gatilho = GATILHOS.find((g) => g.gatilho === "novo_pedido")!;
  const template = mensagemPadrao("novo_pedido");

  it("declara a tag {entrada_50} nos metadados do gatilho", () => {
    expect(gatilho.tags).toContain("{entrada_50}");
  });

  it("inclui a linha de entrada no template padrao", () => {
    expect(template).toContain("*⚠️ Entrada de 50%:* {entrada_50}");
  });

  it("exibe a linha de entrada quando ha valor", () => {
    const texto = renderMensagem(template, { entrada_50: "R$ 50,00" });
    expect(texto).toContain("*⚠️ Entrada de 50%:* R$ 50,00");
  });

  it("remove a linha de entrada quando o pedido nao exige sinal", () => {
    const texto = renderMensagem(template, { entrada_50: "" });
    expect(texto).not.toContain("Entrada de 50%");
  });
});
