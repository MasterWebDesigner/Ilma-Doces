import { describe, it, expect } from "vitest";
import type { Product } from "@/types/database";
import {
  ajustarMixParaQuantidade,
  alterarQtdMix,
  criarMixVazio,
  ehCombo,
  formatarMix,
  formatarMixes,
  mixCompleto,
  parseSabores,
  resumoItemPedido,
  saboresDoCombo,
  todosCompletos,
  totalDoMix,
  validarCombo,
} from "@/lib/combo";

const SABORES = ["Brigadeiro", "Beijinho", "Ninho"];

function produtoCombo(): Product {
  return {
    id: "p1",
    category_id: "cat-1",
    name: "Docinhos Gourmet",
    description: null,
    price: 89.9,
    image_url: null,
    is_available: true,
    display_order: 1,
    brand: "",
    combo: { total: 50, sabores: SABORES },
  };
}

describe("combo: parseSabores", () => {
  it("separa por virgula e quebra de linha e ignora vazios", () => {
    expect(parseSabores("Brigadeiro, Beijinho\n\nNinho ,")).toEqual(["Brigadeiro", "Beijinho", "Ninho"]);
    expect(parseSabores("")).toEqual([]);
  });
});

describe("combo: criacao e totais", () => {
  it("cria mix zerado para todos os sabores", () => {
    expect(criarMixVazio(SABORES)).toEqual({ Brigadeiro: 0, Beijinho: 0, Ninho: 0 });
  });

  it("soma o total do mix ignorando valores invalidos", () => {
    expect(totalDoMix({ Brigadeiro: 5, Beijinho: 3, Ninho: 42 })).toBe(50);
    expect(totalDoMix({ Brigadeiro: NaN as unknown as number, Beijinho: 0, Ninho: 0 })).toBe(0);
  });

  it("mixCompleto so quando bate exatamente o total", () => {
    expect(mixCompleto({ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }, 50)).toBe(true);
    expect(mixCompleto({ Brigadeiro: 49, Beijinho: 0, Ninho: 0 }, 50)).toBe(false);
    expect(mixCompleto({ Brigadeiro: 51, Beijinho: 0, Ninho: 0 }, 50)).toBe(false);
  });

  it("todosCompletos exige mix nao vazio e todas as caixas completas", () => {
    const ok = [{ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }, { Brigadeiro: 0, Beijinho: 50, Ninho: 0 }];
    expect(todosCompletos(ok, 50)).toBe(true);
    expect(todosCompletos([], 50)).toBe(false);
    expect(todosCompletos([...ok, { Brigadeiro: 10, Beijinho: 0, Ninho: 0 }], 50)).toBe(false);
  });
});

describe("combo: alterarQtdMix", () => {
  it("incrementa e decrementa respeitando zero como minimo", () => {
    const mix = criarMixVazio(SABORES);
    expect(alterarQtdMix(mix, "Brigadeiro", -1, 50)).toEqual(mix);
    expect(alterarQtdMix(mix, "Brigadeiro", 5, 50).Brigadeiro).toBe(5);
  });

  it("nunca deixa a caixa passar do total", () => {
    const mix = { Brigadeiro: 40, Beijinho: 5, Ninho: 0 };
    const novo = alterarQtdMix(mix, "Brigadeiro", 10, 50);
    expect(novo.Brigadeiro).toBe(45);
    expect(totalDoMix(novo)).toBe(50);
    const jaCheia = { Brigadeiro: 45, Beijinho: 5, Ninho: 0 };
    expect(alterarQtdMix(jaCheia, "Brigadeiro", 1, 50).Brigadeiro).toBe(45);
  });
});

describe("combo: ajustarMixParaQuantidade", () => {
  it("corta caixas ao reduzir a quantidade", () => {
    const mixes = [{ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }, { Brigadeiro: 0, Beijinho: 50, Ninho: 0 }];
    expect(ajustarMixParaQuantidade(mixes, 1)).toHaveLength(1);
    expect(ajustarMixParaQuantidade(mixes, 0)).toEqual([]);
  });

  it("duplica a ultima caixa ao aumentar a quantidade", () => {
    const mixes = [{ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }];
    const ajustado = ajustarMixParaQuantidade(mixes, 3);
    expect(ajustado).toHaveLength(3);
    expect(ajustado[2]).toEqual({ Brigadeiro: 50, Beijinho: 0, Ninho: 0 });
    expect(ajustado[2]).not.toBe(ajustado[0]);
  });

  it("com mix vazio retorna caixas vazias", () => {
    const ajustado = ajustarMixParaQuantidade([], 2);
    expect(ajustado).toEqual([{}, {}]);
  });
});

describe("combo: validarCombo", () => {
  it("aceita configuracao valida", () => {
    expect(validarCombo(50, SABORES)).toBeNull();
  });

  it("recusa total invalido", () => {
    expect(validarCombo(0, SABORES)).toBeTruthy();
    expect(validarCombo(-5, SABORES)).toBeTruthy();
  });

  it("recusa menos de 2 sabores", () => {
    expect(validarCombo(50, ["Brigadeiro"])).toBeTruthy();
    expect(validarCombo(50, [])).toBeTruthy();
  });

  it("recusa sabores repetidos", () => {
    expect(validarCombo(50, ["Brigadeiro", "Brigadeiro", "Beijinho"])).toBeTruthy();
  });
});

