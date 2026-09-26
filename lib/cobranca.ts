import type { CompraCredor } from "@/types/database";

export type FrequenciaLembrete = "diario" | "2_dias" | "3_dias" | "semanal" | "vencimento";

export const FREQUENCIAS_LEMBRETE: { valor: FrequenciaLembrete; rotulo: string }[] = [
  { valor: "vencimento", rotulo: "Só no vencimento" },
  { valor: "diario", rotulo: "Diário" },
  { valor: "2_dias", rotulo: "A cada 2 dias" },
  { valor: "3_dias", rotulo: "A cada 3 dias" },
  { valor: "semanal", rotulo: "Semanal" },
];

export const INTERVALO_FREQUENCIA: Record<FrequenciaLembrete, number | null> = {
  diario: 1,
  "2_dias": 2,
  "3_dias": 3,
  semanal: 7,
  vencimento: null,
};

function paraDias(data: string): number {
  const [ano, mes, dia] = data.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86400000;
}

export function compraAberta(compra: CompraCredor): boolean {
  if (compra.pago) return false;
  if (compra.status === "CANCELADO") return false;
  return true;
}

export function dataPrometidaDe(compra: CompraCredor): string {
  return (compra.dataPrometida || compra.data || "").slice(0, 10);
}

export function frequenciaDe(compra: CompraCredor): FrequenciaLembrete {
  return compra.frequenciaLembrete || "vencimento";
}

export function diasAtraso(compra: CompraCredor, hoje: string): number {
  const vencimento = dataPrometidaDe(compra);
  if (!vencimento) return 0;
  return Math.max(0, paraDias(hoje) - paraDias(vencimento));
}

export function deveCobrar(compra: CompraCredor, hoje: string): boolean {
  if (!compraAberta(compra)) return false;
  const vencimento = dataPrometidaDe(compra);
  if (!vencimento || hoje < vencimento) return false;

  const frequencia = frequenciaDe(compra);
  const ultimo = compra.ultimoLembreteEm ? compra.ultimoLembreteEm.slice(0, 10) : null;
  if (!ultimo) return true;

  const intervalo = INTERVALO_FREQUENCIA[frequencia];
  if (intervalo === null) return vencimento > ultimo;
  return paraDias(hoje) - paraDias(ultimo) >= intervalo;
}
