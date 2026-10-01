import { describe, it, expect, vi, afterEach } from "vitest";

const templatesCustom = vi.hoisted(() => [
  {
    id: "msg_recusa",
    gatilho: "recusa",
    ativo: true,
    titulo: "Pedido Recusado",
    texto: "RECUSA CUSTOM {numero_pedido}",
  },
  {
    id: "msg_confirmacao",
    gatilho: "confirmacao",
    ativo: false,
    titulo: "Pedido Confirmado",
    texto: "CONFIRMACAO PAUSADA",
  },
]);

vi.mock("@/lib/storeConfig", () => ({
  getStoreConfig: () => ({
    storePhone: "11930657871",
    storeName: "Ilma Doces",
    pixKey: "",
    chavePix: "chave-da-loja",
    whatsappLoja: "",
    paymentLink: "https://pay.example.com/pix123",
    mensagensWhatsapp: templatesCustom,
  }),
  DEFAULT_SETTINGS: {
    storePhone: "11930657871",
    storeName: "Ilma Doces",
    pixKey: "",
    chavePix: "",
    whatsappLoja: "",
    paymentLink: "",
    valorMinimoBrinde: 80,
    mensagensWhatsapp: [],
  },
}));

import {
  renderMensagem,
  resolverTexto,
  normalizarMensagensWhatsapp,
  mensagemPadrao,
  makeMensagemTemplate,
  GATILHOS,
  DEFAULT_MENSAGENS,
  TAGS_OBRIGATORIAS,
  tagsDoGatilho,
} from "@/lib/mensagensWhatsapp";
import { montarRecusaPedido, mensagemAtiva, enviarMensagemStatus } from "@/lib/whatsapp";
import type { Order } from "@/types/database";

function pedido(overrides?: Partial<Order>): Order {
  return {
    id: "abc1234567",
    customerName: "Maria",
    customerPhone: "11930657871",
    items: [{ product: { name: "Bolo de Chocolate", price: 50, isCustomWeight: false } as any, quantity: 1 }],
    total: 50,
    deliveryType: "retirada",
    paymentMethod: "pix",
    status: "confirmado",
    createdAt: "2026-09-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("renderMensagem", () => {
  it("substitui as tags pelos valores informados", () => {
    expect(
      renderMensagem("Ola {nome}, pedido {numero} no valor de {valor}", {
        nome: "Maria",
        numero: "1042",
        valor: "R$ 89,90",
      })
    ).toBe("Ola Maria, pedido 1042 no valor de R$ 89,90");
  });

  it("remove a linha de rotulo quando o valor da tag esta vazio", () => {
    const texto = "*📅 Data:* {data}\nRestante da mensagem";
    expect(renderMensagem(texto, { data: "" })).toBe("Restante da mensagem");
    expect(renderMensagem(texto, { data: "25/09/2026" })).toBe("*📅 Data:* 25/09/2026\nRestante da mensagem");
  });

  it("remove a linha quando ela contem apenas uma tag vazia", () => {
    expect(renderMensagem("Cabecalho\n{itens}\nFim", { itens: "" })).toBe("Cabecalho\nFim");
    expect(renderMensagem("Cabecalho\n{itens}\nFim", { itens: "1x Bolo" })).toBe("Cabecalho\n1x Bolo\nFim");
  });

  it("mantem linhas que terminam em dois-pontos quando ha conteudo antes da tag", () => {
    const linha = "Lembrete do seu pedido do dia {data}:";
    expect(renderMensagem(linha, { data: "25/09/2026" })).toBe("Lembrete do seu pedido do dia 25/09/2026:");
    expect(renderMensagem(linha, { data: "25/09/2026" })).toContain("25/09/2026");
  });

  it("colapsa linhas em branco duplicadas geradas por remocao", () => {
    expect(renderMensagem("A\n\n{vazio}\n\nB", { vazio: "" })).toBe("A\n\nB");
  });

  it("nao altera texto sem tags, preservando quebras em branco", () => {
    const texto = "Linha um\n\nLinha dois";
    expect(renderMensagem(texto, {})).toBe(texto);
  });

  it("mantem as tags desconhecidas literalmente", () => {
    expect(renderMensagem("Oi {inexistente}!", {})).toBe("Oi {inexistente}!");
  });

  it("descarta a linha de endereco vazio sem deixar rotulo orfao", () => {
    const texto = "*📍 Endereço:* {endereco}\n*💰 Total:* {valor}";
    expect(renderMensagem(texto, { endereco: "", valor: "R$ 10,00" })).toBe("*💰 Total:* R$ 10,00");
  });
});

describe("resolverTexto", () => {
  it("usa o texto customizado quando o template existe e tem conteudo", () => {
    expect(resolverTexto(templatesCustom as any, "recusa", { numero_pedido: "0042" })).toBe("RECUSA CUSTOM 0042");
  });

  it("cai no texto padrao quando nao ha templates", () => {
    const texto = resolverTexto(undefined, "cancelamento", {
      nome_cliente: "Maria",
      numero_pedido: "42",
      itens_pedido: "Bolo x1",
    });
    expect(texto).toContain("Seu pedido nº 42");
    expect(texto).toContain("foi cancelado");
  });

  it("cai no texto padrao quando o template esta vazio", () => {
    const texto = resolverTexto(
      [{ id: "x", gatilho: "cancelamento", ativo: true, titulo: "t", texto: "   " }] as any,
      "cancelamento",
      { nome_cliente: "Maria", numero_pedido: "42", itens_pedido: "Bolo x1" }
    );
    expect(texto).toContain("foi cancelado");
  });
});

