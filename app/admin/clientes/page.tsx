"use client";

import { useState, useMemo, useEffect } from "react";
import { useCustomerStore, useOrderStore, useProductStore, useExpenseStore, useFichaTecnicaStore } from "@/lib/store";
import { montarDespesaBrinde } from "@/lib/brindeCusto";
import { useCredoresStore } from "@/lib/credoresStore";
import { formatCurrency, getLocalDateStr } from "@/lib/utils";
import { useStoreConfig, saveStoreConfig } from "@/lib/storeConfig";
import { computeLoyaltyBalance, loyaltyProgress, loyaltyProgressLabel } from "@/lib/fidelidade";
import { availableBrindeFlavors } from "@/lib/brinde";
import { formatarTelefone, mascaraTelefone, higienizarTelefone, estadoTelefone, MENSAGEM_WHATSAPP_INVALIDO } from "@/lib/phone";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_producao: "Em Producao",
  pronto: "Pronto",
  saiu_entrega: "Saiu p/ Entrega",
  concluido: "Concluido",
};

export default function AdminClientes() {
  const customers = useCustomerStore((s) => s.customers);
  const upsertCustomer = useCustomerStore((s) => s.upsertCustomer);
  const setFidelidadeOffset = useCustomerStore((s) => s.setFidelidadeOffset);
  const resgatarBrinde = useCustomerStore((s) => s.resgatarBrinde);
  const orders = useOrderStore((s) => s.orders);
  const credores = useCredoresStore((s) => s.credores);
  const storeConfig = useStoreConfig();
  const brindeAtivo = storeConfig.brindeAtivo;
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const deductStock = useProductStore((s) => s.deductStock);
  const adjustStock = useProductStore((s) => s.adjustStock);
  const addExpense = useExpenseStore((s) => s.addExpense);
  const fichas = useFichaTecnicaStore((s) => s.fichas);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", referencia: "" });
  const [phoneError, setPhoneError] = useState("");
  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null);
  const [fidelidadeEdit, setFidelidadeEdit] = useState<{ phone: string; phoneClean: string; name: string; balance: number; autoTotal: number } | null>(null);
  const [fidelidadeForm, setFidelidadeForm] = useState("");
  const [showFidelidade, setShowFidelidade] = useState(true);
  const [metaForm, setMetaForm] = useState("");
  const [resgateTarget, setResgateTarget] = useState<{ phone: string; phoneClean: string; name: string; balance: number; autoTotal: number } | null>(null);
  const [resgateSabor, setResgateSabor] = useState("");

  const valorMinimoBrinde = storeConfig.valorMinimoBrinde || 80;
  const saboresDisponiveis = useMemo(() => availableBrindeFlavors(products, categories), [products, categories]);

  useEffect(() => {
    setMetaForm(valorMinimoBrinde.toFixed(2).replace(".", ","));
  }, [valorMinimoBrinde]);

  function getOrderBadge(referenciaId?: string) {
    if (!referenciaId) return null;
    const ord = orders.find((o) => o.id === referenciaId);
    const num = ord?.orderNumber || referenciaId.slice(-6);
    return (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-wine-500/15 border border-wine-500/30 px-2 py-0.5 text-[10px] font-bold text-wine-400">
        🏷️ Pedido #{num}
      </span>
    );
  }

  const customersWithMetrics = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string; phone: string; lastOrderDate?: string; referencia?: string }>();

    customers.forEach((c) => {
      const key = (c.phone ? c.phone.replace(/\D/g, "") : "") || c.name.toLowerCase().trim();
      if (key) {
        customerMap.set(key, { id: c.id, name: c.name, phone: c.phone, lastOrderDate: c.lastOrderDate, referencia: c.referencia });
      }
    });

    orders.forEach((o) => {
      if (!o.customerName) return;
      const phoneClean = o.customerPhone ? o.customerPhone.replace(/\D/g, "") : "";
      const key = phoneClean || o.customerName.toLowerCase().trim();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: "cli-ord-" + (phoneClean || o.customerName),
          name: o.customerName,
          phone: o.customerPhone || "",
          lastOrderDate: o.createdAt,
        });
      } else {
        const existing = customerMap.get(key)!;
        if (!existing.phone && o.customerPhone) existing.phone = o.customerPhone;
        if (!existing.name && o.customerName) existing.name = o.customerName;
      }
    });

    credores.forEach((cr) => {
      if (!cr.nome) return;
      const phoneClean = cr.whatsapp ? cr.whatsapp.replace(/\D/g, "") : "";
      const key = phoneClean || cr.nome.toLowerCase().trim();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: cr.id || "cli-cred-" + (phoneClean || cr.nome),
          name: cr.nome,
          phone: cr.whatsapp || "",
          lastOrderDate: cr.compras?.[0]?.data,
        });
      } else {
        const existing = customerMap.get(key)!;
        if (!existing.phone && cr.whatsapp) existing.phone = cr.whatsapp;
        if (!existing.name && cr.nome) existing.name = cr.nome;
      }
    });

    return Array.from(customerMap.values()).map((c) => {
      const phoneClean = c.phone ? c.phone.replace(/\D/g, "") : "";
      const nameLower = c.name.toLowerCase().trim();

      const customerOrders = orders.filter((o) => {
        const oPhone = o.customerPhone ? o.customerPhone.replace(/\D/g, "") : "";
        const oName = (o.customerName || "").toLowerCase().trim();
        return (phoneClean && oPhone && phoneClean === oPhone) || (nameLower && oName && nameLower === oName);
      });
      const completedOrders = customerOrders.filter((o) => o.status === "concluido");

      const credorCompras = credores
        .filter((cr) => {
          const crPhone = cr.whatsapp ? cr.whatsapp.replace(/\D/g, "") : "";
          const crName = (cr.nome || "").toLowerCase().trim();
          return (phoneClean && crPhone && phoneClean === crPhone) || (nameLower && crName && nameLower === crName);
        })
        .flatMap((cr) => (cr.compras || []).map((comp) => ({ credor: cr.nome, compra: comp })));

      const pendingCredorTotal = credorCompras.reduce(
        (sum, { compra }) => sum + (Number(compra.valorPendente ?? compra.valor) || 0),
        0
      );

      const manualCredorCompras = credorCompras.filter(
        ({ compra }) => compra.origem !== "pedido" && !compra.referenciaId
      );
      const totalManualCredor = manualCredorCompras.reduce(
        (sum, { compra }) => sum + (Number(compra.valor) || 0),
        0
      );

      const targetOrders = completedOrders.length > 0 ? completedOrders : customerOrders;
      const totalOrders = targetOrders.length;
      const totalSpent = targetOrders.reduce((sum, o) => sum + (o.total || 0), 0) + totalManualCredor;
      const lastOrderDate =
        targetOrders.length > 0
          ? targetOrders.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0].createdAt
          : c.lastOrderDate || (credorCompras.length > 0 ? credorCompras[0].compra.data : new Date().toISOString());

      const status = totalOrders >= 3 ? "Ativa" : "Nova";
      const isDevedor = pendingCredorTotal > 0;
      const statusLabel = isDevedor ? "Devedor" : status;

      return {
        ...c,
        totalOrders,
        totalSpent,
        lastOrderDate,
        status: statusLabel,
        pendingCredorTotal,
        credorCompras,
      };
    });
  }, [customers, orders, credores]);

  const fidelidadeRows = useMemo(() => {
    return customersWithMetrics
      .map((c) => {
        const phoneClean = c.phone ? c.phone.replace(/\D/g, "") : "";
        const { autoTotal, balance } = computeLoyaltyBalance(
          phoneClean,
          c.name,
          orders,
          credores,
          customers
        );
        const prog = loyaltyProgress(balance, valorMinimoBrinde);
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          phoneClean,
          autoTotal,
          balance,
          ...prog,
          label: loyaltyProgressLabel(balance, valorMinimoBrinde),
        };
      })
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [customersWithMetrics, customers, orders, credores, valorMinimoBrinde]);

  const filtered = customersWithMetrics.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.referencia || "").toLowerCase().includes(q)
    );
  });

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case "name-asc":
        return arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      case "name-desc":
        return arr.sort((a, b) => b.name.localeCompare(a.name, "pt-BR"));
      case "orders-desc":
        return arr.sort((a, b) => b.totalOrders - a.totalOrders);
      case "orders-asc":
        return arr.sort((a, b) => a.totalOrders - b.totalOrders);
      case "spent-desc":
        return arr.sort((a, b) => b.totalSpent - a.totalSpent);
      default:
        return arr.sort((a, b) => new Date(b.lastOrderDate || 0).getTime() - new Date(a.lastOrderDate || 0).getTime());
    }
  }, [filtered, sortBy]);

  const historyKey = historyCustomer ? historyCustomer.trim() : "";
  const historyPhoneClean = historyKey.replace(/\D/g, "");
  const historyNameLower = historyKey.toLowerCase();

  const historyOrders = (historyKey
    ? orders.filter((o) => {
        const oPhone = o.customerPhone ? o.customerPhone.replace(/\D/g, "") : "";
        const oName = (o.customerName || "").toLowerCase().trim();
        return (historyPhoneClean && oPhone && oPhone === historyPhoneClean) || (historyNameLower && oName && oName === historyNameLower);
      })
    : []
  ).map((o) => ({ type: "pedido" as const, data: o }));

  const historyCredorCompras = historyKey
    ? credores
        .filter((cr) => {
          const crPhone = cr.whatsapp ? cr.whatsapp.replace(/\D/g, "") : "";
          const crName = (cr.nome || "").toLowerCase().trim();
          return (historyPhoneClean && crPhone && crPhone === historyPhoneClean) || (historyNameLower && crName && crName === historyNameLower);
        })
        .flatMap((cr) =>
          (cr.compras || [])
            .filter((comp) => comp.origem !== "pedido" && !comp.referenciaId)
            .map((comp) => ({ type: "credor" as const, data: { credor: cr.nome, compra: comp } }))
        )
    : [];

  const allHistory = [...historyOrders, ...historyCredorCompras].sort((a, b) => {
    const da = a.type === "pedido" ? a.data.createdAt : a.data.compra.data;
    const db = b.type === "pedido" ? b.data.createdAt : b.data.compra.data;
    return new Date(db).getTime() - new Date(da).getTime();
  });

  function openNew() {
    setEditId(null);
    setForm({ name: "", phone: "", referencia: "" });
    setPhoneError("");
    setShowModal(true);
  }

  function openEdit(c: { id: string; name: string; phone: string; referencia?: string }) {
    setEditId(c.id);
    setForm({ name: c.name, phone: mascaraTelefone(c.phone), referencia: c.referencia || "" });
    setPhoneError("");
    setShowModal(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    const phone = higienizarTelefone(form.phone);
    if (!phone) {
      setPhoneError(MENSAGEM_WHATSAPP_INVALIDO);
      return;
    }
    setPhoneError("");
    upsertCustomer(form.name.trim(), phone, form.referencia);
    setShowModal(false);
    setForm({ name: "", phone: "", referencia: "" });
    setEditId(null);
  }

  function openFidelidadeEdit(c: { phone: string; phoneClean: string; name: string; balance: number; autoTotal: number }) {
    setFidelidadeEdit(c);
    setFidelidadeForm(String(c.balance.toFixed(2).replace(".", ",")));
  }

  function handleFidelidadeSave() {
    if (!fidelidadeEdit) return;
    const raw = fidelidadeForm.replace(/\./g, "").replace(",", ".").trim();
    const desired = parseFloat(raw);
    if (Number.isNaN(desired) || desired < 0) return;
    setFidelidadeOffset(fidelidadeEdit.phone, Math.max(0, fidelidadeEdit.autoTotal - desired));
    setFidelidadeEdit(null);
    setFidelidadeForm("");
  }

  function handleSalvarMeta() {
    if (!brindeAtivo) return;
    const raw = metaForm.replace(/\./g, "").replace(",", ".").trim();
    const val = parseFloat(raw);
    if (Number.isNaN(val) || val < 0) return;
    saveStoreConfig({ ...storeConfig, valorMinimoBrinde: val });
  }

  function handleSalvarModoCategorias(todas: boolean) {
    if (!brindeAtivo) return;
    saveStoreConfig({ ...storeConfig, brindeTodasCategorias: todas });
  }

  function handleToggleCategoriaPromo(catId: string) {
    if (!brindeAtivo) return;
    const atual = Array.isArray(storeConfig.brindeCategoriasPromo) ? storeConfig.brindeCategoriasPromo : [];
    const next = atual.includes(catId) ? atual.filter((id) => id !== catId) : [...atual, catId];
    saveStoreConfig({ ...storeConfig, brindeTodasCategorias: false, brindeCategoriasPromo: next });
  }

  function handleResgatarGelinho(c: { phone: string; phoneClean: string; name: string; balance: number; autoTotal: number; eligible: boolean }) {
    if (!brindeAtivo || !c.eligible) return;
    setResgateTarget(c);
    setResgateSabor("");
  }

  function handleConfirmResgate() {
    if (!brindeAtivo || !resgateTarget || !resgateSabor) return;
    const sabor = products.find((p) => p.id === resgateSabor);
    if (!sabor) return;

    if (sabor.controlarEstoque) {
      deductStock(sabor.id, 1);
    } else if (typeof sabor.estoque === "number") {
      adjustStock(sabor.id, Math.max(0, sabor.estoque - 1));
    }

    resgatarBrinde(resgateTarget.phone, resgateTarget.autoTotal, resgateTarget.name);

    addExpense(
      montarDespesaBrinde(
        sabor,
        resgateTarget.name,
        fichas.find((f) => f.productId === sabor.id),
        getLocalDateStr()
      )
    );

    setResgateTarget(null);
    setResgateSabor("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30"
          >
            <option value="recent">Mais recente</option>
            <option value="name-asc">Nome (A-Z)</option>
            <option value="name-desc">Nome (Z-A)</option>
            <option value="orders-desc">Mais pedidos</option>
            <option value="orders-asc">Menos pedidos</option>
            <option value="spent-desc">Maior valor</option>
          </select>
          <input
            type="text"
            placeholder="Buscar por nome, WhatsApp ou referencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30"
          />
          <button
            onClick={() => setShowFidelidade((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-[#8B1D22]/40 px-4 py-2.5 text-sm font-semibold text-[#8B1D22] transition-colors hover:bg-[#8B1D22]/10 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            🎁 Fidelidade
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/10"
          >
            + Novo Cliente
          </button>
        </div>
      </div>

      {showFidelidade && (
        <div className="rounded-xl border border-[#8B1D22]/35 bg-neutral-900 p-6 space-y-4 dark:border-red-900/50">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
                🎁 Fidelidade
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Clientes com saldo acumulado. Meta para 1 Gelinho: {formatCurrency(valorMinimoBrinde)}.
                Ao resgatar, use <span className="font-semibold text-neutral-300">Resgatar Gelinho</span> — o saldo volta a R$ 0,00 e o ciclo recomeça.
              </p>
              {!brindeAtivo && (
                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                  🎁 Promoções / Brindes desativados — ative a chave &quot;Brinde&quot; no Cardápio para editar a meta e resgatar.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Meta de Compras (R$):
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={metaForm}
                  onChange={(e) => setMetaForm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSalvarMeta(); }}
                  disabled={!brindeAtivo}
                  className="w-28 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  onClick={handleSalvarMeta}
                  disabled={!brindeAtivo}
                  className="rounded-lg bg-[#8B1D22] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#721519] dark:bg-red-800 dark:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Salvar Meta
                </button>
              </div>
              <span className="rounded-full border border-[#8B1D22]/30 bg-[#8B1D22]/10 px-3 py-1 text-xs font-bold text-[#8B1D22] dark:border-red-900/60 dark:bg-red-950 dark:text-red-300">
                {fidelidadeRows.length} cliente{fidelidadeRows.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Categorias que contam para a meta:
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
                <input
                  type="radio"
                  name="promoCategorias"
                  checked={storeConfig.brindeTodasCategorias !== false}
                  onChange={() => handleSalvarModoCategorias(true)}
                  disabled={!brindeAtivo}
                  className="accent-[#8B1D22] dark:accent-red-600"
                />
                Todas as Categorias
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
                <input
                  type="radio"
                  name="promoCategorias"
                  checked={storeConfig.brindeTodasCategorias === false}
                  onChange={() => handleSalvarModoCategorias(false)}
                  disabled={!brindeAtivo}
                  className="accent-[#8B1D22] dark:accent-red-600"
                />
                Categorias Específicas
              </label>
              {!brindeAtivo && (
                <span className="text-[10px] font-semibold text-amber-400">Ative a chave Brinde para editar</span>
              )}
            </div>
            {storeConfig.brindeTodasCategorias === false && (
              <div className="flex flex-wrap items-center gap-2">
                {categories.length === 0 && (
                  <p className="text-xs text-neutral-500">Nenhuma categoria cadastrada.</p>
                )}
                {categories.map((c) => {
                  const marcada = (Array.isArray(storeConfig.brindeCategoriasPromo) ? storeConfig.brindeCategoriasPromo : []).includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        marcada
                          ? "border-[#8B1D22]/50 bg-[#8B1D22]/15 text-[#8B1D22] dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => handleToggleCategoriaPromo(c.id)}
                        disabled={!brindeAtivo}
                        className="accent-[#8B1D22] dark:accent-red-600"
                      />
                      {c.name}
                    </label>
                  );
                })}
                {(Array.isArray(storeConfig.brindeCategoriasPromo) ? storeConfig.brindeCategoriasPromo : []).length === 0 && (
                  <p className="text-xs font-semibold text-amber-400">
                    ⚠ Nenhuma categoria selecionada — nenhum item contará para a meta.
                  </p>
                )}
              </div>
            )}
            <p className="text-[10px] text-neutral-500">
              Ao escolher categorias específicas, apenas os itens dessas categorias somam para atingir a meta de {formatCurrency(valorMinimoBrinde)}.
            </p>
          </div>

          {fidelidadeRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-700 py-8 text-center text-sm text-neutral-500">
              Nenhum cliente com saldo de fidelidade ainda.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">WhatsApp</th>
                    <th className="px-4 py-3 text-right">Saldo / Meta</th>
                    <th className="px-4 py-3">Progresso</th>
                    <th className="px-4 py-3 text-center">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {fidelidadeRows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-neutral-800/30">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-white">{row.name}</span>
                          {row.eligible && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                              Pronto p/ brinde
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-400">{formatarTelefone(row.phone || row.phoneClean)}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-[#8B1D22] dark:text-red-500">
                          {row.label}
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${row.eligible ? "bg-emerald-500" : "bg-[#8B1D22] dark:bg-red-700"}`}
                              style={{ width: `${row.percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-neutral-500">
                            {row.eligible ? "100% - Pronto p/ Brinde" : `Faltam ${formatCurrency(row.remaining)}`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openFidelidadeEdit(row)}
                              className="rounded-md bg-[#8B1D22] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#72171B] dark:bg-red-800 dark:text-white dark:hover:bg-red-700"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleResgatarGelinho(row)}
                              disabled={!brindeAtivo || !row.eligible}
                              title={!brindeAtivo ? "Promoções / Brindes desativados" : row.eligible ? "Resgatar 1 Gelinho" : "Meta não atingida"}
                              className={
                                brindeAtivo && row.eligible
                                  ? "rounded-md border border-wine-500/40 bg-wine-500/15 px-3 py-1.5 text-[11px] font-semibold text-wine-400 transition-colors hover:bg-wine-500/25"
                                  : "cursor-not-allowed rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 opacity-60"
                              }
                            >
                              Resgatar Gelinho
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="py-16 text-center text-neutral-500">
          <p className="text-lg font-semibold">
            {search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
          </p>
          <p className="mt-2 text-sm">
            {search ? "Tente outro termo de busca." : "Clientes serao cadastrados automaticamente quando fizerem pedidos."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
          <table className="w-full text-left text-sm">
              <thead>
              <tr className="border-b border-neutral-800 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">WhatsApp</th>
                <th className="px-6 py-3 text-center">Pedidos</th>
                <th className="px-6 py-3 text-right">Valor Estimado</th>
                <th className="px-6 py-3">Ultimo Pedido</th>
                <th className="px-6 py-3 text-center">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {sorted.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-neutral-800/30">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{c.name}</span>
                      {c.referencia && (
                        <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {c.referencia}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-neutral-400">{formatarTelefone(c.phone)}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`text-sm font-bold ${
                        c.totalOrders >= 5
                          ? "text-amber-400"
                          : c.totalOrders >= 3
                          ? "text-emerald-400"
                          : "text-white"
                      }`}
                    >
                      {c.totalOrders}
                    </span>
                  </td>
               <td className="px-6 py-4 text-right text-sm font-bold text-[#8B1D22] dark:text-red-400">
                     R$ {c.totalSpent.toFixed(2).replace(".", ",")}
                   </td>
                    <td className="px-6 py-4 text-xs text-neutral-400">
                     {new Date(c.lastOrderDate).toLocaleDateString("pt-BR")}
                   </td>
<td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <a
                        href={`https://wa.me/55${c.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                      </a>
                       <button
                         onClick={() => setHistoryCustomer(c.phone || c.name)}
                         className="rounded-md border border-[#8B1D22]/40 px-3 py-1.5 text-[11px] font-medium text-[#8B1D22] transition-colors hover:bg-[#8B1D22]/10 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                       >
                         Hist
                       </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="flex items-center gap-1 rounded-md bg-[#8B1D22] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#72171B] dark:bg-red-800 dark:text-white dark:hover:bg-red-700"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resgateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setResgateTarget(null)}>
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Resgatar Gelinho</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {resgateTarget.name} — saldo {formatCurrency(resgateTarget.balance)} sera zerado (0%). Escolha o sabor:
            </p>
            {saboresDisponiveis.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-neutral-700 py-6 text-center text-sm text-neutral-500">
                Nenhum gelinho disponivel em estoque.
              </div>
            ) : (
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {saboresDisponiveis.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setResgateSabor(f.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      resgateSabor === f.id
                        ? "border-wine-500 bg-wine-500/15"
                        : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">{f.name}</span>
                      <span className="shrink-0 text-xs text-neutral-400">Estoque: {f.estoque ?? 0}</span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      Custo: {formatCurrency(Number(f.precoCustoInicial) || 0)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setResgateTarget(null)}
                className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmResgate}
                disabled={!brindeAtivo || !resgateSabor}
                className="rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirmar Resgate
              </button>
            </div>
          </div>
        </div>
      )}

      {fidelidadeEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFidelidadeEdit(null)}>
          <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Editar saldo de fidelidade</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {fidelidadeEdit.name} — defina o saldo atual (meta: {formatCurrency(valorMinimoBrinde)}). O valor sera ajustado sobre o total ja acumulado.
            </p>
            <div className="mt-5">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Saldo (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={fidelidadeForm}
                onChange={(e) => setFidelidadeForm(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white outline-none focus:border-[#8B1D22] dark:focus:border-red-700"
                autoFocus
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setFidelidadeEdit(null)}
                className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleFidelidadeSave}
                className="rounded-lg bg-[#8B1D22] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#721519] dark:bg-red-800 dark:hover:bg-red-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white">
              {editId ? "Editar Cliente" : "Novo Cliente"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {editId ? "Altere os dados do cliente." : "Cadastre um novo cliente manualmente."}
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Nome</label>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">WhatsApp</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={(e) => {
                    setPhoneError("");
                    setForm((f) => ({ ...f, phone: mascaraTelefone(e.target.value) }));
                  }}
                  onBlur={() => {
                    const e = estadoTelefone(form.phone);
                    setForm((f) => ({ ...f, phone: e.valor }));
                    setPhoneError(e.erro);
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30"
                />
                {phoneError && (
                  <p className="mt-1.5 text-xs font-medium text-red-400">{phoneError}</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Referência</label>
                <input
                  type="text"
                  placeholder="Ex: Indicou amigo, rede social, etc."
                  value={form.referencia}
                  onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-wine-500 focus:ring-1 focus:ring-wine-500/30"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); setEditId(null); setForm({ name: "", phone: "", referencia: "" }); }}
                className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wine-600"
              >
                {editId ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyCustomer && (() => {
        const customerPhoneClean = historyCustomer ? historyCustomer.replace(/\D/g, "") : "";
        const customerCredor = credores.find(cr => cr.whatsapp && cr.whatsapp.replace(/\D/g, "") === customerPhoneClean);
        const totalHistoricoPedidos = historyOrders.reduce((acc, o) => acc + (o.data.total || 0), 0);
        const totalPendenteCredor = customerCredor ? (customerCredor.compras || []).reduce((acc, comp) => acc + (Number(comp.valorPendente ?? comp.valor) || 0), 0) : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setHistoryCustomer(null)}>
            <div className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Historico de Pedidos e Compras</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {historyCustomer ? (customers.find((c) => c.phone.replace(/\D/g, "") === historyCustomer)?.name || "Cliente") : ""}
                  </p>
                </div>
                <button onClick={() => setHistoryCustomer(null)} className="text-neutral-400 hover:text-white text-lg">✕</button>
              </div>

              {/* Resumo do Cliente */}
              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Total em Pedidos</p>
                  <p className="text-base font-bold text-white">R$ {totalHistoricoPedidos.toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Pendente (Fiado)</p>
                  <p className="text-base font-bold text-amber-400">R$ {totalPendenteCredor.toFixed(2).replace(".", ",")}</p>
                </div>
              </div>

              <div className="mt-4 max-h-80 overflow-y-auto">
                {allHistory.length === 0 ? (
                  <p className="py-8 text-center text-neutral-500">Nenhum pedido ou compra encontrada.</p>
                ) : (
                  <div className="space-y-2">
                    {allHistory.map((item, idx) =>
                      item.type === "pedido" ? (
                        <div key={"pedido-" + idx} className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {new Date(item.data.createdAt).toLocaleDateString("pt-BR")}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {item.data.items.map((i: any) => `${i.product.name} x${i.quantity}`).join(", ")}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-emerald-400">
                                R$ {item.data.total.toFixed(2).replace(".", ",")}
                              </p>
                              <span className={`text-[10px] font-semibold ${
                                (item.data as any).isFiado ? "text-amber-400" :
                                item.data.status === "concluido" ? "text-emerald-400" :
                                item.data.status === "pendente" ? "text-amber-400" :
                                "text-neutral-400"
                              }`}>
                                {(item.data as any).isFiado ? "Fiado / A Pagar" : (STATUS_LABEL[item.data.status] || item.data.status)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={"credor-" + idx} className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white flex items-center">
                                {new Date(item.data.compra.data).toLocaleDateString("pt-BR")}
                                {getOrderBadge(item.data.compra.referenciaId)}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {item.data.compra.descricao}
                              </p>
                              <p className="text-xs text-neutral-500">
                                Credor: {item.data.credor}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-emerald-400">
                                R$ {Number(item.data.compra.valor).toFixed(2).replace(".", ",")}
                              </p>
                              <span className={`text-[10px] font-semibold ${
                                item.data.compra.pago ? "text-emerald-400" : "text-amber-400"
                              }`}>
                                {item.data.compra.pago ? "Quitado" : "Pendente"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
