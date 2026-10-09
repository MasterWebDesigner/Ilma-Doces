import { describe, expect, it } from "vitest";
import { cidadeDoEndereco, crc16Pix, montarPixPayload, normalizarChavePix, normalizarTextoPix } from "@/lib/pix";

describe("normalizarChavePix", () => {
  it("prefixa o DDI 55 em telefone celular BR de 11 digitos", () => {
    expect(normalizarChavePix("11940334360")).toBe("5511940334360");
    expect(normalizarChavePix("11 94033-4360")).toBe("5511940334360");
  });

  it("nao mexe em chave com DDI, CPF, e-mail, chave aleatoria ou vazia", () => {
    expect(normalizarChavePix("5511940334360")).toBe("5511940334360");
    expect(normalizarChavePix("12345678901")).toBe("12345678901");
    expect(normalizarChavePix("loja@email.com")).toBe("loja@email.com");
    expect(normalizarChavePix("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(
      "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
    );
    expect(normalizarChavePix("")).toBe("");
  });
});

describe("crc16Pix", () => {
  it("confere com o check value oficial do CRC-16/CCITT-FALSE", () => {
    expect(crc16Pix("123456789")).toBe("29B1");
  });
});

describe("normalizarTextoPix", () => {
  it("remove acentos e caracteres invalidos, maiusculas e colapsa espacos", () => {
    expect(normalizarTextoPix("São Paulo", 15)).toBe("SAO PAULO");
    expect(normalizarTextoPix("Confeitaria & Cia. Ltda", 25)).toBe("CONFEITARIA CIA LTDA");
  });

  it("respeita o limite de caracteres", () => {
    expect(normalizarTextoPix("Nome Muito Longo Demais Para Caber", 25)).toHaveLength(25);
  });
});

describe("cidadeDoEndereco", () => {
  it("extrai a cidade de um endereco com UF e CEP", () => {
    expect(cidadeDoEndereco("Rua das Flores, 123 - Centro, Sao Paulo, SP - CEP 01234-567")).toBe(
      "Sao Paulo"
    );
  });

  it("extrai a cidade sem CEP", () => {
    expect(cidadeDoEndereco("Av. Brasil, 500 - Rio de Janeiro, RJ")).toBe("Rio de Janeiro");
  });

  it("retorna vazio quando nao encontra cidade", () => {
    expect(cidadeDoEndereco("")).toBe("");
    expect(cidadeDoEndereco("Sem Numero")).toBe("");
  });
});

describe("montarPixPayload", () => {
  const dados = {
    chave: "11930657871",
    nome: "Ilma Doces",
    cidade: "Sao Paulo",
    valor: 9.99,
    txid: "VENDA01",
  };

  it("gera payload EMV valido com valor, chave e CRC consistente", () => {
    const p = montarPixPayload(dados);
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("0014BR.GOV.BCB.PIX");
    expect(p).toContain("11930657871");
    expect(p).toContain("54049.99");
    expect(p).toContain("5303986");
    expect(p).toContain("5802BR");
    expect(p).toContain("ILMA DOCES");
    expect(p).toContain("SAO PAULO");
    expect(p).toContain("VENDA01");
    expect(crc16Pix(p.slice(0, -4))).toBe(p.slice(-4));
  });

  it("normaliza o valor para formato com ponto e duas casas", () => {
    const p = montarPixPayload({ ...dados, valor: 1234.5 });
    expect(p).toContain("54071234.50");
  });

  it("usa txid sanitizado e *** quando vazio", () => {
    expect(montarPixPayload({ ...dados, txid: "venda 01!" })).toContain("VENDA01");
    expect(montarPixPayload({ ...dados, txid: "" })).toContain("0503***");
  });

  it("cai na cidade padrao quando endereco nao informa", () => {
    expect(montarPixPayload({ ...dados, cidade: "" })).toContain("SAO PAULO");
  });

  it("retorna vazio sem chave ou com valor invalido", () => {
    expect(montarPixPayload({ ...dados, chave: "" })).toBe("");
    expect(montarPixPayload({ ...dados, chave: "   " })).toBe("");
    expect(montarPixPayload({ ...dados, valor: 0 })).toBe("");
    expect(montarPixPayload({ ...dados, valor: -5 })).toBe("");
  });
});
