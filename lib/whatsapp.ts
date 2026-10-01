import type { CartItem, CompraItem, Order } from "@/types/database";
import { getStoreConfig, type StoreSettings } from "./storeConfig";
import { formatItemQty } from "./utils";
import { itemLineTotal, paidSubtotal } from "./brinde";
import {
  resolverTexto,
  type GatilhoMensagem,
  type VariaveisMensagem,
} from "./mensagensWhatsapp";

interface CheckoutData {
  customerName: string;
  customerPhone: string;
  deliveryType: "entrega" | "retirada";
  address?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  paymentMethod: string;
  generalNotes?: string;
  deliveryFee?: number;
  trocoPara?: number;
  storePhone?: string;
}

function formatPayment(method: string): string {
  const map: Record<string, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    cartao_debito: "Cartao de Debito",
    cartao_credito: "Cartao de Credito",
  };
  return map[method] || method;
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatarValorBR(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function varsVazias(): VariaveisMensagem {
  return {
    nome_cliente: "",
    numero_pedido: "",
    valor_total: "",
    itens_pedido: "",
    horario_agendamento: "",
    data_pedido: "",
    data_agendamento: "",
    data_compra: "",
    data_combinada: "",
    dias_atraso: "",
    rotulo_dias: "",
    motivo: "",
    endereco: "",
    tipo_entrega: "",
    tipo_destino: "",
    telefone_cliente: "",
    forma_pagamento: "",
    subtotal: "",
    taxa_entrega: "",
    troco: "",
    observacoes: "",
    chave_pix: "",
    link_pagamento: "",
    loja: "",
    whatsapp_loja: "",
  };
}

function varsBase(cfg: StoreSettings): VariaveisMensagem {
  return {
    loja: cfg.storeName || "",
    whatsapp_loja: cfg.whatsappLoja || cfg.storePhone || "",
    chave_pix: cfg.chavePix || cfg.pixKey || "",
    link_pagamento: cfg.paymentLink || "",
  };
}

function itensNumerados(items: CartItem[]): string {
  return items
    .map((item, i) => {
      if (item.is_brinde) {
        return `${i + 1}. 🎁 ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — *BRINDE FIDELIDADE (R$ 0,00)*`;
      }
      return `${i + 1}. ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)}`;
    })
    .join("\n");
}

function blocItensLoja(items: CartItem[]): string {
  return items
    .map((item, i) => {
      if (item.is_brinde) {
        const original = item.product.price.toFixed(2).replace(".", ",");
        return `${i + 1}. 🎁 ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — R$ ${original} → *GRÁTIS (R$ 0,00)* — BRINDE FIDELIDADE`;
      }
      const price = itemLineTotal(item).toFixed(2).replace(".", ",");
      const linha = `${i + 1}. ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — R$ ${price}`;
      return item.notes ? `${linha}\n   ↳ *obs:* ${item.notes}` : linha;
    })
    .join("\n");
}

export function mensagemAtiva(gatilho: GatilhoMensagem, cfg?: StoreSettings): boolean {
  const config = cfg || getStoreConfig();
  const tpl = config.mensagensWhatsapp?.find((m) => m.gatilho === gatilho);
  return tpl ? tpl.ativo !== false : true;
}

function varsPedido(order: Order, cfg: StoreSettings): VariaveisMensagem {
  return {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: order.customerName,
    numero_pedido: order.orderNumber || order.id.slice(-6),
    valor_total: formatarValorBR(order.total),
    itens_pedido: itensNumerados(order.items),
    horario_agendamento: order.scheduledTime || "",
    data_pedido: order.scheduledDate ? formatDateBR(order.scheduledDate) : "",
    data_agendamento: order.scheduledDate ? formatDateBR(order.scheduledDate) : "",
    endereco: order.deliveryType === "entrega" && order.address ? order.address : "",
    tipo_entrega: order.deliveryType === "entrega" ? "Entrega" : "Retirada",
    tipo_destino: order.deliveryType === "entrega" ? "entrega" : "retirada na loja",
    forma_pagamento: formatPayment(order.paymentMethod),
  };
}

export type ResultadoEnvio = "enviado" | "desativado" | "sem_telefone";

export function enviarMensagemStatus(order: Order, gatilho: GatilhoMensagem): ResultadoEnvio {
  const cfg = getStoreConfig();
  if (!mensagemAtiva(gatilho, cfg)) return "desativado";
  const digitos = (order.customerPhone || "").replace(/\D/g, "");
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  if (numero.length < 12) return "sem_telefone";
  const texto = resolverTexto(cfg.mensagensWhatsapp, gatilho, varsPedido(order, cfg));
  window.open(urlWaMe(order.customerPhone, texto), "_blank");
  return "enviado";
}

export function openWhatsApp(items: CartItem[], checkout: CheckoutData): void {
  const cfg = getStoreConfig();
  if (!mensagemAtiva("novo_pedido", cfg)) return;
  const phone = checkout.storePhone
    ? `55${checkout.storePhone.replace(/\D/g, "")}`
    : `55${cfg.storePhone.replace(/\D/g, "")}`;

  const subtotal = paidSubtotal(items);
  const fee = checkout.deliveryFee || 0;
  const total = subtotal + fee;

  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: checkout.customerName,
    telefone_cliente: checkout.customerPhone,
    tipo_entrega: checkout.deliveryType === "entrega" ? "Entrega" : "Retirada",
    data_pedido: checkout.scheduledDate ? formatDateBR(checkout.scheduledDate) : "",
    horario_agendamento: checkout.scheduledTime || "",
    endereco: checkout.deliveryType === "entrega" && checkout.address ? checkout.address : "",
    itens_pedido: blocItensLoja(items),
    observacoes: checkout.generalNotes || "",
    subtotal: formatarValorBR(subtotal),
    taxa_entrega: fee > 0 ? formatarValorBR(fee) : "",
    valor_total: formatarValorBR(total),
    forma_pagamento: formatPayment(checkout.paymentMethod),
    troco:
      checkout.paymentMethod === "dinheiro" && checkout.trocoPara && checkout.trocoPara > 0
        ? formatarValorBR(checkout.trocoPara)
        : "",
  };

  const texto = resolverTexto(cfg.mensagensWhatsapp, "novo_pedido", vars);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, "_blank");
}

