"use client";

import { useState } from "react";
import { useProductStore, useOrderStore, useCustomerStore } from "@/lib/store";
import { useFinanceiroStore } from "@/lib/financeiroStore";
import { useCredoresStore } from "@/lib/credoresStore";
import { validarEstoqueServidor, listarSemEstoque } from "@/lib/stockGuard";
import { notifyInfo } from "@/lib/notifications";
import { formatCurrency, getLocalDateStr, paymentLabelOf, formatItemQty } from "@/lib/utils";
import { PaymentMethod, CartItem, CompraItem } from "@/types/database";
import { formatarTelefone } from "@/lib/phone";
import { isBrindeProduct } from "@/lib/brinde";

interface QuickSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickSaleModal({ isOpen, onClose }: QuickSaleModalProps) {
  const allProducts = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const products = allProducts.filter((p) => p.cardapioRapido);
  const customers = useCustomerStore((s) => s.customers);
  const addOrder = useOrderStore((s) => s.addOrder);
  const addTransaction = useFinanceiroStore((s) => s.addTransaction);
  const upsertCustomer = useCustomerStore((s) => s.upsertCustomer);
  const credores = useCredoresStore((s) => s.credores);
  const converterPedidoParaFiado = useCredoresStore((s) => s.converterPedidoParaFiado);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [cashGiven, setCashGiven] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [clienteBusca, setClienteBusca] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return getLocalDateStr(d);
  });

  if (!isOpen) return null;

  const total = cart.reduce((sum, item) => sum + (item.is_brinde ? 0 : item.product.price * item.quantity), 0);
  const itensBrinde = cart.filter((i) => i.is_brinde);
  const valorBrinde = itensBrinde.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cashNum = parseFloat(cashGiven.replace(",", ".")) || 0;
  const change = paymentMethod === "dinheiro" && cashNum > total ? cashNum - total : 0;

  const isFiado = paymentMethod === "fiado";
  const cust = customers.find((c) => c.id === selectedClienteId);
  const buscaNorm = clienteBusca.trim().toLowerCase();
  const buscaDigitos = clienteBusca.replace(/\D/g, "");
  const clientesFiltrados = buscaNorm || buscaDigitos
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(buscaNorm) ||
          (buscaDigitos && c.phone.replace(/\D/g, "").includes(buscaDigitos))
      )
    : customers;
  const credorCliente = cust
    ? credores.find(
        (c) =>
          c.clienteId === cust.id ||
          (c.whatsapp && cust.phone && c.whatsapp.replace(/\D/g, "") === cust.phone.replace(/\D/g, ""))
      )
    : undefined;
  const saldoDevedor = credorCliente
    ? (credorCliente.compras || []).reduce(
        (s, comp) => s + (comp.pago ? 0 : Number(comp.valorPendente ?? comp.valor) || 0),
        0
      )
    : 0;
  const limiteCredito = Number(credorCliente?.limiteCredito) || 0;
  const limiteDisponivel = limiteCredito > 0 ? limiteCredito - saldoDevedor : null;

  function estoqueDisponivel(p: { controlarEstoque?: boolean; estoque?: number }): number | null {
    if (!p.controlarEstoque) return null;
    return Math.max(0, p.estoque ?? 0);
  }

  function qtyNoCarrinho(productId: string, exceto?: CartItem): number {
    return cart
      .filter((i) => i.product.id === productId && i !== exceto)
      .reduce((s, i) => s + i.quantity, 0);
  }

  function itensAgrupados(): { productId: string; quantity: number }[] {
    const map = new Map<string, number>();
    cart.forEach((i) => map.set(i.product.id, (map.get(i.product.id) ?? 0) + i.quantity));
    return Array.from(map, ([productId, quantity]) => ({ productId, quantity }));
  }

  function handleAddProduct(product: typeof products[0]) {
    const disponivel = estoqueDisponivel(product);
    if (disponivel !== null) {
      if (disponivel <= 0) {
        notifyInfo("Sem estoque", `${product.name} está esgotado. Repor via entrada de estoque.`);
        return;
      }
      const totalNoCarrinho = qtyNoCarrinho(product.id);
      if (totalNoCarrinho + 1 > disponivel) {
        notifyInfo(
          "Estoque insuficiente",
          product.isCustomWeight
            ? `Apenas ${formatItemQty(disponivel - totalNoCarrinho, true)} disponíveis em estoque.`
            : `Apenas ${disponivel - totalNoCarrinho} unidades disponíveis em estoque.`
        );
        return;
      }
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id && !i.is_brinde);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function handleToggleBrinde(productId: string) {
    const jaMarcado = cart.some((i) => i.product.id === productId && i.is_brinde);
    if (!jaMarcado) {
      const linha = cart.find((i) => i.product.id === productId && !i.is_brinde);
      if (linha && !isBrindeProduct(linha.product, categories)) {
        notifyInfo(
          "Brinde inválido",
          `Só produtos da categoria de brinde (Gelinhos) podem ser marcados como brinde. ${linha.product.name} não se qualifica.`
        );
        return;
      }
    }
    setCart((prev) => {
      const linhaBrinde = prev.find((i) => i.product.id === productId && i.is_brinde);
      if (linhaBrinde) {
        const normal = prev.find((i) => i.product.id === productId && !i.is_brinde);
        if (normal) {
          return prev
            .filter((i) => i !== linhaBrinde)
            .map((i) => (i === normal ? { ...i, quantity: i.quantity + linhaBrinde.quantity } : i));
        }
        return prev.map((i) => (i === linhaBrinde ? { ...i, is_brinde: false, preco_unitario: i.product.price } : i));
      }
      const normal = prev.find((i) => i.product.id === productId && !i.is_brinde);
      if (!normal) return prev;
      return prev.map((i) => (i === normal ? { ...i, is_brinde: true, preco_unitario: 0 } : i));
    });
  }

  function handleUpdateQuantity(productId: string, delta: number, linhaBrinde?: boolean) {
    const target = cart.find((i) => i.product.id === productId && !!i.is_brinde === !!linhaBrinde);
    if (target && target.product.controlarEstoque) {
      const maxQty = Math.max(0, (target.product.estoque ?? 0) - qtyNoCarrinho(productId, target));
      const newQty = target.quantity + delta;
      const rounded = target.product.isCustomWeight ? Math.round(newQty * 10) / 10 : newQty;
      if (rounded > maxQty) {
        notifyInfo(
          "Estoque insuficiente",
          target.product.isCustomWeight
            ? `Apenas ${formatItemQty(maxQty, true)} disponíveis em estoque.`
            : maxQty > 0
              ? `Apenas ${maxQty} unidades disponíveis em estoque.`
              : `${target.product.name} está esgotado.`
        );
        return;
      }
    }
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id === productId && !!i.is_brinde === !!linhaBrinde) {
            const newQty = i.quantity + delta;
            const rounded = i.product.isCustomWeight ? Math.round(newQty * 10) / 10 : newQty;
            return (i.product.isCustomWeight ? rounded >= 0.1 : rounded > 0) ? { ...i, quantity: rounded } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function validarEstoqueLocal(): string | null {
    for (const { productId, quantity } of itensAgrupados()) {
      const produto = cart.find((i) => i.product.id === productId)?.product;
      if (!produto?.controlarEstoque) continue;
      const disponivel = Math.max(0, produto.estoque ?? 0);
      if (quantity > disponivel) {
        return `${produto.name} (disponível: ${disponivel}, na venda: ${quantity})`;
      }
    }
    return null;
  }

  async function handleFinalizeSale(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      alert("Adicione pelo menos um item à venda.");
      return;
    }
    if (isFiado && !cust) {
      alert("Selecione ou cadastre um cliente para finalizar uma venda a prazo / fiado.");
      return;
    }
    if (isFiado && !dueDate) {
      alert("Informe o vencimento da venda a prazo / fiado.");
      return;
    }

    const semEstoqueLocal = validarEstoqueLocal();
    if (semEstoqueLocal) {
      notifyInfo("Estoque insuficiente", `${semEstoqueLocal}. Ajuste a quantidade para finalizar.`);
      return;
    }

    setLoading(true);

    try {
      const check = await validarEstoqueServidor(itensAgrupados());
      if (!check.ok) {
        setLoading(false);
        notifyInfo("Estoque insuficiente", `${listarSemEstoque(check.insufficient)}. Ajuste a quantidade para finalizar.`);
        return;
      }

      const customerName = cust ? cust.name : "Consumidor Final (Balcão)";
      const customerPhone = cust ? cust.phone : "00000000000";

      upsertCustomer(customerName, customerPhone, undefined);

      const newOrder = addOrder({
        customerName,
        customerPhone,
        items: cart,
        total,
        deliveryType: "retirada",
        scheduledDate: getLocalDateStr(),
        scheduledTime: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        paymentMethod,
        status: "concluido",
        dataPagamento: isFiado ? undefined : getLocalDateStr(),
        isFiado,
        generalNotes: cust
          ? `Venda Rápida / Balcão — ${isFiado ? "A Prazo / Fiado" : "Cliente Fidelidade"}: ${cust.name}${
              isFiado ? ` — Vencimento ${dueDate.split("-").reverse().join("/")}` : ""
            }`
          : "Venda Rápida / Balcão",
        origem: "manual",
      });

      if (isFiado && cust) {
        const itensCompra: CompraItem[] = cart.map((i) => ({
          descricao: i.is_brinde ? `${i.product.name} (BRINDE)` : i.product.name,
          quantidade: i.quantity,
          valorUnitario: i.is_brinde ? 0 : i.product.price,
        }));
        const descricaoItens = itensCompra.map((i) => `${i.quantidade}x ${i.descricao}`).join(", ");

        converterPedidoParaFiado({
          clienteId: cust.id,
          nomeCliente: cust.name,
          whatsappCliente: cust.phone,
          pedidoId: newOrder.id,
          origem: "manual",
          descricaoItens,
          valorTotal: total,
          dataPedido: getLocalDateStr(),
          dataPrometida: dueDate,
          itens: itensCompra,
        });

        const vencimentoFmt = dueDate.split("-").reverse().join("/");
        setSuccessMsg(
          `Venda #${newOrder.orderNumber || "Balcão"} lançada a prazo no crediário de ${cust.name} — vencimento ${vencimentoFmt}.${
            itensBrinde.length > 0 ? ` ${itensBrinde.length} item(ns) como BRINDE (R$ 0,00).` : ""
          }`
        );
      } else {
        addTransaction({
          tipo: "RECEITA",
          categoria: "Vendas / Balcão",
          valor: total,
          formaPagamento: paymentLabelOf(paymentMethod),
          descricao: `Venda Rápida #${newOrder.orderNumber || newOrder.id.slice(-6)} — ${customerName}${itensBrinde.length > 0 ? ` (${itensBrinde.length} brinde(s) R$ 0,00)` : ""}`,
          data: getLocalDateStr(),
        });

        setSuccessMsg(
          `Venda #${newOrder.orderNumber || "Balcão"} realizada com sucesso para ${customerName}!${
            itensBrinde.length > 0 ? ` ${itensBrinde.length} item(ns) registrado(s) como BRINDE (R$ 0,00).` : ""
          }`
        );
      }

      setTimeout(() => {
        setLoading(false);
        setSuccessMsg("");
        setCart([]);
        setSelectedClienteId("");
        setClienteBusca("");
        setCashGiven("");
        onClose();
      }, 1400);
    } catch (err) {
      console.error(err);
      setLoading(false);
      alert("Erro ao finalizar venda rápida.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4 bg-neutral-950">
          <div>
            <h2 className="text-lg font-bold text-white">⚡ Venda Rápida / Balcão</h2>
            <p className="text-xs text-neutral-400">Saída expressa de estoque e caixa para múltiplos itens e clientes</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl">✕</button>
        </div>

        {successMsg ? (
          <div className="p-16 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-3xl">✓</div>
            <h3 className="text-xl font-bold text-white">{successMsg}</h3>
            <p className="text-xs text-neutral-400">
              {isFiado
                ? "Lançado no crediário (contas a receber) e estoque baixado."
                : "Registrado no financeiro e caixa."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            {/* Products Grid */}
            <div className="lg:col-span-7 p-6 border-b lg:border-b-0 lg:border-r border-neutral-800 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Selecione os Produtos</h3>
                <p className="text-[10px] text-neutral-500">Ajuste a quantidade e o peso pelos botões +/− no carrinho</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-8 text-center">
                    <p className="text-2xl">⚡</p>
                    <p className="mt-2 text-sm font-semibold text-white">Nenhum item no Cardápio Rápido</p>
                    <p className="mt-1 text-xs text-neutral-500">Marque itens em <span className="text-neutral-400">Cardápio → ⚡ Rápido</span> para aparecerem aqui.</p>
                  </div>
                ) : (
                  products.map((p) => {
                    const esgotado = p.controlarEstoque && (p.estoque ?? 0) <= 0;
                    const estoqueBaixo = p.controlarEstoque && !esgotado && (p.estoque ?? 0) <= 5;
                    return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={esgotado}
                      onClick={() => handleAddProduct(p)}
                      className={`flex flex-col items-center justify-between rounded-xl border p-3 text-center transition-all group ${
                        esgotado
                          ? "cursor-not-allowed border-neutral-800 bg-neutral-950 opacity-50"
                          : "border-neutral-800 bg-neutral-950 hover:border-wine-500 hover:bg-neutral-900"
                      }`}
                    >
                      <div className="relative h-12 w-12 rounded-lg bg-neutral-800 overflow-hidden mb-2 flex items-center justify-center">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <span className="text-lg font-bold text-neutral-500">{p.name.charAt(0)}</span>
                        )}
                        {esgotado && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70 text-[9px] font-bold text-red-400">ESGOTADO</span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-white line-clamp-2">{p.name}</span>
                      <span className="text-xs font-bold text-emerald-400 mt-1">
                        R$ {p.price.toFixed(2).replace(".", ",")}{p.isCustomWeight && "/kg"}
                      </span>
                      {p.controlarEstoque && !esgotado && (
                        <span className={`text-[10px] font-semibold mt-0.5 ${estoqueBaixo ? "text-amber-400" : "text-neutral-500"}`}>
                          {formatItemQty(p.estoque ?? 0, !!p.isCustomWeight)} disp.
                        </span>
                      )}
                    </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Cart & Payment Summary */}
            <div className="lg:col-span-5 p-6 bg-neutral-950/60 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    {isFiado ? "Cliente (Obrigatório para Fiado)" : "Cliente (Opcional - Fidelidade/Promoções)"}
                  </label>
                  {isFiado && (
                    <input
                      type="text"
                      value={clienteBusca}
                      onChange={(e) => setClienteBusca(e.target.value)}
                      placeholder="Buscar cliente por nome ou telefone..."
                      className="mb-2 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-wine-500 focus:outline-none"
                    />
                  )}
                  <select
                    value={selectedClienteId}
                    onChange={(e) => setSelectedClienteId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white focus:border-wine-500 focus:outline-none"
                  >
                    <option value="">
                      {isFiado ? "— Selecione o cliente —" : "Consumidor Final (Balcão / Anônimo)"}
                    </option>
                    {clientesFiltrados.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({formatarTelefone(c.phone)})</option>
                    ))}
                  </select>

                  {isFiado && (
                    <div className="mt-2 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                      {!cust ? (
                        <p className="text-xs font-semibold text-amber-400">
                          ⚠ Selecione um cliente para vender a prazo / fiado.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-neutral-950 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                              Saldo devedor
                            </p>
                            <p className={`mt-0.5 text-sm font-bold ${saldoDevedor > 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {formatCurrency(saldoDevedor)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-neutral-950 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                              Limite disponível
                            </p>
                            <p className="mt-0.5 text-sm font-bold text-white">
                              {limiteDisponivel !== null ? formatCurrency(limiteDisponivel) : "não informado"}
                            </p>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-medium text-neutral-400 mb-1">
                          Vencimento (contas a receber)
                        </label>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Itens no Carrinho ({cart.reduce((s, i) => s + (i.product.isCustomWeight ? 1 : i.quantity), 0)})</h3>
                  <p className="text-[10px] text-neutral-500">🎁 Marque um item como brinde para zerar o valor</p>
                </div>
                {cart.length === 0 ? (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center">
                    <p className="text-xs text-neutral-500">Nenhum item selecionado.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={`${item.product.id}${item.is_brinde ? "-b" : ""}`}
                        className={`flex items-center justify-between rounded-xl border p-3 ${
                          item.is_brinde
                            ? "border-emerald-600/50 bg-emerald-950/40"
                            : "border-neutral-800 bg-neutral-900"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs font-semibold text-white truncate">
                            {item.is_brinde && "🎁 "}
                            {item.product.name}
                          </p>
                          <p className={`text-[10px] ${item.is_brinde ? "font-bold text-emerald-400" : "text-emerald-400"}`}>
                            {item.is_brinde ? (
                              item.product.isCustomWeight
                                ? `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg • BRINDE — R$ 0,00`
                                : `${item.quantity}x • BRINDE — R$ 0,00`
                            ) : item.product.isCustomWeight ? (
                              `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg • ${formatCurrency(item.product.price * item.quantity)}`
                            ) : (
                              `${item.quantity}x • ${formatCurrency(item.product.price * item.quantity)}`
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleBrinde(item.product.id)}
                            title={item.is_brinde ? "Remover brinde manual (item volta a ser cobrado)" : "Adicionar Brinde Manual (item zerado no total)"}
                            className={`h-7 w-7 rounded-lg border text-xs transition-all ${
                              item.is_brinde
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                                : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-emerald-500 hover:text-emerald-300"
                            }`}
                          >
                            🎁
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.product.isCustomWeight ? -0.1 : -1, item.is_brinde)}
                            className="h-7 w-7 rounded-lg border border-neutral-700 bg-neutral-800 text-xs font-bold text-white hover:bg-neutral-700"
                          >
                            -
                          </button>
                          <span className="w-10 text-center text-xs font-bold text-white">
                            {item.product.isCustomWeight ? `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.product.isCustomWeight ? 0.1 : 1, item.is_brinde)}
                            className="h-7 w-7 rounded-lg border border-neutral-700 bg-neutral-800 text-xs font-bold text-white hover:bg-neutral-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 border-t border-neutral-800 pt-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">Forma de Pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "pix", label: "PIX" },
                      { id: "dinheiro", label: "Dinheiro" },
                      { id: "cartao_debito", label: "Débito" },
                      { id: "cartao_credito", label: "Crédito" },
                      { id: "fiado", label: "Fiado / Crediário", span: true },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${m.span ? "col-span-2" : ""} ${
                          paymentMethod === m.id
                            ? "border-wine-500 bg-wine-500/20 text-wine-300"
                            : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === "dinheiro" && (
                  <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <div>
                      <label className="block text-[10px] font-medium text-neutral-400 mb-1">Valor Recebido (Dinheiro)</label>
                      <input
                        type="text"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        placeholder="Ex: 50,00"
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                      />
                    </div>
                    {cashNum >= total && (
                      <div className="flex justify-between text-xs pt-1">
                        <span className="text-neutral-400">Troco:</span>
                        <span className="font-bold text-emerald-400">{formatCurrency(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl bg-neutral-900 p-4 border border-neutral-800">
                  <span className="text-sm font-semibold text-white">Total a Pagar</span>
                  <span className="text-xl font-bold text-emerald-400">{formatCurrency(total)}</span>
                </div>

                {itensBrinde.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-600/40 bg-emerald-950/40 px-4 py-2">
                    <span className="text-xs font-bold text-emerald-400">
                      🎁 Brinde ({itensBrinde.length} item{itensBrinde.length === 1 ? "" : "s"})
                    </span>
                    <span className="text-xs font-bold">
                      <span className="text-neutral-500 line-through">{formatCurrency(valorBrinde)}</span>
                      <span className="text-emerald-400"> → R$ 0,00</span>
                    </span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-neutral-700 px-4 py-3 text-xs font-medium text-neutral-400 hover:bg-neutral-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={loading || cart.length === 0 || (isFiado && !selectedClienteId)}
                    onClick={handleFinalizeSale}
                    className="flex-1 rounded-xl bg-wine-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-wine-500/20 hover:bg-wine-600 disabled:opacity-50"
                  >
                    {loading ? "Processando..." : isFiado ? "Finalizar a Prazo" : "Finalizar Venda"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
