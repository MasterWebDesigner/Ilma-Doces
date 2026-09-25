import type { CartItem } from "@/types/database";
import { getStoreConfig } from "./storeConfig";
import { formatItemQty } from "./utils";
import { itemLineTotal, paidSubtotal } from "./brinde";

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

export function openWhatsApp(items: CartItem[], checkout: CheckoutData): void {
  const phone = checkout.storePhone
    ? `55${checkout.storePhone.replace(/\D/g, "")}`
    : `55${getStoreConfig().storePhone.replace(/\D/g, "")}`;
  const lines: string[] = [];

  lines.push("*🍽️ Novo Pedido — Ilma Doces*");
  lines.push("");

  lines.push(`*👤 Cliente:* ${checkout.customerName}`);
  lines.push(`*📱 WhatsApp:* ${checkout.customerPhone}`);
  lines.push("");

  lines.push(`*📦 Tipo:* ${checkout.deliveryType === "entrega" ? "Entrega" : "Retirada"}`);

  if (checkout.scheduledDate) {
    lines.push(`*📅 Data:* ${formatDateBR(checkout.scheduledDate)}`);
  }
  if (checkout.scheduledTime) {
    lines.push(`*⏰ Horário:* ${checkout.scheduledTime}`);
  }
  if (checkout.deliveryType === "entrega" && checkout.address) {
    lines.push(`*📍 Endereço:* ${checkout.address}`);
  }
  lines.push("");

  lines.push("*🍰 Itens do Pedido:*");
  items.forEach((item, i) => {
    if (item.is_brinde) {
      const original = item.product.price.toFixed(2).replace(".", ",");
      lines.push(`${i + 1}. 🎁 ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — R$ ${original} → *GRÁTIS (R$ 0,00)* — BRINDE FIDELIDADE`);
      return;
    }
    const price = itemLineTotal(item).toFixed(2).replace(".", ",");
    lines.push(`${i + 1}. ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — R$ ${price}`);
    if (item.notes) {
      lines.push(`   ↳ *obs:* ${item.notes}`);
    }
  });
  lines.push("");

  if (checkout.generalNotes) {
    lines.push(`*📝 Observações Gerais:* ${checkout.generalNotes}`);
    lines.push("");
  }

  const subtotal = paidSubtotal(items);
  const fee = checkout.deliveryFee || 0;
  const total = subtotal + fee;

  lines.push(`*💰 Subtotal:* R$ ${subtotal.toFixed(2).replace(".", ",")}`);
  if (fee > 0) {
    lines.push(`*🚚 Taxa de Entrega:* R$ ${fee.toFixed(2).replace(".", ",")}`);
  }
  lines.push(`*💵 *Total:* R$ ${total.toFixed(2).replace(".", ",")}`);
  lines.push("");

  lines.push(`*💳 Pagamento:* ${formatPayment(checkout.paymentMethod)}`);
  if (checkout.paymentMethod === "dinheiro" && checkout.trocoPara && checkout.trocoPara > 0) {
    lines.push(`*💵 Troco para:* R$ ${checkout.trocoPara.toFixed(2).replace(".", ",")}`);
  }
  lines.push("");
  lines.push("Aguardamos confirmação!");

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
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
}): void {
  const phone = `55${order.customerPhone.replace(/\D/g, "")}`;
  const lines: string[] = [];

  lines.push(`*✅ Pedido Confirmado — Ilma Doces*`);
  lines.push("");
  lines.push(`Ola ${order.customerName}!`);
  lines.push("");
  lines.push("Seu pedido foi *aceito e confirmado* pela Ilma Doces! 🎉");
  lines.push("");

  if (order.scheduledDate) {
    lines.push(`*📅 Data:* ${formatDateBR(order.scheduledDate)}`);
  }
  if (order.scheduledTime) {
    lines.push(`*⏰ Horario:* ${order.scheduledTime}`);
  }
  if (order.deliveryType === "entrega" && order.address) {
    lines.push(`*📍 Endereco:* ${order.address}`);
  }
  lines.push("");

  lines.push("*🍰 Itens:*");
  order.items.forEach((item, i) => {
    if (item.is_brinde) {
      lines.push(`${i + 1}. 🎁 ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)} — *BRINDE FIDELIDADE (R$ 0,00)*`);
      return;
    }
    lines.push(`${i + 1}. ${item.product.name} ${formatItemQty(item.quantity, item.product.isCustomWeight)}`);
  });
  lines.push("");

  lines.push(`*💰 Total:* R$ ${order.total.toFixed(2).replace(".", ",")}`);
  lines.push("");
  lines.push("Estamos preparando seu pedido com carinho! 💛");
  lines.push("Qualquer duvida, estamos a disposicao.");

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
}