export function confirmOrderWhatsApp(order: {
  customerName: string;
  customerPhone: string;
  deliveryType: "entrega" | "retirada";
  scheduledDate?: string;
  scheduledTime?: string;
  address?: string;
  items: CartItem[];
  total: number;
  orderNumber?: string;
}): void {
  const cfg = getStoreConfig();
  if (!mensagemAtiva("confirmacao", cfg)) return;
  const phone = `55${order.customerPhone.replace(/\D/g, "")}`;

  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: order.customerName,
    numero_pedido: order.orderNumber || "",
    data_pedido: order.scheduledDate ? formatDateBR(order.scheduledDate) : "",
    horario_agendamento: order.scheduledTime || "",
    endereco: order.deliveryType === "entrega" && order.address ? order.address : "",
    itens_pedido: itensNumerados(order.items),
    valor_total: formatarValorBR(order.total),
    telefone_cliente: order.customerPhone,
  };

  const texto = resolverTexto(cfg.mensagensWhatsapp, "confirmacao", vars);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, "_blank");
}

export function urlWaMe(telefone: string, texto: string): string {
  const digitos = (telefone || "").replace(/\D/g, "");
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function formatarItemCobranca(item: CompraItem): string {
  const comQtd = (item.descricao || "").match(/^(\d+)\s*x\s*(.+)$/i);
  if (comQtd) return `${comQtd[1]}x ${comQtd[2].trim()}`;
  const quantidade = Number(item.quantidade) || 1;
  return `${quantidade}x ${(item.descricao || "").trim()}`;
}

export function listaItensCobranca(itens?: CompraItem[], descricaoFallback?: string): string {
  if (itens && itens.length > 0) return itens.map(formatarItemCobranca).join(", ");
  return (descricaoFallback || "").trim();
}

interface CobrancaDados {
  nome: string;
  dataCompra: string;
  dataPrometida?: string;
  valor: number;
  itens?: CompraItem[];
  descricaoFallback?: string;
  chavePix?: string;
  whatsappLoja?: string;
}

export function montarCobrancaVencimento(d: CobrancaDados): string {
  const cfg = getStoreConfig();
  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: d.nome,
    data_compra: formatDateBR(d.dataCompra),
    itens_pedido: listaItensCobranca(d.itens, d.descricaoFallback),
    valor_total: formatarValorBR(d.valor),
    chave_pix: d.chavePix || "",
    whatsapp_loja: d.whatsappLoja || "",
  };
  return resolverTexto(cfg.mensagensWhatsapp, "cobranca_vencimento", vars);
}

export function montarCobrancaAtraso(d: CobrancaDados & { diasAtraso: number }): string {
  const cfg = getStoreConfig();
  const rotulo = d.diasAtraso === 1 ? "dia" : "dias";
  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: d.nome,
    data_combinada: formatDateBR(d.dataPrometida || d.dataCompra),
    dias_atraso: d.diasAtraso,
    rotulo_dias: rotulo,
    itens_pedido: listaItensCobranca(d.itens, d.descricaoFallback),
    valor_total: formatarValorBR(d.valor),
    chave_pix: d.chavePix || "",
    whatsapp_loja: d.whatsappLoja || "",
  };
  return resolverTexto(cfg.mensagensWhatsapp, "cobranca_atraso", vars);
}

export function montarAgradecimentoPagamento(d: {
  nome: string;
  valor: number;
  itens?: CompraItem[];
  descricaoFallback?: string;
}): string {
  const cfg = getStoreConfig();
  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: d.nome,
    valor_total: formatarValorBR(d.valor),
    itens_pedido: listaItensCobranca(d.itens, d.descricaoFallback),
  };
  return resolverTexto(cfg.mensagensWhatsapp, "agradecimento_pagamento", vars);
}

function listaSimplesItens(items: CartItem[]): string {
  return items
    .map((item) => `${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)}`)
    .join(", ");
}

export function montarRecusaPedido(d: {
  customerName: string;
  numeroPedido: string;
  items: CartItem[];
  motivo?: string;
}): string {
  const cfg = getStoreConfig();
  const motivo = (d.motivo || "").trim();
  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: d.customerName,
    numero_pedido: d.numeroPedido,
    itens_pedido: listaSimplesItens(d.items),
    motivo: motivo ? ` Motivo: ${motivo}.` : "",
  };
  return resolverTexto(cfg.mensagensWhatsapp, "recusa", vars);
}

export function montarCancelamentoPedido(d: {
  customerName: string;
  numeroPedido: string;
  items: CartItem[];
}): string {
  const cfg = getStoreConfig();
  const vars: VariaveisMensagem = {
    ...varsVazias(),
    ...varsBase(cfg),
    nome_cliente: d.customerName,
    numero_pedido: d.numeroPedido,
    itens_pedido: listaSimplesItens(d.items),
  };
  return resolverTexto(cfg.mensagensWhatsapp, "cancelamento", vars);
}
