export const MARGEM_PREPARO_PADRAO_MIN = 60;

const FUSO_LOJA = "America/Sao_Paulo";

interface RelogioLocal {
  dataISO: string;
  minutos: number;
}

function componentesDoFuso(data: Date, fuso: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(data);
  const pegar = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? NaN);
  const hora = pegar("hour");
  return {
    ano: pegar("year"),
    mes: pegar("month"),
    dia: pegar("day"),
    hora: (hora === 24 ? 0 : hora) || 0,
    minuto: pegar("minute"),
  };
}

export function agoraLocal(agora: Date = new Date(), fuso: string = FUSO_LOJA): RelogioLocal {
  const c = componentesDoFuso(agora, fuso);
  const dataISO = `${c.ano}-${String(c.mes).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
  return { dataISO, minutos: c.hora * 60 + c.minuto };
}

export function minutosDeHorario(horario: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((horario || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatarMinutos(total: number): string {
  const t = Math.max(0, Math.min(Math.round(total), 24 * 60 - 1));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function corteDoDia(dataISO: string, agora: Date, margemPreparoMinutos: number): number | null {
  if (!dataISO) return null;
  const local = agoraLocal(agora);
  if (dataISO !== local.dataISO) return null;
  return local.minutos + Math.max(0, margemPreparoMinutos);
}

export function horariosDisponiveis(
  slots: string[],
  dataISO: string,
  margemPreparoMinutos: number,
  agora: Date = new Date()
): string[] {
  const corte = corteDoDia(dataISO, agora, margemPreparoMinutos);
  if (corte === null) return slots;
  return slots.filter((s) => {
    const minutos = minutosDeHorario(s);
    return minutos !== null && minutos >= corte;
  });
}

export function horarioMinimoDoDia(
  dataISO: string,
  margemPreparoMinutos: number,
  agora: Date = new Date()
): string | null {
  const corte = corteDoDia(dataISO, agora, margemPreparoMinutos);
  return corte === null ? null : formatarMinutos(corte);
}

export type ResultadoHorario = { ok: true } | { ok: false; error: string };

export function validarHorarioPedido(params: {
  scheduledDate?: string;
  scheduledTime?: string;
  margemPreparoMinutos: number;
  agora?: Date;
}): ResultadoHorario {
  const { scheduledDate, scheduledTime, margemPreparoMinutos } = params;
  const agora = params.agora ?? new Date();
  if (!scheduledDate || !scheduledTime) return { ok: true };

  const local = agoraLocal(agora);
  if (scheduledDate < local.dataISO) {
    return { ok: false, error: "A data do pedido não pode ser no passado." };
  }
  if (scheduledDate > local.dataISO) return { ok: true };

  const minutos = minutosDeHorario(scheduledTime);
  if (minutos === null) {
    return { ok: false, error: "Horário de retirada inválido." };
  }

  const margem = Math.max(0, margemPreparoMinutos);
  const corte = local.minutos + margem;
  if (minutos < corte) {
    if (corte >= 24 * 60) {
      return {
        ok: false,
        error: `Não há mais horários disponíveis hoje (margem de preparo de ${margem} min). Escolha outro dia.`,
      };
    }
    const detalhe = margem > 0 ? ` (margem de preparo de ${margem} min)` : "";
    return {
      ok: false,
      error: `Horário indisponível para hoje${detalhe}: escolha um horário a partir das ${formatarMinutos(corte)}.`,
    };
  }
  return { ok: true };
}

export async function validarHorarioServidor(
  scheduledDate: string,
  scheduledTime: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/pedidos/validar-horario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate, scheduledTime }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 409) {
      return { ok: false, error: data?.error || "Horário indisponível para o horário atual." };
    }
    if (!res.ok) {
      return { ok: true, error: data?.error || "Falha na validação de horário." };
    }
    return { ok: true };
  } catch (err) {
    console.error("validarHorarioServidor:", err);
    return { ok: true, error: "Sem conexão com o servidor de horários." };
  }
}
