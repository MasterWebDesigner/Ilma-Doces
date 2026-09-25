"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useCartStore, useOrderStore, useCustomerStore, useProductStore } from "@/lib/store";
import { useCredoresStore } from "@/lib/credoresStore";
import type { Order, PaymentMethod, DeliveryType } from "@/types/database";
import { formatCurrency, formatItemQty, formatWeightKg } from "@/lib/utils";
import { openWhatsApp } from "@/lib/whatsapp";
import { useNotificationStore, playNotificationSound } from "@/lib/notifications";
import { useStoreConfig } from "@/lib/storeConfig";
import {
  paidSubtotal,
  brindeProgress,
  itemLineTotal,
  availableBrindeFlavors,
} from "@/lib/brinde";
import { computeLoyaltyBalance, loyaltyProgress } from "@/lib/fidelidade";
import { validarEstoqueServidor, listarSemEstoque } from "@/lib/stockGuard";

const WINE = "#8B1D22";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; emoji: string }[] = [
  { value: "pix", label: "Pix", emoji: "💠" },
  { value: "cartao_credito", label: "Cartão de Crédito", emoji: "💳" },
  { value: "cartao_debito", label: "Cartão de Débito", emoji: "💳" },
  { value: "dinheiro", label: "Dinheiro", emoji: "💵" },
];