describe("normalizarMensagensWhatsapp", () => {
  it("gera todos os gatilhos na ordem do registro quando ausente", () => {
    const result = normalizarMensagensWhatsapp(undefined);
    expect(result).toHaveLength(GATILHOS.length);
    expect(result.map((m) => m.gatilho)).toEqual(GATILHOS.map((g) => g.gatilho));
    expect(result.every((m) => m.ativo)).toBe(true);
    expect(result.every((m) => m.texto.trim().length > 0)).toBe(true);
  });

  it("mantem as personalizacoes e completa os gatilhos faltantes", () => {
    const result = normalizarMensagensWhatsapp([
      { id: "custom", gatilho: "pronto", ativo: false, titulo: "Velho", texto: "PERSONALIZADO" },
    ]);
    const pronto = result.find((m) => m.gatilho === "pronto");
    expect(pronto?.texto).toBe("PERSONALIZADO");
    expect(pronto?.ativo).toBe(false);
    expect(pronto?.titulo).toBe("Pedido Pronto");
    const cancelamento = result.find((m) => m.gatilho === "cancelamento");
    expect(cancelamento?.texto).toBe(mensagemPadrao("cancelamento"));
    expect(result).toHaveLength(GATILHOS.length);
  });

  it("restaura o padrao quando o texto salvo esta vazio", () => {
    const result = normalizarMensagensWhatsapp([
      { gatilho: "recusa", ativo: true, titulo: "x", texto: "  " },
    ]);
    expect(result.find((m) => m.gatilho === "recusa")?.texto).toBe(mensagemPadrao("recusa"));
  });

  it("ignora entradas invalidas e entradas de gatilho desconhecido", () => {
    const result = normalizarMensagensWhatsapp([null, "lixo", { gatilho: "inexistente", texto: "x" }] as any);
    expect(result).toHaveLength(GATILHOS.length);
    expect(result.every((m) => GATILHOS.some((g) => g.gatilho === m.gatilho))).toBe(true);
  });
});

describe("registro de gatilhos e tags", () => {
  it("possui ids unicos e cobre todos os gatilhos", () => {
    const ids = DEFAULT_MENSAGENS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_MENSAGENS.map((m) => m.gatilho)).toEqual(GATILHOS.map((g) => g.gatilho));
  });

  it("todos os textos padrao usam {nome_cliente}", () => {
    for (const g of GATILHOS) {
      expect(mensagemPadrao(g.gatilho)).toContain("{nome_cliente}");
    }
  });

  it("expoe as tags obrigatorias do enunciado", () => {
    expect(TAGS_OBRIGATORIAS).toEqual([
      "{nome_cliente}",
      "{numero_pedido}",
      "{valor_total}",
      "{horario_agendamento}",
      "{itens_pedido}",
      "{chave_pix}",
      "{link_pagamento}",
    ]);
  });

  it("inclui as tags obrigatorias em qualquer gatilho", () => {
    for (const g of GATILHOS) {
      const tags = tagsDoGatilho(g.gatilho);
      for (const obrig of TAGS_OBRIGATORIAS) {
        expect(tags).toContain(obrig);
      }
    }
  });

  it("makeMensagemTemplate gera template com padrao e ativo", () => {
    const tpl = makeMensagemTemplate("concluido", "Pedido Concluído");
    expect(tpl.id).toBe("msg_concluido");
    expect(tpl.ativo).toBe(true);
    expect(tpl.texto).toBe(mensagemPadrao("concluido"));
  });
});

describe("integracao com lib/whatsapp", () => {
  it("montarRecusaPedido usa o texto customizado salvo", () => {
    const msg = montarRecusaPedido({
      customerName: "Maria",
      numeroPedido: "0042",
      items: [{ product: { name: "Bolo", price: 10, isCustomWeight: false } as any, quantity: 1 }],
    });
    expect(msg).toBe("RECUSA CUSTOM 0042");
  });

  it("mensagemAtiva respeita a flag ativo dos templates", () => {
    expect(mensagemAtiva("recusa")).toBe(true);
    expect(mensagemAtiva("confirmacao")).toBe(false);
    expect(mensagemAtiva("cancelamento")).toBe(true);
  });
});

describe("enviarMensagemStatus", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    openSpy?.mockRestore();
  });

  it("abre o WhatsApp com a mensagem quando o gatilho esta ativo", () => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const resultado = enviarMensagemStatus(pedido(), "recusa");
    expect(resultado).toBe("enviado");
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0][0]);
    expect(url).toContain("https://wa.me/5511930657871?text=");
    expect(decodeURIComponent(url)).toContain("RECUSA CUSTOM 234567");
  });

  it("nao envia quando o gatilho esta pausado", () => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const resultado = enviarMensagemStatus(pedido(), "confirmacao");
    expect(resultado).toBe("desativado");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("avisa quando o telefone do cliente e invalido", () => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const resultado = enviarMensagemStatus(pedido({ customerPhone: "123" }), "recusa");
    expect(resultado).toBe("sem_telefone");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
