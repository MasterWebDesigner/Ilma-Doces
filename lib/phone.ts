export const MENSAGEM_WHATSAPP_INVALIDO =
  "Insira um número de WhatsApp válido com DDD (ex: 11 99999-9999)";

const DDD_PADRAO = "11";

export function apenasDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

export function mascaraTelefone(valor: string): string {
  let d = apenasDigitos(valor);
  if (d.length > 11 && d.startsWith("0")) {
    d = d.replace(/^0+/, "");
  }
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}${d.length === 2 ? ") " : ""}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function higienizarTelefone(valor: string): string | null {
  let d = apenasDigitos(valor);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 9) d = DDD_PADRAO + d;
  if (d.length !== 11) return null;
  return d;
}

export function formatarTelefone(valor: string): string {
  const d = apenasDigitos(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || "";
}

export function estadoTelefone(valor: string): { valor: string; erro: string } {
  const h = higienizarTelefone(valor);
  return {
    valor: h ? mascaraTelefone(h) : mascaraTelefone(valor),
    erro: valor.trim() && !h ? MENSAGEM_WHATSAPP_INVALIDO : "",
  };
}