export default function CartDrawer() {
  const { items, isOpen, setOpen, removeItem, updateQuantity, updateNotes, setBrinde, clearBrinde, clearCart } = useCartStore();
  const config = useStoreConfig();
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const orders = useOrderStore((s) => s.orders);
  const customers = useCustomerStore((s) => s.customers);
  const credores = useCredoresStore((s) => s.credores);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
  const [validationError, setValidationError] = useState("");
  const [flavorOpen, setFlavorOpen] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [nameValue, setNameValue] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("retirada");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [trocoValue, setTrocoValue] = useState("");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrNumber, setAddrNumber] = useState("");
  const [addrDistrict, setAddrDistrict] = useState("");
  const [addrComplement, setAddrComplement] = useState("");
  const [redeemedPhones, setRedeemedPhones] = useState<Record<string, number>>({});
  const addOrder = useOrderStore((s) => s.addOrder);
  const upsertCustomer = useCustomerStore((s) => s.upsertCustomer);
  const resgatarBrinde = useCustomerStore((s) => s.resgatarBrinde);
  const phoneDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subtotal = paidSubtotal(items);
  const brindeAtivo = config.brindeAtivo;
  const progress = brindeProgress(subtotal);
  const brindeItem = items.find((i) => i.is_brinde);
  const brindeDiscount = items
    .filter((i) => i.is_brinde)
    .reduce((s, i) => s + (i.product.price || 0), 0);
  const deliveryFee = deliveryType === "entrega" ? config.deliveryFee : 0;
  const totalGeral = subtotal + deliveryFee;
  const flavors = useMemo(
    () => availableBrindeFlavors(products, categories),
    [products, categories, config.brindeCategoriaId, brindeAtivo]
  );

  const phoneClean = phoneValue.replace(/\D/g, "");
  const loyalty = useMemo(() => {
    if (phoneClean.length < 10) return null;
    const base = computeLoyaltyBalance(phoneClean, nameValue || undefined, orders, credores, customers);
    const forced = redeemedPhones[phoneClean];
    const balance = forced !== undefined ? forced : base.balance;
    const prog = loyaltyProgress(balance, config.valorMinimoBrinde);
    return { ...base, balance, ...prog, name: nameValue };
  }, [phoneClean, nameValue, orders, credores, customers, redeemedPhones, config.valorMinimoBrinde]);

  useEffect(() => {
    if (!brindeAtivo && items.some((i) => i.is_brinde)) clearBrinde();
  }, [brindeAtivo, items, clearBrinde]);

  useEffect(() => {
    return () => {
      if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    };
  }, []);

  if (!isOpen) return null;

  function resetCheckoutFields() {
    setValidationError("");
    setFlavorOpen(false);
    setPhoneValue("");
    setNameValue("");
    setDeliveryType("retirada");
    setPaymentMethod("pix");
    setTrocoValue("");
    setAddrStreet("");
    setAddrNumber("");
    setAddrDistrict("");
    setAddrComplement("");
    setRedeemedPhones({});
  }

  async function handleConfirm() {
    setValidationError("");

    const name = nameValue.trim();
    const phone = phoneValue.trim();

    if (!name) { setValidationError("Informe seu nome completo"); return; }
    if (phone.replace(/\D/g, "").length < 10) { setValidationError("Informe um telefone válido"); return; }

    let address: string | undefined;
    if (deliveryType === "entrega") {
      if (!addrStreet.trim()) { setValidationError("Informe o endereço"); return; }
      if (!addrNumber.trim()) { setValidationError("Informe o número"); return; }
      if (!addrDistrict.trim()) { setValidationError("Informe o bairro"); return; }
      const complement = addrComplement.trim() ? ` — ${addrComplement.trim()}` : "";
      address = `${addrStreet.trim()}, ${addrNumber.trim()} - ${addrDistrict.trim()}${complement}`;
    }

    const trocoNum = paymentMethod === "dinheiro" && trocoValue
      ? parseFloat(trocoValue.replace(/\./g, "").replace(",", ".")) || 0
      : undefined;

    const itensParaPedido = items.filter((i) => !i.is_brinde);

    for (const item of itensParaPedido) {
      if (item.product.controlarEstoque && item.quantity > (item.product.estoque ?? 0)) {
        const disp = Math.max(0, item.product.estoque ?? 0);
        setValidationError(
          `Sem estoque: ${item.product.name} (disponível: ${disp}, no carrinho: ${item.quantity}). Ajuste a quantidade.`
        );
        return;
      }
    }

    const check = await validarEstoqueServidor(
      items.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
    );
    if (!check.ok) {
      setValidationError(
        `Sem estoque no servidor: ${listarSemEstoque(check.insufficient)}. Ajuste o carrinho para finalizar.`
      );
      return;
    }

    const order = addOrder({
      customerName: name,
      customerPhone: phone.replace(/\D/g, ""),
      items: [...items],
      total: totalGeral,
      deliveryType,
      address,
      paymentMethod,
      trocoPara: trocoNum,
      origem: "site",
      status: "pendente",
    });

    useNotificationStore.getState().addNotification({
      title: "Novo Pedido!",
      message: `${name} — ${formatCurrency(totalGeral)} (${deliveryType === "entrega" ? "Entrega" : "Retirada"})`,
      type: "order",
    });
    playNotificationSound();

    openWhatsApp(order.items, {
      customerName: order.customerName,
      customerPhone: phone,
      deliveryType,
      address,
      paymentMethod,
      trocoPara: trocoNum,
      deliveryFee,
      storePhone: config.storePhone,
    });

    setConfirmedOrder(order);
    setRedeemedPhones({});
    clearCart();
  }

  function handleClose() {
    setConfirmedOrder(null);
    setCheckoutOpen(false);
    resetCheckoutFields();
    setOpen(false);
  }

  function handlePhoneChange(raw: string) {
    setPhoneValue(raw);
    setValidationError("");
    if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    phoneDebounce.current = setTimeout(() => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 10) {
        const match = customers.find((c) => (c.phone || "").replace(/\D/g, "") === digits);
        if (match && !nameValue) setNameValue(match.name);
      }
    }, 300);
  }

  function handleRedeemLoyalty() {
    if (!loyalty || !loyalty.eligible || brindeItem) return;
    setFlavorOpen(true);
  }

  function handleSelectLoyaltyFlavor(productId: string) {
    const flavor = flavors.find((f) => f.id === productId);
    if (!flavor || !loyalty) return;
    setBrinde(flavor);
    setFlavorOpen(false);
    resgatarBrinde(phoneClean, loyalty.autoTotal, nameValue || undefined);
    setRedeemedPhones((prev) => ({ ...prev, [phoneClean]: 0 }));
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  };

  const stepLabel = confirmedOrder
    ? "Pedido Confirmado"
    : checkoutOpen
      ? "Finalizar Pedido"
      : "Seu Carrinho";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="cart-drawer relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-neutral-950 dark:text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{stepLabel}</h2>
            <div className="mt-1 h-0.5 w-10" style={{ backgroundColor: WINE }} />
          </div>
          <button
            onClick={handleClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        {/* Step progress */}
        {checkoutOpen && (
          <div className="h-1 w-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: confirmedOrder ? "100%" : "66%",
                backgroundColor: WINE,
              }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ─── STEP 1: Cart ─── */}
          {!checkoutOpen && !confirmedOrder && (
            items.length === 0 ? (
              <div className="py-12 text-center text-neutral-400">
                <p className="text-lg font-semibold text-neutral-600 dark:text-neutral-300">Seu carrinho esta vazio.</p>
                <button
                  onClick={handleClose}
                  className="mt-4 text-xs font-semibold transition-colors"
                  style={{ color: WINE }}
                >
                  Voltar ao cardapio
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Fidelity bar */}
                {brindeAtivo && (
                  !progress.eligible ? (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2 dark:border-neutral-800 dark:bg-neutral-900">
                      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Adicione mais {formatCurrency(progress.remaining)} em doces e ganhe 1 brinde de fidelidade!
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress.percent}%`, backgroundColor: WINE }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-medium text-neutral-500">
                        <span>{formatCurrency(subtotal)}</span>
                        <span>{formatCurrency(config.valorMinimoBrinde)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2 dark:border-emerald-900 dark:bg-emerald-950">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        🎉 Parabéns! Você ganhou 1 brinde de fidelidade!
                      </p>
                      {brindeItem ? (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-900 dark:bg-neutral-900">
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            {brindeItem.product.name}
                          </span>
                          <button
                            onClick={() => setFlavorOpen(true)}
                            className="text-[10px] font-bold transition-opacity hover:opacity-80"
                            style={{ color: WINE }}
                          >
                            Trocar sabor
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                            Escolha o sabor disponível em estoque:
                          </p>
                          <button
                            onClick={() => setFlavorOpen((v) => !v)}
                            className="w-full rounded-lg border-2 border-dashed border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-neutral-900 dark:hover:bg-emerald-950"
                          >
                            {flavorOpen ? "Fechar seletor" : "🎁 Escolher sabor do Brinde"}
                          </button>
                          {flavorOpen && (
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {flavors.length === 0 && (
                                <p className="text-[11px] text-neutral-500">Nenhum item do brinde em estoque no momento.</p>
                              )}
                              {flavors.map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setBrinde(f);
                                    setFlavorOpen(false);
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-neutral-700 dark:bg-neutral-900"
                                >
                                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">{f.name}</span>
                                  <span className="font-bold text-emerald-600">GRÁTIS</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                )}

                {/* Items */}
                <ul className="space-y-3">
                  {items.filter((item) => brindeAtivo || !item.is_brinde).map((item) => (
                    <li
                      key={`${item.product.id}${item.is_brinde ? "-brinde" : ""}`}
                      className={`rounded-xl border p-3 space-y-2 ${
                        item.is_brinde
                          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40"
                          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          {item.product.image_url ? (
                            <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-400">
                              {item.product.name.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-neutral-900 dark:text-white">{item.product.name}</p>
                          {item.is_brinde ? (
                            <p className="text-xs font-bold">
                              <span className="text-neutral-400 line-through">{formatCurrency(item.product.price)}</span>{" "}
                              <span className="text-emerald-600">GRÁTIS (R$ 0,00)</span>
                            </p>
                          ) : (
                            <p className="text-xs font-bold" style={{ color: WINE }}>
                              {item.product.isCustomWeight
                                ? `${formatWeightKg(item.quantity)} × ${formatCurrency(item.product.price)}/kg`
                                : formatCurrency(item.product.price)}
                            </p>
                          )}
                          {item.is_brinde && (
                            <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-600">
                              🎁 BRINDE FIDELIDADE
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => removeItem(item.product.id)}
                            className="text-xs text-neutral-400 transition-colors hover:text-red-500"
                            aria-label="Remover"
                          >
                            ✕
                          </button>
                          {item.is_brinde ? (
                            <span className="text-[10px] font-bold text-emerald-600">1 un</span>
                          ) : item.product.isCustomWeight ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateQuantity(item.product.id, Math.max(1, Math.round((parseFloat(e.target.value.replace(",", ".")) || 1) * 2) / 2))}
                                className="w-16 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-center text-xs font-bold text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                                title="Peso (kg)"
                              />
                              <span className="text-[10px] font-semibold text-neutral-400">kg</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-xs font-bold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {!item.is_brinde && (
                        <div>
                          <button
                            onClick={() => setExpandedNotes(expandedNotes === item.product.id ? null : item.product.id)}
                            className="text-[11px] text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                          >
                            {item.notes ? `✎ ${item.notes}` : "+ Adicionar observação"}
                          </button>
                          {expandedNotes === item.product.id && (
                            <input
                              type="text"
                              placeholder="Ex: Sem açúcar, com cobertura extra..."
                              value={item.notes || ""}
                              onChange={(e) => updateNotes(item.product.id, e.target.value)}
                              className="mt-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                              autoFocus
                            />
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {items.some((i) => i.product.isCustomWeight) && (
                  <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-[10px] leading-relaxed text-neutral-500 italic dark:bg-neutral-900">
                    💡 Nota: Por se tratar de um produto 100% artesanal, o peso final do bolo pode sofrer pequenas variações. O valor final exato será confirmado na aprovação do pedido.
                  </p>
                )}

                <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <span className="text-sm text-neutral-500">Subtotal</span>
                  <span className="text-lg font-bold text-neutral-900 dark:text-white">{formatCurrency(subtotal)}</span>
                </div>
              </div>
            )
          )}

          {/* ─── STEP 2: Checkout ─── */}
          {checkoutOpen && !confirmedOrder && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: WINE }}>
                  Resumo do Pedido
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={`${item.product.id}${item.is_brinde ? "-brinde" : ""}`} className="space-y-0.5">
                      <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400">
                        <span>
                          {item.is_brinde && "🎁 "}
                          {item.product.name} {formatItemQty(item.quantity, item.product.isCustomWeight)}
                          {item.is_brinde && (
                            <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-600">
                              BRINDE
                            </span>
                          )}
                        </span>
                        {item.is_brinde ? (
                          <span className="font-semibold text-emerald-600">
                            <span className="mr-1 text-neutral-400 line-through">{formatCurrency(item.product.price)}</span>
                            R$ 0,00
                          </span>
                        ) : (
                          <span className="font-semibold">{formatCurrency(itemLineTotal(item))}</span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="pl-2 text-[11px] text-neutral-400">obs: {item.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados do Cliente */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Dados do Cliente</p>
                <div>
                  <label className="label-field">WhatsApp / Celular <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    className="input-field"
                    placeholder="(11) 99999-9999"
                    value={phoneValue}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label-field">Nome Completo <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    placeholder="Seu nome completo"
                    value={nameValue}
                    onChange={(e) => { setNameValue(e.target.value); setValidationError(""); }}
                  />
                </div>

                {/* Loyalty */}
                {brindeAtivo && loyalty && phoneClean.length >= 10 && (
                  <div
                    className={`rounded-xl border p-3 space-y-2 ${
                      loyalty.eligible
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
                        : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${loyalty.eligible ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                      {loyalty.eligible
                        ? "Parabéns! Você tem 1 Gelinho disponível para resgatar! 🎉"
                        : `Fidelidade: falta ${formatCurrency(loyalty.remaining)} para 1 Gelinho grátis!`}
                    </p>
                    <div className={`h-2 w-full overflow-hidden rounded-full ${loyalty.eligible ? "bg-emerald-100 dark:bg-emerald-950" : "bg-neutral-200 dark:bg-neutral-800"}`}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${loyalty.percent}%`,
                          backgroundColor: loyalty.eligible ? "#10b981" : WINE,
                        }}
                      />
                    </div>
                    <div className={`flex justify-between text-[10px] font-medium ${loyalty.eligible ? "text-emerald-600" : "text-neutral-500"}`}>
                      <span>{formatCurrency(loyalty.balance)}</span>
                      <span>
                        {formatCurrency(config.valorMinimoBrinde)} — {Math.round(loyalty.percent)}%
                        {loyalty.eligible ? " — Pronto p/ Brinde" : ""}
                      </span>
                    </div>

                    {loyalty.eligible && !brindeItem && (
                      <button
                        type="button"
                        onClick={handleRedeemLoyalty}
                        className="w-full rounded-lg border-2 border-dashed border-emerald-400 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-neutral-900 dark:hover:bg-emerald-950"
                      >
                        {flavorOpen ? "Fechar seletor" : "🎁 Resgatar Gelinho Nesta Compra"}
                      </button>
                    )}

                    {loyalty.eligible && flavorOpen && (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {flavors.length === 0 && (
                          <p className="text-[11px] text-neutral-500">Nenhum item do brinde em estoque no momento.</p>
                        )}
                        {flavors.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleSelectLoyaltyFlavor(f.id)}
                            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">{f.name}</span>
                            <span className="font-bold text-emerald-600">GRÁTIS</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {loyalty.eligible && brindeItem && (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-900 dark:bg-neutral-900">
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          🎁 {brindeItem.product.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFlavorOpen(true)}
                          className="text-[10px] font-bold transition-opacity hover:opacity-80"
                          style={{ color: WINE }}
                        >
                          Trocar sabor
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Entrega / Retirada */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Entrega / Retirada</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryType("retirada")}
                    className={`rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all ${
                      deliveryType === "retirada"
                        ? "text-white shadow-md"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
                    style={
                      deliveryType === "retirada"
                        ? { borderColor: WINE, backgroundColor: WINE }
                        : undefined
                    }
                  >
                    🏪 Retirada na Loja
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Delivery temporariamente indisponível"
                    className="cursor-not-allowed rounded-xl border-2 border-neutral-200 bg-neutral-100 px-3 py-3 text-xs font-semibold text-neutral-400 opacity-70 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-500"
                  >
                    🚚 Entrega / Delivery
                    <span className="mt-1 block text-[10px] font-medium">Indisponível no momento</span>
                  </button>
                </div>

                {deliveryType === "entrega" && (
                  <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="grid grid-cols-[1fr_80px] gap-2">
                      <div>
                        <label className="label-field">Endereço <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Rua / Avenida"
                          value={addrStreet}
                          onChange={(e) => { setAddrStreet(e.target.value); setValidationError(""); }}
                        />
                      </div>
                      <div>
                        <label className="label-field">Número <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="123"
                          value={addrNumber}
                          onChange={(e) => { setAddrNumber(e.target.value); setValidationError(""); }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label-field">Bairro <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Centro"
                          value={addrDistrict}
                          onChange={(e) => { setAddrDistrict(e.target.value); setValidationError(""); }}
                        />
                      </div>
                      <div>
                        <label className="label-field">Complemento</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Apto, bloco..."
                          value={addrComplement}
                          onChange={(e) => setAddrComplement(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Taxa de entrega: <span className="font-bold" style={{ color: WINE }}>{formatCurrency(config.deliveryFee)}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Pagamento */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Forma de Pagamento</p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-xs font-semibold transition-all ${
                        paymentMethod === opt.value
                          ? "text-white shadow-md"
                          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900"
                      }`}
                      style={
                        paymentMethod === opt.value
                          ? { borderColor: WINE, backgroundColor: WINE }
                          : undefined
                      }
                    >
                      <span className="text-lg">{opt.emoji}</span>
                      <span className="text-center leading-tight">{opt.label}</span>
                    </button>
                  ))}
                </div>
                {paymentMethod === "dinheiro" && (
                  <div>
                    <label className="label-field">Precisa de troco para quanto? (opcional)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input-field"
                      placeholder="Ex: 100,00"
                      value={trocoValue}
                      onChange={(e) => setTrocoValue(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Resumo Financeiro */}
              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: WINE }}>
                  Resumo Financeiro
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                    <span>Subtotal dos Produtos</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">{formatCurrency(subtotal)}</span>
                  </div>
                  {deliveryType === "entrega" && (
                    <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                      <span>Taxa de Entrega</span>
                      <span className="font-semibold text-neutral-900 dark:text-white">{formatCurrency(deliveryFee)}</span>
                    </div>
                  )}
                  {brindeDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Desconto / Brinde Resgatado</span>
                      <span className="font-semibold">− {formatCurrency(brindeDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700">
                    <span className="text-base font-bold text-neutral-900 dark:text-white">Total Geral</span>
                    <span className="text-lg font-bold" style={{ color: WINE }}>{formatCurrency(totalGeral)}</span>
                  </div>
                </div>
              </div>

              {validationError && (
                <p className="text-center text-xs font-medium text-red-500">{validationError}</p>
              )}
            </div>
          )}

          {/* ─── STEP 3: Confirmed ─── */}
          {confirmedOrder && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950">
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Pedido Enviado!</p>
                <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
                  Pedido registrado e WhatsApp aberto com o resumo.
                </p>
                <p className="mt-2 text-xs text-emerald-500">Protocolo: {confirmedOrder.orderNumber || confirmedOrder.id.slice(-8)}</p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: WINE }}>
                  Detalhes do Pedido
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Cliente</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">{confirmedOrder.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Tipo</span>
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {confirmedOrder.deliveryType === "entrega" ? "Entrega" : "Retirada"}
                    </span>
                  </div>
                  {confirmedOrder.address && (
                    <div className="flex justify-between gap-3">
                      <span className="shrink-0 text-neutral-500">Endereço</span>
                      <span className="text-right font-semibold text-neutral-900 dark:text-white">{confirmedOrder.address}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Pagamento</span>
                    <span className="font-semibold capitalize text-neutral-900 dark:text-white">
                      {PAYMENT_OPTIONS.find((p) => p.value === confirmedOrder.paymentMethod)?.label || confirmedOrder.paymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700 font-bold">
                    <span className="text-neutral-900 dark:text-white">Total</span>
                    <span style={{ color: WINE }}>{formatCurrency(confirmedOrder.total)}</span>
                  </div>
                </div>
              </div>

              <p className="text-center text-xs text-neutral-500">
                A Ilma irá confirmar a disponibilidade e o horário pelo WhatsApp.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
          {/* Cart step */}
          {!checkoutOpen && !confirmedOrder && items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Subtotal</span>
                <span className="text-xl font-bold text-neutral-900 dark:text-white">{formatCurrency(subtotal)}</span>
              </div>
              <button
                onClick={() => { setCheckoutOpen(true); setValidationError(""); }}
                className="btn w-full text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                style={{ backgroundColor: WINE }}
              >
                Finalizar Pedido
              </button>
              <button
                onClick={clearCart}
                className="w-full text-center text-xs text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Limpar carrinho
              </button>
            </div>
          )}

          {/* Checkout step */}
          {checkoutOpen && !confirmedOrder && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCheckoutOpen(false); setValidationError(""); }}
                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                style={{ backgroundColor: WINE }}
              >
                Finalizar Pedido via WhatsApp
              </button>
            </div>
          )}

          {/* Confirmed */}
          {confirmedOrder && (
            <button
              onClick={handleClose}
              className="btn w-full text-white shadow-lg transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: WINE }}
            >
              Continuar Comprando
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
