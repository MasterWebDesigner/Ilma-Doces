// ═══════════ PIX (BR CODE / COPIA E COLA) ═══════════

export function crc16Pix(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizarTextoPix(texto: string, max: number): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function cidadeDoEndereco(endereco: string): string {
  const m = (endereco || "").match(/([^,\-]+),\s*([A-Z]{2})(?:\s*-|\s*$)/i);
  return m && m[1] ? m[1].trim() : "";
}

export function normalizarChavePix(chave: string): string {
  const limpa = (chave || "").replace(/\s+/g, "");
  if (!limpa) return "";
  const digitos = limpa.replace(/[^\d]/g, "");
  const soFormatacaoNumerica = /^[\d\s().+-]+$/.test(limpa);
  if (soFormatacaoNumerica && digitos.length === 11 && digitos[2] === "9") return `+55${digitos}`;
  if (soFormatacaoNumerica && digitos.length === 13 && digitos.startsWith("55") && digitos[4] === "9") return `+${digitos}`;
  return limpa;
}

export interface DadosPix {
  chave: string;
  nome: string;
  cidade: string;
  valor: number;
  txid?: string;
}

function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

export function montarPixPayload(dados: DadosPix): string {
  const chave = normalizarChavePix(dados.chave);
  if (!chave || !(dados.valor > 0)) return "";
  const nome = normalizarTextoPix(dados.nome, 25) || "LOJA";
  const cidade = normalizarTextoPix(dados.cidade, 15) || "SAO PAULO";
  const txid =
    (dados.txid || "***").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25) || "***";
  const conta = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chave);
  const base =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", conta) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", dados.valor.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", nome) +
    tlv("60", cidade) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return base + crc16Pix(base);
}
