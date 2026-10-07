import type { EntradaItem, EntradaMercadoria, EntradaParcela, Expense } from "@/types/database";

// ═══════════ NUMEROS ═══════════

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

export function money(n: number): string {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

export function slugFornecedor(nome: string): string {
  const slug = (nome || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "fornecedor-" + (nome || "").length;
}

export function sugestoesFornecedor(cadastrados: string[], fonteExtra: string[]): string[] {
  const mapa = new Map<string, string>();
  for (const lista of [cadastrados, fonteExtra]) {
    for (const nome of lista) {
      const limpo = (nome || "").trim();
      if (!limpo) continue;
      const chave = limpo.toLowerCase();
      if (!mapa.has(chave)) mapa.set(chave, limpo);
    }
  }
  return [...mapa.values()].sort((a, b) => a.localeCompare(b));
}

export function ehFornecedorNovo(cadastrados: string[], digitado: string): boolean {
  const limpo = (digitado || "").trim();
  if (!limpo) return false;
  return !cadastrados.some((f) => f.toLowerCase() === limpo.toLowerCase());
}

export function aplicarVencimentos<T extends { numero: number; vencimento: string }>(
  parcelas: T[],
  overrides: Record<number, string>
): T[] {
  return parcelas.map((p) => (overrides[p.numero] ? { ...p, vencimento: overrides[p.numero] } : p));
}

export function novoId(prefixo: string): string {
  return prefixo + Date.now() + "-" + Math.random().toString(36).slice(2, 5);
}

// ═══════════ DATAS (yyyy-mm-dd local) ═══════════

function parseData(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = (s || "").split("-").map(Number);
  return { y: y || 1970, m: m || 1, d: d || 1 };
}

function formatar(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

export function addDays(data: string, dias: number): string {
  const { y, m, d } = parseData(data);
  const dt = new Date(y, m - 1, d + dias);
  return formatar(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function addMonthsClamped(data: string, meses: number): string {
  const { y, m, d } = parseData(data);
  const alvo = new Date(y, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return formatar(alvo.getFullYear(), alvo.getMonth() + 1, Math.min(d, ultimoDia));
}

// ═══════════ PARCELAS ═══════════

export function dividirValorEm(total: number, n: number): number[] {
  const quantas = Math.max(1, Math.floor(n));
  const totalCents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(totalCents / quantas);
  const resto = totalCents - base * quantas;
  const valores: number[] = [];
  for (let i = 0; i < quantas; i++) {
    const cents = base + (i >= quantas - resto ? 1 : 0);
    valores.push(cents / 100);
  }
  return valores;
}

export function parcelasAvista(total: number, data: string): EntradaParcela[] {
  return [{ numero: 1, vencimento: data, valor: round2(total) }];
}

export function parcelasEmDias(total: number, data: string, n: number, dias = 30): EntradaParcela[] {
  return dividirValorEm(total, n).map((valor, i) => ({
    numero: i + 1,
    vencimento: addDays(data, dias * (i + 1)),
    valor,
  }));
}

export function parcelasMensais(total: number, data: string, n: number): EntradaParcela[] {
  return dividirValorEm(total, n).map((valor, i) => ({
    numero: i + 1,
    vencimento: addMonthsClamped(data, i + 1),
    valor,
  }));
}

export function parcelasEmDiasApartirDe(total: number, primeiro: string, n: number, dias = 30): EntradaParcela[] {
  return dividirValorEm(total, n).map((valor, i) => ({
    numero: i + 1,
    vencimento: addDays(primeiro, dias * i),
    valor,
  }));
}

export function parcelasMensaisApartirDe(total: number, primeiro: string, n: number): EntradaParcela[] {
  return dividirValorEm(total, n).map((valor, i) => ({
    numero: i + 1,
    vencimento: addMonthsClamped(primeiro, i),
    valor,
  }));
}

export function somaParcelasConfere(total: number, parcelas: { valor: number }[]): boolean {
  const somaCents = parcelas.reduce((s, p) => s + Math.round((Number(p.valor) || 0) * 100), 0);
  const totalCents = Math.round((Number(total) || 0) * 100);
  return Math.abs(somaCents - totalCents) <= 1;
}

export function descricaoDespesaEntrada(fornecedor: string, numero: number, totalParcelas: number): string {
  return totalParcelas > 1 ? `Compra ${fornecedor} — parcela ${numero}/${totalParcelas}` : `Compra ${fornecedor}`;
}

// ═══════════ RATEIO DE FRETE ═══════════

export function ratearFrete(
  subtotal: number,
  frete: number,
  itens: { qtd: number; custoUnitario: number }[]
): number[] {
  if (!frete || subtotal <= 0 || itens.length === 0) return itens.map(() => 0);
  const rateio = itens.map((item) => round2((frete * (item.qtd * item.custoUnitario)) / subtotal));
  const soma = round2(rateio.reduce((s, v) => s + v, 0));
  const diff = round2(frete - soma);
  if (diff !== 0) rateio[rateio.length - 1] = round2(rateio[rateio.length - 1] + diff);
  return rateio;
}

export function custoUnitarioComFrete(item: { qtd: number; custoUnitario: number }, freteRateado: number): number {
  if (item.qtd <= 0) return round4(item.custoUnitario);
  return round4((item.qtd * item.custoUnitario + freteRateado) / item.qtd);
}

// ═══════════ RATEIO POR CATEGORIA ═══════════

export function categoriaDoInsumo(category?: string): string {
  return category === "Embalagens" ? "Embalacoes" : "Insumos";
}

export function dividirValorPorCategoria(
  partes: { categoria: string; valor: number }[],
  valor: number
): { categoria: string; valor: number }[] {
  const ativas = partes.filter((p) => p.valor > 0);
  if (ativas.length === 0) return [{ categoria: "Insumos", valor: round2(valor) }];
  if (ativas.length === 1) return [{ categoria: ativas[0].categoria, valor: round2(valor) }];
  const total = ativas.reduce((s, p) => s + p.valor, 0);
  const resultado: { categoria: string; valor: number }[] = [];
  let resto = round2(valor);
  ativas.forEach((p, i) => {
    const bruto = i === ativas.length - 1 ? resto : round2((valor * p.valor) / total);
    resto = round2(resto - bruto);
    if (bruto > 0) resultado.push({ categoria: p.categoria, valor: bruto });
  });
  return resultado.length > 0 ? resultado : [{ categoria: ativas[0].categoria, valor: round2(valor) }];
}

export function agruparDespesasPorParcela(
  entrada: EntradaMercadoria,
  expenses: Expense[]
): { parcela: EntradaParcela; despesas: Expense[] }[] {
  const daEntrada = entrada.despesaIds
    .map((id) => expenses.find((e) => e.id === id))
    .filter((e): e is Expense => Boolean(e));
  const temParcela = daEntrada.some((e) => e.parcela !== undefined);
  return entrada.parcelas.map((p, i) => ({
    parcela: p,
    despesas: temParcela
      ? daEntrada.filter((e) => e.parcela === p.numero)
      : expenses.filter((e) => e.id === entrada.despesaIds[i]),
  }));
}

// ═══════════ VALIDACAO ═══════════

export function calcularTotais(
  itens: { qtd: number; custoUnitario: number }[],
  frete: number
): { subtotal: number; frete: number; total: number } {
  const subtotal = round2(itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.custoUnitario) || 0), 0));
  const freteLimpo = round2(Number(frete) || 0);
  return { subtotal, frete: freteLimpo, total: round2(subtotal + freteLimpo) };
}

export function validarEntrada(dados: {
  fornecedor: string;
  data: string;
  itens: { insumoId: string; qtd: number; custoUnitario: number }[];
  parcelas: { vencimento: string; valor: number }[];
  total: number;
}): string | null {
  if (!dados.fornecedor || !dados.fornecedor.trim()) return "Informe o fornecedor.";
  if (!dados.data) return "Informe a data da compra.";
  if (dados.itens.length === 0) return "Adicione ao menos um item a entrada.";
  for (const item of dados.itens) {
    if (!item.insumoId) return "Selecione o insumo de todos os itens.";
    if (!(item.qtd > 0)) return "Todas as quantidades precisam ser maiores que zero.";
    if (!(item.custoUnitario >= 0)) return "Custo unitario invalido.";
  }
  if (dados.parcelas.length === 0) return "Informe as parcelas da compra.";
  for (const p of dados.parcelas) {
    if (!p.vencimento) return "Informe o vencimento de todas as parcelas.";
    if (!(p.valor > 0)) return "Todos os valores de parcela precisam ser maiores que zero.";
  }
  if (!somaParcelasConfere(dados.total, dados.parcelas)) {
    return `A soma das parcelas (R$ ${money(dados.parcelas.reduce((s, p) => s + p.valor, 0))}) nao bate com o total (R$ ${money(dados.total)}).`;
  }
  return null;
}

// ═══════════ PAYLOADS (sem undefined p/ Firestore) ═══════════

export function montarDadosEntrada(e: EntradaMercadoria) {
  return {
    fornecedor: e.fornecedor,
    data: e.data,
    itens: e.itens.map((i) => ({
      insumoId: i.insumoId,
      nome: i.nome,
      brandId: i.brandId || "",
      qtd: i.qtd,
      custoUnitario: i.custoUnitario,
    })),
    subtotal: round2(e.subtotal),
    frete: round2(e.frete),
    total: round2(e.total),
    formaPagamento: e.formaPagamento,
    aVista: e.aVista ?? false,
    parcelas: e.parcelas.map((p) => ({
      numero: p.numero,
      vencimento: p.vencimento,
      valor: round2(p.valor),
    })),
    criadoEm: e.criadoEm,
    despesaIds: e.despesaIds,
    loteIds: e.loteIds,
  };
}

export function montarDadosDespesaEntrada(params: {
  descricao: string;
  valor: number;
  data: string;
  vencimento: string;
  entradaId: string;
  criadoEm: string;
  status?: "Pago" | "Pendente";
  categoria?: string;
  parcela?: number;
}): Omit<Expense, "id"> {
  return {
    descricao: params.descricao,
    categoria: params.categoria || "Insumos",
    valor: round2(params.valor),
    data: params.data,
    vencimento: params.vencimento,
    entradaId: params.entradaId,
    ...(params.parcela !== undefined ? { parcela: params.parcela } : {}),
    status: params.status ?? "Pendente",
    createdAt: params.criadoEm,
  };
}
