import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/storeConfig", () => ({
  getStoreConfig: () => ({
    storePhone: "11930657871",
    pixKey: "",
    chavePix: "",
    whatsappLoja: "",
  }),
  DEFAULT_SETTINGS: {
    storePhone: "11930657871",
    pixKey: "",
    chavePix: "",
    whatsappLoja: "",
    valorMinimoBrinde: 80,
  },
}));

import {
  montarCobrancaVencimento,
  montarCobrancaAtraso,
  montarAgradecimentoPagamento,
  listaItensCobranca,
  urlWaMe,
} from "@/lib/whatsapp";
import type { CompraItem } from "@/types/database";

const itens: CompraItem[] = [
  { descricao: "Bolo de festa", quantidade: 1, valorUnitario: 80 },
  { descricao: "Gelinho", quantidade: 3, valorUnitario: 5 },
];

describe("listaItensCobranca", () => {
  it("formata a lista com quantidade", () => {
    expect(listaItensCobranca(itens)).toBe("1x Bolo de festa, 3x Gelinho");
  });

  it("usa a quantidade embutida na descricao quando existir", () => {
    expect(listaItensCobranca([{ descricao: "2x Torta de frango", quantidade: 1, valorUnitario: 50 }])).toBe("2x Torta de frango");
  });

  it("cai para a descricao da compra quando nao ha itens", () => {
    expect(listaItensCobranca(undefined, "Bolo, Torta")).toBe("Bolo, Torta");
    expect(listaItensCobranca([], "Suco natural")).toBe("Suco natural");
  });
});

describe("montarCobrancaVencimento", () => {
  const msg = montarCobrancaVencimento({
    nome: "Maria",
    dataCompra: "2026-09-25",
    valor: 45.5,
    itens,
    chavePix: "chave@ilmadoces.com.br",
    whatsappLoja: "11930657871",
  });

  it("monta a mensagem no dia do vencimento", () => {
    expect(msg).toContain("Olá, Maria! Tudo bem? Passando para lembrar do seu pedido do dia 25/09/2026:");
    expect(msg).toContain("🛒 Itens: 1x Bolo de festa, 3x Gelinho");
    expect(msg).toContain("💰 Valor: R$ 45,50");
    expect(msg).toContain("Hoje é a data combinada para o pagamento!");
    expect(msg).toContain("Segue a nossa chave PIX: chave@ilmadoces.com.br.");
    expect(msg).toContain("Qualquer dúvida estou por aqui, muito obrigada!");
  });

  it("finaliza com o rodape automatico de cobranca", () => {
    expect(msg).toContain(
      "---\n🤖 Esta é uma mensagem automática de cobrança, favor não responder a este envio.\n📞 Em caso de dúvidas, entre em contato diretamente com a Ilma Doces pelo telefone: 11930657871."
    );
    expect(msg.endsWith("telefone: 11930657871.")).toBe(true);
  });

  it("formata o valor com virgula e dois decimais", () => {
    const comMil = montarCobrancaVencimento({
      nome: "Ana",
      dataCompra: "2026-09-25",
      valor: 1230.09,
      itens,
      chavePix: "1199999",
    });
    expect(comMil).toContain("💰 Valor: R$ 1230,09");
  });
});

describe("montarCobrancaAtraso", () => {
  const base = {
    nome: "João",
    dataCompra: "2026-09-20",
    dataPrometida: "2026-09-23",
    valor: 90,
    itens,
    chavePix: "pix-da-loja",
    whatsappLoja: "11930657871",
  };

  it("informa os dias em atraso (plural)", () => {
    const msg = montarCobrancaAtraso({ ...base, diasAtraso: 3 });
    expect(msg).toContain("Olá, João! Tudo bem? Notamos que o pagamento do seu pedido está em aberto:");
    expect(msg).toContain("📅 Data combinada: 23/09/2026 (3 dias em atraso)");
    expect(msg).toContain("🛒 Itens: 1x Bolo de festa, 3x Gelinho");
    expect(msg).toContain("💰 Valor: R$ 90,00");
    expect(msg).toContain("Segue a chave PIX para quitação: pix-da-loja.");
    expect(msg).not.toContain("renegociar");
  });

  it("finaliza com o rodape automatico de cobranca", () => {
    const msg = montarCobrancaAtraso({ ...base, diasAtraso: 2 });
    expect(msg).toContain(
      "---\n🤖 Esta é uma mensagem automática de cobrança, favor não responder a este envio.\n📞 Em caso de dúvidas, entre em contato diretamente com a Ilma Doces pelo telefone: 11930657871."
    );
    expect(msg.endsWith("telefone: 11930657871.")).toBe(true);
  });

  it("usa o singular quando ha apenas 1 dia", () => {
    const msg = montarCobrancaAtraso({ ...base, diasAtraso: 1 });
    expect(msg).toContain("(1 dia em atraso)");
  });
});

describe("montarAgradecimentoPagamento", () => {
  it("monta a mensagem de agradecimento com valor e itens", () => {
    const msg = montarAgradecimentoPagamento({
      nome: "Maria",
      valor: 45.5,
      itens,
    });
    expect(msg).toContain("Olá, Maria! Recebemos o seu pagamento de R$ 45,50 referente ao pedido (1x Bolo de festa, 3x Gelinho).");
    expect(msg).toContain("Muito obrigado pela preferência e pela parceria de sempre! Tenha um ótimo dia!");
  });

  it("usa a descricao da compra como fallback", () => {
    const msg = montarAgradecimentoPagamento({
      nome: "Ana",
      valor: 100,
      descricaoFallback: "2x Suco",
    });
    expect(msg).toContain("pedido (2x Suco)");
  });

  it("nao recebe o rodape automatico de cobranca", () => {
    const msg = montarAgradecimentoPagamento({ nome: "Ana", valor: 10, itens });
    expect(msg).not.toContain("mensagem automática de cobrança");
    expect(msg).not.toContain("---");
  });
});

describe("urlWaMe", () => {
  it("adiciona o codigo do Brasil quando ausente", () => {
    expect(urlWaMe("11 93065-7871", "oi")).toBe(`https://wa.me/5511930657871?text=${encodeURIComponent("oi")}`);
  });

  it("mantem o 55 quando ja presente", () => {
    expect(urlWaMe("+55 (11) 93065-7871", "oi")).toBe(`https://wa.me/5511930657871?text=${encodeURIComponent("oi")}`);
  });

  it("escapa a mensagem com acentos e emojis", () => {
    const url = urlWaMe("11930657871", "Olá, João! 🧁");
    expect(url).toContain("text=Ol%C3%A1%2C%20Jo%C3%A3o!%20%F0%9F%A7%81");
  });
});