describe("combo: formatacao", () => {
  it("formata um mix listando apenas sabores com quantidade", () => {
    expect(formatarMix({ Brigadeiro: 30, Beijinho: 20, Ninho: 0 })).toBe("30x Brigadeiro, 20x Beijinho");
    expect(formatarMix({ Brigadeiro: 0, Beijinho: 0, Ninho: 0 })).toBe("caixa vazia");
  });

  it("formata varias caixas com numeracao", () => {
    const mixes = [{ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }, { Brigadeiro: 0, Beijinho: 50, Ninho: 0 }];
    expect(formatarMixes(mixes)).toBe("Caixa 1: 50x Brigadeiro | Caixa 2: 50x Beijinho");
    expect(formatarMixes([])).toBe("");
  });
});

describe("combo: ehCombo", () => {
  it("reconhece produto combo valido", () => {
    expect(ehCombo(produtoCombo())).toBe(true);
  });

  it("produto sem combo ou incompleto nao e combo", () => {
    const semCombo = { ...produtoCombo(), combo: undefined };
    const vazio = { ...produtoCombo(), combo: { total: 0, sabores: [] } };
    expect(ehCombo(semCombo)).toBe(false);
    expect(ehCombo(vazio)).toBe(false);
  });

  it("combo com categoria e valido mesmo sem lista manual", () => {
    const porCategoria = { ...produtoCombo(), combo: { total: 50, sabores: [], categoriaId: "cat-9" } };
    expect(ehCombo(porCategoria)).toBe(true);
  });
});

describe("combo: saboresDoCombo", () => {
  const base: Product = { ...produtoCombo(), combo: undefined };
  const docinhos: Product[] = [
    { ...base, id: "d1", name: "Brigadeiro Gourmet", category_id: "cat-9" },
    { ...base, id: "d2", name: "Beijinho", category_id: "cat-9" },
    { ...base, id: "d3", name: "Ninho", category_id: "cat-9", ativo: false },
    { ...base, id: "d4", name: "Maracujá", category_id: "cat-9", is_available: false },
    { ...base, id: "d5", name: "Docinhos Gourmet", category_id: "cat-9", combo: { total: 50, sabores: [], categoriaId: "cat-9" } },
    { ...base, id: "d6", name: "Outro sabor", category_id: "cat-2" },
  ];

  it("deriva os sabores da categoria incluindo inativos (loja prepara sob demanda), exclui esgotados e combos", () => {
    expect(saboresDoCombo({ total: 50, sabores: [], categoriaId: "cat-9" }, docinhos)).toEqual([
      "Brigadeiro Gourmet",
      "Beijinho",
      "Ninho",
    ]);
  });

  it("usa a lista manual quando nao ha categoria", () => {
    expect(saboresDoCombo({ total: 50, sabores: SABORES }, docinhos)).toEqual(SABORES);
  });

  it("retorna vazio sem combo", () => {
    expect(saboresDoCombo(null, docinhos)).toEqual([]);
    expect(saboresDoCombo(undefined, docinhos)).toEqual([]);
  });
});

describe("combo: multiplo por sabor", () => {
  it("alterarQtdMix com passo soma e subtrai em blocos", () => {
    const mix = { Brigadeiro: 25, Beijinho: 25, Ninho: 0 };
    expect(alterarQtdMix(mix, "Ninho", 25, 50)).toEqual({ Brigadeiro: 25, Beijinho: 25, Ninho: 0 });
    expect(alterarQtdMix({ Brigadeiro: 50, Beijinho: 0, Ninho: 0 }, "Brigadeiro", -25, 50)).toEqual({
      Brigadeiro: 25,
      Beijinho: 0,
      Ninho: 0,
    });
  });

  it("permite 50 do mesmo sabor quando o passo divide o total", () => {
    const mix = alterarQtdMix({ Brigadeiro: 25, Beijinho: 0, Ninho: 0 }, "Brigadeiro", 25, 50);
    expect(mix).toEqual({ Brigadeiro: 50, Beijinho: 0, Ninho: 0 });
    expect(mixCompleto(mix, 50)).toBe(true);
  });

  it("validarCombo aceita total multiplo do passo", () => {
    expect(validarCombo(50, ["A", "B"], 25)).toBeNull();
    expect(validarCombo(4, ["A", "B", "C", "D"])).toBeNull();
    expect(validarCombo(4, ["A", "B", "C", "D"], 0)).toBeNull();
  });

  it("validarCombo recusa total que nao e multiplo do passo ou passo maior que a caixa", () => {
    expect(validarCombo(50, ["A", "B"], 30)).toContain("multiplo de 30");
    expect(validarCombo(4, ["A", "B"], 25)).toContain("maior que a caixa");
  });
});

describe("combo: resumoItemPedido", () => {
  it("separa o mix em detalhes por caixa", () => {
    const r = resumoItemPedido("Docinhos Gourmet", 2, [
      { Brigadeiro: 25, Beijinho: 25 },
      { Brigadeiro: 50, Beijinho: 0 },
    ]);
    expect(r.texto).toBe("Docinhos Gourmet 2 caixa(s)");
    expect(r.detalhes).toEqual(["Caixa 1: 25x Brigadeiro, 25x Beijinho", "Caixa 2: 50x Brigadeiro"]);
  });

  it("caixa unica vira um unico detalhe sem rotulo de caixa", () => {
    const r = resumoItemPedido("Docinhos Gourmet", 1, [{ Brigadeiro: 50, Beijinho: 0 }]);
    expect(r.texto).toBe("Docinhos Gourmet 1 caixa(s)");
    expect(r.detalhes).toEqual(["50x Brigadeiro"]);
  });

  it("sem mix devolve apenas o texto", () => {
    expect(resumoItemPedido("Bolo de Chocolate", 2).texto).toBe("Bolo de Chocolate x2");
    expect(resumoItemPedido("Bolo", 1.5, [], true).texto).toBe("Bolo 1,5 kg");
  });
});
