import { describe, it, expect } from "vitest";
import type { CompraCredor } from "@/types/database";
import {
  deveCobrar,
  diasAtraso,
  compraAberta,
  frequenciaDe,
  dataPrometidaDe,
} from "@/lib/cobranca";

const HOJE = "2026-09-26";

function makeCompra(overrides: Partial<CompraCredor> = {}): CompraCredor {
  return {
    id: "c1",
    origem: "manual",
    descricao: "Bolo de festa",
    valor: 100,
    data: "2026-09-20",
    pago: false,
    ...overrides,
  };
}

describe("compraAberta", () => {
  it("compra quitada nao esta aberta", () => {
    expect(compraAberta(makeCompra({ pago: true, valorPendente: 0 }))).toBe(false);
  });

  it("compra cancelada nao esta aberta mesmo com saldo", () => {
    expect(compraAberta(makeCompra({ status: "CANCELADO", valorPendente: 50 }))).toBe(false);
  });

  it("compra pendente normal esta aberta", () => {
    expect(compraAberta(makeCompra({ status: "PENDENTE", valorPendente: 100 }))).toBe(true);
    expect(compraAberta(makeCompra())).toBe(true);
  });
});

describe("dataPrometidaDe e frequenciaDe", () => {
  it("usa dataPrometida quando existe", () => {
    expect(dataPrometidaDe(makeCompra({ dataPrometida: "2026-09-30" }))).toBe("2026-09-30");
  });

  it("cai para a data de entrada quando nao ha dataPrometida", () => {
    expect(dataPrometidaDe(makeCompra({ data: "2026-09-21" }))).toBe("2026-09-21");
  });

  it("frequencia padrao e vencimento", () => {
    expect(frequenciaDe(makeCompra())).toBe("vencimento");
    expect(frequenciaDe(makeCompra({ frequenciaLembrete: "semanal" }))).toBe("semanal");
  });
});

describe("deveCobrar — regra base (status e data)", () => {
  it("nao cobra compra quitada", () => {
    expect(deveCobrar(makeCompra({ pago: true, dataPrometida: HOJE }), HOJE)).toBe(false);
  });

  it("nao cobra compra cancelada", () => {
    expect(deveCobrar(makeCompra({ status: "CANCELADO", dataPrometida: HOJE }), HOJE)).toBe(false);
  });

  it("nao cobra antes do vencimento", () => {
    expect(deveCobrar(makeCompra({ dataPrometida: "2026-09-27" }), HOJE)).toBe(false);
    expect(deveCobrar(makeCompra({ dataPrometida: "2026-10-10" }), HOJE)).toBe(false);
  });

  it("cobra exatamente no dia do vencimento quando nunca foi cobrada", () => {
    expect(deveCobrar(makeCompra({ dataPrometida: HOJE }), HOJE)).toBe(true);
  });

  it("cobra quando o vencimento ja passou e nunca foi cobrada", () => {
    expect(deveCobrar(makeCompra({ dataPrometida: "2026-09-20" }), HOJE)).toBe(true);
  });
});

describe("deveCobrar — frequencia vencimento (padrao)", () => {
  it("apos avisar no dia do vencimento, some nos dias seguintes", () => {
    const compra = makeCompra({ dataPrometida: HOJE, ultimoLembreteEm: `${HOJE}T10:00:00` });
    expect(deveCobrar(compra, HOJE)).toBe(false);
    expect(deveCobrar(compra, "2026-09-27")).toBe(false);
    expect(deveCobrar(compra, "2026-10-05")).toBe(false);
  });

  it("volta a aparecer se a data prometida for adiada apos o lembrete", () => {
    const compra = makeCompra({ dataPrometida: "2026-09-30", ultimoLembreteEm: `${HOJE}T10:00:00` });
    expect(deveCobrar(compra, "2026-09-29")).toBe(false);
    expect(deveCobrar(compra, "2026-09-30")).toBe(true);
    expect(deveCobrar(compra, "2026-10-02")).toBe(true);
  });

  it("se nunca foi cobrado, aparece apos qualquer vencimento", () => {
    const compra = makeCompra({ dataPrometida: "2026-09-20", ultimoLembreteEm: null });
    expect(deveCobrar(compra, HOJE)).toBe(true);
  });
});

describe("deveCobrar — frequencias com intervalo", () => {
  it("diario: cobra todo dia apos o primeiro aviso", () => {
    const compra = makeCompra({
      dataPrometida: "2026-09-20",
      frequenciaLembrete: "diario",
      ultimoLembreteEm: "2026-09-25T09:00:00",
    });
    expect(deveCobrar(compra, "2026-09-25")).toBe(false);
    expect(deveCobrar(compra, HOJE)).toBe(true);
    expect(deveCobrar(compra, "2026-09-27")).toBe(true);
  });

  it("a cada 2 dias: espera o intervalo desde o ultimo aviso", () => {
    const compra = makeCompra({
      dataPrometida: "2026-09-20",
      frequenciaLembrete: "2_dias",
      ultimoLembreteEm: "2026-09-25T09:00:00",
    });
    expect(deveCobrar(compra, HOJE)).toBe(false);
    expect(deveCobrar(compra, "2026-09-27")).toBe(true);
  });

  it("a cada 3 dias: espera o intervalo desde o ultimo aviso", () => {
    const compra = makeCompra({
      dataPrometida: "2026-09-20",
      frequenciaLembrete: "3_dias",
      ultimoLembreteEm: "2026-09-23T09:00:00",
    });
    expect(deveCobrar(compra, "2026-09-25")).toBe(false);
    expect(deveCobrar(compra, HOJE)).toBe(true);
  });

  it("semanal: cobra quando passa uma semana do ultimo aviso", () => {
    const compra = makeCompra({
      dataPrometida: "2026-09-01",
      frequenciaLembrete: "semanal",
      ultimoLembreteEm: "2026-09-19T09:00:00",
    });
    expect(deveCobrar(compra, "2026-09-25")).toBe(false);
    expect(deveCobrar(compra, HOJE)).toBe(true);
  });

  it("frequencia com intervalo so cobra apos o vencimento", () => {
    const compra = makeCompra({
      dataPrometida: "2026-09-30",
      frequenciaLembrete: "diario",
      ultimoLembreteEm: "2026-09-20T09:00:00",
    });
    expect(deveCobrar(compra, HOJE)).toBe(false);
    expect(deveCobrar(compra, "2026-09-30")).toBe(true);
  });
});

describe("diasAtraso", () => {
  it("zero quando vence hoje ou no futuro", () => {
    expect(diasAtraso(makeCompra({ dataPrometida: HOJE }), HOJE)).toBe(0);
    expect(diasAtraso(makeCompra({ dataPrometida: "2026-09-28" }), HOJE)).toBe(0);
  });

  it("calcula os dias de atraso", () => {
    expect(diasAtraso(makeCompra({ dataPrometida: "2026-09-23" }), HOJE)).toBe(3);
    expect(diasAtraso(makeCompra({ dataPrometida: "2026-09-25" }), HOJE)).toBe(1);
    expect(diasAtraso(makeCompra({ dataPrometida: "2026-09-01" }), HOJE)).toBe(25);
  });

  it("zero quando nao ha data", () => {
    expect(diasAtraso(makeCompra({ data: "", dataPrometida: "" }), HOJE)).toBe(0);
  });
});
