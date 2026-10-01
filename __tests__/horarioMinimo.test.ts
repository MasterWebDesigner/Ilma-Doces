import { describe, it, expect } from "vitest";
import {
  MARGEM_PREPARO_PADRAO_MIN,
  formatarMinutos,
  minutosDeHorario,
  horariosDisponiveis,
  horarioMinimoDoDia,
  validarHorarioPedido,
} from "@/lib/horarioMinimo";

const AGORA = new Date("2026-09-30T12:00:00-03:00");
const HOJE = "2026-09-30";
const SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];

describe("horariosDisponiveis", () => {
  it("bloqueia horarios anteriores ao atual quando a data e hoje", () => {
    expect(horariosDisponiveis(SLOTS, HOJE, 0, AGORA)).toEqual(["12:00", "13:00", "14:00"]);
  });

  it("aplica a margem de preparo sobre o horario atual", () => {
    expect(horariosDisponiveis(SLOTS, HOJE, 60, AGORA)).toEqual(["13:00", "14:00"]);
  });

  it("mantem todos os horarios para data futura", () => {
    expect(horariosDisponiveis(SLOTS, "2026-10-05", 60, AGORA)).toEqual(SLOTS);
  });

  it("mantem todos os horarios quando a data ainda nao foi escolhida", () => {
    expect(horariosDisponiveis(SLOTS, "", 60, AGORA)).toEqual(SLOTS);
  });

  it("usa margem padrao de 60 minutos", () => {
    expect(MARGEM_PREPARO_PADRAO_MIN).toBe(60);
  });
});

describe("horarioMinimoDoDia", () => {
  it("calcula o primeiro horario permitido de hoje com margem", () => {
    expect(horarioMinimoDoDia(HOJE, 60, AGORA)).toBe("13:00");
  });

  it("retorna null para datas futuras", () => {
    expect(horarioMinimoDoDia("2026-10-05", 60, AGORA)).toBeNull();
  });
});

describe("validarHorarioPedido", () => {
  it("rejeita data no passado", () => {
    const r = validarHorarioPedido({ scheduledDate: "2026-09-29", scheduledTime: "14:00", margemPreparoMinutos: 0, agora: AGORA });
    expect(r.ok).toBe(false);
  });

  it("rejeita horario anterior ao atual quando a data e hoje", () => {
    const r = validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "11:00", margemPreparoMinutos: 0, agora: AGORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("a partir das 12:00");
  });

  it("aceita o horario igual ao atual sem margem", () => {
    expect(validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "12:00", margemPreparoMinutos: 0, agora: AGORA }).ok).toBe(true);
  });

  it("exige a margem de preparo no mesmo dia", () => {
    expect(validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "12:59", margemPreparoMinutos: 60, agora: AGORA }).ok).toBe(false);
    expect(validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "13:00", margemPreparoMinutos: 60, agora: AGORA }).ok).toBe(true);
  });

  it("aceita qualquer horario em data futura", () => {
    expect(validarHorarioPedido({ scheduledDate: "2026-10-05", scheduledTime: "08:00", margemPreparoMinutos: 60, agora: AGORA }).ok).toBe(true);
  });

  it("ignora quando data ou horario nao foram informados", () => {
    expect(validarHorarioPedido({ margemPreparoMinutos: 60, agora: AGORA }).ok).toBe(true);
    expect(validarHorarioPedido({ scheduledDate: HOJE, margemPreparoMinutos: 60, agora: AGORA }).ok).toBe(true);
  });

  it("rejeita horario malformado no mesmo dia", () => {
    const r = validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "25h00", margemPreparoMinutos: 0, agora: AGORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("inválido");
  });

  it("avisa que nao ha mais horarios quando a margem ultrapassa a meia-noite", () => {
    const tarde = new Date("2026-09-30T23:30:00-03:00");
    const r = validarHorarioPedido({ scheduledDate: HOJE, scheduledTime: "23:59", margemPreparoMinutos: 60, agora: tarde });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("outro dia");
  });
});

describe("utilitarios de horario", () => {
  it("converte horario em minutos", () => {
    expect(minutosDeHorario("13:30")).toBe(810);
    expect(minutosDeHorario("9:05")).toBe(545);
    expect(minutosDeHorario("24:00")).toBeNull();
    expect(minutosDeHorario("")).toBeNull();
  });

  it("formata minutos como HH:MM", () => {
    expect(formatarMinutos(780)).toBe("13:00");
    expect(formatarMinutos(0)).toBe("00:00");
  });
});
