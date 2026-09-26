import { describe, it, expect } from "vitest";
import {
  apenasDigitos,
  mascaraTelefone,
  higienizarTelefone,
  formatarTelefone,
  estadoTelefone,
  MENSAGEM_WHATSAPP_INVALIDO,
} from "@/lib/phone";

describe("MENSAGEM_WHATSAPP_INVALIDO", () => {
  it("possui o texto exigido", () => {
    expect(MENSAGEM_WHATSAPP_INVALIDO).toBe(
      "Insira um número de WhatsApp válido com DDD (ex: 11 99999-9999)"
    );
  });
});

describe("apenasDigitos", () => {
  it("remove tudo que nao for digito", () => {
    expect(apenasDigitos("(11) 94033-4360")).toBe("11940334360");
    expect(apenasDigitos("abc-")).toBe("");
    expect(apenasDigitos("")).toBe("");
  });
});

describe("mascaraTelefone", () => {
  it("formata progressivamente", () => {
    expect(mascaraTelefone("")).toBe("");
    expect(mascaraTelefone("1")).toBe("(1");
    expect(mascaraTelefone("11")).toBe("(11) ");
    expect(mascaraTelefone("119")).toBe("(11) 9");
    expect(mascaraTelefone("11940")).toBe("(11) 940");
    expect(mascaraTelefone("1194033")).toBe("(11) 94033");
    expect(mascaraTelefone("1194033436")).toBe("(11) 94033-436");
    expect(mascaraTelefone("11940334360")).toBe("(11) 94033-4360");
  });

  it("ignora caracteres nao numericos", () => {
    expect(mascaraTelefone("(11) 94033-4360")).toBe("(11) 94033-4360");
    expect(mascaraTelefone("abc11d94033e4360")).toBe("(11) 94033-4360");
  });

  it("limita a 11 digitos", () => {
    expect(mascaraTelefone("1194033436099")).toBe("(11) 94033-4360");
  });

  it("remove zero inicial quando o valor colado tem mais de 11 digitos", () => {
    expect(mascaraTelefone("011940334360")).toBe("(11) 94033-4360");
  });
});

describe("higienizarTelefone", () => {
  it("mantem 11 digitos validos", () => {
    expect(higienizarTelefone("11940334360")).toBe("11940334360");
    expect(higienizarTelefone("(11) 94033-4360")).toBe("11940334360");
  });

  it("prefixa DDD 11 quando digitados apenas 9 digitos", () => {
    expect(higienizarTelefone("940334360")).toBe("11940334360");
    expect(higienizarTelefone("(94) 033-4360")).toBe("11940334360");
  });

  it("remove zero inicial (12 digitos)", () => {
    expect(higienizarTelefone("011940334360")).toBe("11940334360");
  });

  it("rejeita valores invalidos", () => {
    expect(higienizarTelefone("")).toBeNull();
    expect(higienizarTelefone("1194033436")).toBeNull();
    expect(higienizarTelefone("119403343601")).toBeNull();
    expect(higienizarTelefone("abc")).toBeNull();
    expect(higienizarTelefone("00000000000")).toBeNull();
  });
});

describe("formatarTelefone", () => {
  it("formata 11 digitos no padrao (XX) XXXXX-XXXX", () => {
    expect(formatarTelefone("11940334360")).toBe("(11) 94033-4360");
    expect(formatarTelefone("(11) 94033-4360")).toBe("(11) 94033-4360");
  });

  it("formata 10 digitos no padrao (XX) XXXX-XXXX", () => {
    expect(formatarTelefone("1133434360")).toBe("(11) 3343-4360");
  });

  it("retorna o valor original quando nao ha padrao", () => {
    expect(formatarTelefone("123")).toBe("123");
    expect(formatarTelefone("")).toBe("");
  });
});

describe("estadoTelefone", () => {
  it("completa o DDD automaticamente com 9 digitos", () => {
    expect(estadoTelefone("940334360")).toEqual({
      valor: "(11) 94033-4360",
      erro: "",
    });
  });

  it("aceita 11 digitos validos sem erro", () => {
    expect(estadoTelefone("11940334360")).toEqual({
      valor: "(11) 94033-4360",
      erro: "",
    });
    expect(estadoTelefone("(11) 94033-4360")).toEqual({
      valor: "(11) 94033-4360",
      erro: "",
    });
  });

  it("remove zero inicial de colagem (12 digitos)", () => {
    expect(estadoTelefone("011940334360")).toEqual({
      valor: "(11) 94033-4360",
      erro: "",
    });
  });

  it("sinaliza erro para numero incompleto ou invalido", () => {
    expect(estadoTelefone("1194033436").erro).toBe(MENSAGEM_WHATSAPP_INVALIDO);
    expect(estadoTelefone("940334").erro).toBe(MENSAGEM_WHATSAPP_INVALIDO);
    expect(estadoTelefone("abc").erro).toBe(MENSAGEM_WHATSAPP_INVALIDO);
    expect(estadoTelefone("1194033436").valor).toBe("(11) 94033-436");
  });

  it("campo vazio nao gera erro no blur", () => {
    expect(estadoTelefone("")).toEqual({ valor: "", erro: "" });
    expect(estadoTelefone("   ")).toEqual({ valor: "", erro: "" });
  });
});
