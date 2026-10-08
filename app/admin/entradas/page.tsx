"use client";

import { Fragment, useMemo, useState } from "react";
import { classNames, getLocalDateStr, getLocalMonthStr } from "@/lib/utils";
import { getStep, ALL_STOCK_UNITS } from "@/lib/units";
import { useBrandStore, useExpenseStore, EXPENSE_CATEGORIA_COLORS } from "@/lib/store";
import { useEstoqueStore } from "@/lib/estoqueStore";
import { useEntradasStore } from "@/lib/entradasStore";
import { notifySuccess } from "@/lib/notifications";
import {
  addDays,
  addMonthsClamped,
  agruparDespesasPorParcela,
  aplicarVencimentos,
  calcularTotais,
  dividirValorEm,
  ehFornecedorNovo,
  money,
  parcelasAvista,
  parcelasEmDiasApartirDe,
  parcelasMensaisApartirDe,
  round2,
  sugestoesFornecedor,
  validarEntrada,
} from "@/lib/entradas";
import type { EntradaParcela } from "@/types/database";

type ItemForm = { insumoId: string; brandId: string; qtd: string; custo: string };
type ParcelaCustom = { vencimento: string; valor: string };

const EMPTY_ITEM: ItemForm = { insumoId: "", brandId: "", qtd: "", custo: "" };
const EMPTY_NOVO_INSUMO = { nome: "", categoria: "Uso Interno", unidade: "un", marca: "", custo: "" };
const NOVO_INSUMO = "__novo__";
const NOVO_FORNECEDOR = "__novo-fornecedor__";

// ═══════════ COMPONENT ═══════════
export default function AdminEntradas() {
  const insumos = useEstoqueStore((s) => s.insumos);
  const vinculos = useEstoqueStore((s) => s.vinculos);
  const adicionarInsumo = useEstoqueStore((s) => s.adicionarInsumo);
  const editarInsumo = useEstoqueStore((s) => s.editarInsumo);
  const vincularMarca = useEstoqueStore((s) => s.vincularMarca);
  const brands = useBrandStore((s) => s.brands);
  const addBrand = useBrandStore((s) => s.addBrand);
  const entradas = useEntradasStore((s) => s.entradas);
  const fornecedores = useEntradasStore((s) => s.fornecedores);
  const carregado = useEntradasStore((s) => s.carregado);
  const registrarEntrada = useEntradasStore((s) => s.registrarEntrada);
  const estornarEntrada = useEntradasStore((s) => s.estornarEntrada);
  const salvarFornecedor = useEntradasStore((s) => s.salvarFornecedor);
  const expenses = useExpenseStore((s) => s.expenses);
  const markAsPaid = useExpenseStore((s) => s.markAsPaid);
  const updateExpense = useExpenseStore((s) => s.updateExpense);

  const [fornecedor, setFornecedor] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [data, setData] = useState(() => getLocalDateStr());
  const [itens, setItens] = useState<ItemForm[]>([{ ...EMPTY_ITEM }]);
  const [frete, setFrete] = useState("0");
  const [modo, setModo] = useState<"avista" | "prazo">("avista");
  const [formaAvista, setFormaAvista] = useState("Pix");
  const [tipoPrazo, setTipoPrazo] = useState<"boleto" | "carne" | "custom">("boleto");
  const [nBoleto, setNBoleto] = useState(2);
  const [nCarne, setNCarne] = useState(3);
  const [custom, setCustom] = useState<ParcelaCustom[]>([]);
  const [vencOverrides, setVencOverrides] = useState<Record<number, string>>({});
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => getLocalDateStr());
  const [primeiroTocado, setPrimeiroTocado] = useState(false);
  const [novoInsumoIdx, setNovoInsumoIdx] = useState<number | null>(null);
  const [formNovoInsumo, setFormNovoInsumo] = useState(EMPTY_NOVO_INSUMO);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const itensNum = useMemo(
    () =>
      itens.map((i) => ({
        insumoId: i.insumoId,
        brandId: i.brandId,
        qtd: Number((i.qtd || "").replace(",", ".")) || 0,
        custoUnitario: Number((i.custo || "").replace(",", ".")) || 0,
      })),
    [itens]
  );

  const { subtotal, frete: freteNum, total } = useMemo(
    () => calcularTotais(itensNum, Number((frete || "0").replace(",", ".")) || 0),
    [itensNum, frete]
  );

  const formaPagamento = modo === "avista" ? formaAvista : tipoPrazo === "boleto" ? "Boleto" : tipoPrazo === "carne" ? "Cartão" : "Personalizado";

  const primeiroEfetivo = primeiroTocado
    ? primeiroVencimento
    : modo === "avista"
    ? data
    : tipoPrazo === "carne"
    ? addMonthsClamped(data, 1)
    : addDays(data, 30);

  const parcelas: EntradaParcela[] = useMemo(() => {
    if (modo === "prazo" && tipoPrazo === "custom") {
      return custom.map((c, i) => ({
        numero: i + 1,
        vencimento: c.vencimento,
        valor: round2((Number((c.valor || "").replace(",", ".")) || 0)),
      }));
    }
    if (total <= 0) return [];
    if (modo === "avista") return parcelasAvista(total, data);
    const geradas =
      tipoPrazo === "carne"
        ? parcelasMensaisApartirDe(total, primeiroEfetivo, nCarne)
        : parcelasEmDiasApartirDe(total, primeiroEfetivo, nBoleto, 30);
    return aplicarVencimentos(geradas, vencOverrides);
  }, [total, primeiroEfetivo, modo, tipoPrazo, nBoleto, nCarne, custom, vencOverrides]);

  const erroForm = validarEntrada({
    fornecedor,
    data,
    itens: itensNum,
    parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
    total,
  });
  const formValido = erroForm === null;

  const sugestoes = useMemo(() => sugestoesFornecedor(fornecedores, entradas.map((e) => e.fornecedor)), [fornecedores, entradas]);
  const fornecedorNovo = ehFornecedorNovo(sugestoes, fornecedor);

  const somaCustom = round2(custom.reduce((s, c) => s + (Number((c.valor || "").replace(",", ".")) || 0), 0));
  const diffCustom = round2(total - somaCustom);

  const mesAtual = getLocalMonthStr();
  const entradasMes = entradas.filter((e) => e.data && e.data.slice(0, 7) === mesAtual);
  const compradoMes = entradasMes.reduce((s, e) => s + (e.total || 0), 0);
  const aPagar = expenses
    .filter((e) => e.entradaId && e.status !== "Pago")
    .reduce((s, e) => s + (e.valor || 0), 0);

  const itensOrdenados = useMemo(() => [...insumos].sort((a, b) => a.name.localeCompare(b.name)), [insumos]);

  function vinculosDo(insumoId: string) {
    if (!insumoId) return [];
    return vinculos.filter((v) => v.stockItemId === insumoId);
  }

  function nomeMarca(brandId: string) {
    return brands.find((b) => b.id === brandId)?.nome || brandId;
  }

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItens((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setItens((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function addCustom() {
    const resto = diffCustom > 0 ? diffCustom : 0;
    setCustom((prev) => [
      ...prev,
      { vencimento: addDays(data, 30 * (prev.length + 1)), valor: resto > 0 ? String(resto.toFixed(2)) : "" },
    ]);
  }

  function setCustomParcela(idx: number, patch: Partial<ParcelaCustom>) {
    setCustom((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCustomParcela(idx: number) {
    setCustom((prev) => prev.filter((_, i) => i !== idx));
  }

  function setVencimentoParcela(numero: number, vencimento: string) {
    setVencOverrides((prev) => ({ ...prev, [numero]: vencimento }));
  }

  function onChangeInsumo(idx: number, valor: string) {
    if (valor === NOVO_INSUMO) {
      setNovoInsumoIdx(idx);
      return;
    }
    setItem(idx, { insumoId: valor, brandId: "" });
  }

  function fecharNovoInsumo() {
    setNovoInsumoIdx(null);
    setFormNovoInsumo({ ...EMPTY_NOVO_INSUMO });
  }

  function salvarNovoInsumo(e: React.FormEvent) {
    e.preventDefault();
    if (novoInsumoIdx === null) return;
    const nome = formNovoInsumo.nome.trim();
    if (!nome) return;
    const id = adicionarInsumo({
      name: nome,
      category: formNovoInsumo.categoria,
      min: 1,
      unit: formNovoInsumo.unidade,
      precoCustoInicial: Number((formNovoInsumo.custo || "0").replace(",", ".")) || 0,
    });
    let brandId = "";
    const marcaNome = formNovoInsumo.marca.trim();
    if (marcaNome) {
      const existente = brands.find((b) => b.nome.toLowerCase() === marcaNome.toLowerCase());
      if (existente) brandId = existente.id;
      else {
        const criada = addBrand(marcaNome);
        brandId = criada ? criada.id : "";
      }
      if (brandId) vincularMarca(id, brandId);
    }
    setItem(novoInsumoIdx, { insumoId: id, brandId });
    notifySuccess("Insumo cadastrado", marcaNome ? `${nome} — marca ${marcaNome}` : nome);
    fecharNovoInsumo();
  }

  async function handleCadastrarFornecedor() {
    try {
      await salvarFornecedor(fornecedor);
      setNovoFornecedor(false);
    } catch {
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await registrarEntrada({
        fornecedor,
        data,
        frete: freteNum,
        itens: itensNum,
        formaPagamento,
        aVista: modo === "avista",
        parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
      });
      setItens([{ ...EMPTY_ITEM }]);
      setFrete("0");
      setCustom([]);
      setPrimeiroTocado(false);
      setNovoFornecedor(false);
    } catch {
    } finally {
      setEnviando(false);
    }
  }

  async function handleEstornar(id: string) {
    if (!confirm("Estornar esta entrada? As despesas e os lotes criados por ela serao removidos.")) return;
    try {
      await estornarEntrada(id);
    } catch {
    }
  }

  function alterarCategoriaItem(idx: number, categoria: string) {
    const insumo = insumos.find((i) => i.id === itens[idx].insumoId);
    if (!insumo || insumo.category === categoria) return;
    editarInsumo(insumo.id, { ...insumo, category: categoria });
  }

  if (!carregado) {
    return <div className="py-16 text-center text-sm text-neutral-500">Carregando entradas...</div>;
  }

  return (
    <div className="space-y-6">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Entrada de Mercadoria</h1>
          <p className="mt-1 text-sm text-neutral-400">Compra de fornecedor: despesa(s) parcelada(s) + lotes de estoque em uma unica gravacao</p>
        </div>
      </div>

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Entradas no Mes</p>
          <p className="mt-2 text-3xl font-bold text-white">{entradasMes.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Comprado no Mes</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">R$ {money(compradoMes)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">A Pagar (Entradas)</p>
          <p className={classNames("mt-2 text-3xl font-bold", aPagar > 0 ? "text-red-400" : "text-emerald-400")}>R$ {money(aPagar)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Fornecedores</p>
          <p className="mt-2 text-3xl font-bold text-blue-400">{fornecedores.length}</p>
        </div>
      </div>

      {/* ═══════ FORM ═══════ */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Fornecedor</label>
                {novoFornecedor ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={fornecedor}
                      onChange={(e) => setFornecedor(e.target.value)}
                      placeholder="Nome do fornecedor..."
                      className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                    />
                    {fornecedorNovo && (
                      <button
                        type="button"
                        onClick={handleCadastrarFornecedor}
                        title="Salvar este fornecedor para usar nas proximas compras"
                        className="shrink-0 rounded-lg border border-[#8B1D22]/60 bg-[#8B1D22]/20 px-3 text-xs font-semibold text-white transition-all hover:bg-[#8B1D22]/40"
                      >
                        + Cadastrar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setNovoFornecedor(false);
                        setFornecedor("");
                      }}
                      title="Voltar para a lista de fornecedores"
                      className="shrink-0 rounded-lg border border-neutral-700 px-3 text-xs text-neutral-400 transition-all hover:text-white"
                    >
                      &#8592;
                    </button>
                  </div>
                ) : (
                  <select
                    value={fornecedor}
                    onChange={(e) => {
                      if (e.target.value === NOVO_FORNECEDOR) {
                        setFornecedor("");
                        setNovoFornecedor(true);
                        return;
                      }
                      setFornecedor(e.target.value);
                    }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                  >
                    <option value="">Fornecedor...</option>
                    {sugestoes.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    <option value={NOVO_FORNECEDOR}>+ Novo fornecedor...</option>
                  </select>
                )}
                {novoFornecedor && fornecedorNovo && (
                  <p className="mt-1 text-[10px] text-neutral-500">Fornecedor novo — sera salvo automaticamente ao registrar a entrada.</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Data da Compra</label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-400">Itens</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-all hover:bg-neutral-800 hover:text-white"
                >
                  + Adicionar item
                </button>
              </div>
              <div className="space-y-2">
                {itens.map((item, idx) => {
                  const insumoAtual = insumos.find((i) => i.id === item.insumoId);
                  const unit = insumoAtual?.unit || "un";
                  const categoriaAtual = insumoAtual?.category || "Uso Interno";
                  const opcoesMarca = vinculosDo(item.insumoId);
                  const subtotalItem =
                    (Number((item.qtd || "").replace(",", ".")) || 0) * (Number((item.custo || "").replace(",", ".")) || 0);
                  return (
                    <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 sm:grid-cols-12">
                      <div className="col-span-2 sm:col-span-4">
                        <select
                          value={item.insumoId}
                          onChange={(e) => onChangeInsumo(idx, e.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-sm text-white outline-none focus:border-wine-500"
                        >
                          <option value="">Insumo...</option>
                          {itensOrdenados.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                          <option value={NOVO_INSUMO}>+ Adicionar novo insumo...</option>
                        </select>
                        {item.insumoId && (
                          <div className="mt-1.5 flex gap-1">
                            {[
                              { valor: "Uso Interno", rotulo: "Insumo" },
                              { valor: "Embalagens", rotulo: "Embalagem" },
                            ].map((c) => {
                              const ativo = categoriaAtual === c.valor;
                              return (
                                <button
                                  key={c.valor}
                                  type="button"
                                  onClick={() => alterarCategoriaItem(idx, c.valor)}
                                  className={classNames(
                                    "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                                    ativo
                                      ? c.valor === "Embalagens"
                                        ? "bg-purple-600 text-white"
                                        : "bg-blue-600 text-white"
                                      : "border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
                                  )}
                                >
                                  {c.rotulo}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        {opcoesMarca.length > 0 ? (
                          <select
                            value={item.brandId}
                            onChange={(e) => setItem(idx, { brandId: e.target.value })}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-sm text-white outline-none focus:border-wine-500"
                          >
                            <option value="">Sem marca</option>
                            {opcoesMarca.map((v) => (
                              <option key={v.id} value={v.brandId}>
                                {nomeMarca(v.brandId)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            disabled
                            value=""
                            placeholder="—"
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-sm text-neutral-600"
                          />
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="0"
                          step={getStep(unit)}
                          value={item.qtd}
                          onChange={(e) => setItem(idx, { qtd: e.target.value })}
                          placeholder={`Qtd (${unit})`}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-sm text-white outline-none focus:border-wine-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={item.custo}
                          onChange={(e) => setItem(idx, { custo: e.target.value })}
                          placeholder="Custo unit."
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-sm text-white outline-none focus:border-wine-500"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:col-span-2">
                        <span className="text-xs font-semibold text-amber-400">R$ {money(subtotalItem)}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={itens.length === 1}
                          className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-30"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Subtotal</label>
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2.5 text-sm font-bold text-white">R$ {money(subtotal)}</div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Frete (+ / -)</label>
                <input
                  type="number"
                  step="0.01"
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Total</label>
                <div className="rounded-lg border border-wine-500/40 bg-[#8B1D22]/10 px-3 py-2.5 text-sm font-bold text-white">R$ {money(total)}</div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400" title="Data da primeira parcela — as demais nascem a partir dela">
                  1º Vencimento
                </label>
                <input
                  type="date"
                  value={modo === "prazo" && tipoPrazo === "custom" ? (parcelas[0]?.vencimento ?? "") : primeiroEfetivo}
                  disabled={modo === "prazo" && tipoPrazo === "custom"}
                  onChange={(e) => {
                    setPrimeiroVencimento(e.target.value);
                    setPrimeiroTocado(true);
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Pagamento</label>
              <div className="flex gap-2">
                {(["avista", "prazo"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModo(m);
                      setVencOverrides({});
                    }}
                    className={classNames(
                      "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                      modo === m ? "bg-[#8B1D22] text-white" : "border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                    )}
                  >
                    {m === "avista" ? "À vista" : "Prazo"}
                  </button>
                ))}
              </div>
            </div>

            {modo === "avista" ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Forma</label>
                <div className="flex gap-2">
                  {["Pix", "Dinheiro", "Cartão"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormaAvista(f)}
                      className={classNames(
                        "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
                        formaAvista === f ? "bg-white text-[#8B1D22]" : "border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Tipo de prazo</label>
                <div className="flex gap-2">
                  {([
                    { key: "boleto", label: "Boleto" },
                    { key: "carne", label: "Cartão" },
                    { key: "custom", label: "Datas" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setTipoPrazo(t.key);
                        setVencOverrides({});
                        if (t.key === "custom") {
                          const comValor = custom.some((c) => (Number((c.valor || "").replace(",", ".")) || 0) > 0);
                          if (custom.length === 0) {
                            setCustom([{ vencimento: addDays(data, 30), valor: total > 0 ? total.toFixed(2) : "" }]);
                          } else if (!comValor && total > 0) {
                            const partes = dividirValorEm(total, custom.length);
                            setCustom(custom.map((c, i) => ({ ...c, valor: partes[i].toFixed(2) })));
                          }
                        }
                      }}
                      className={classNames(
                        "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
                        tipoPrazo === t.key ? "bg-white text-[#8B1D22]" : "border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tipoPrazo === "boleto" && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-neutral-500">Parcelas (30/60/90 dias)</label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNBoleto(n)}
                          className={classNames(
                            "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
                            nBoleto === n ? "bg-[#8B1D22] text-white" : "border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                          )}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tipoPrazo === "carne" && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-neutral-500">Numero de parcelas (mensais)</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={nCarne}
                      onChange={(e) => setNCarne(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                    />
                  </div>
                )}

                {tipoPrazo === "custom" && (
                  <p className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] text-neutral-400">
                    Edite a data e o valor de cada parcela no resumo logo abaixo.
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-neutral-800 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-400">Parcelas ({parcelas.length})</label>
                {modo === "prazo" && tipoPrazo !== "custom" && Object.keys(vencOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setVencOverrides({})}
                    className="text-[10px] text-neutral-500 underline transition-colors hover:text-white"
                  >
                    Restaurar datas
                  </button>
                )}
              </div>
              <p className="mb-2 text-[10px] text-neutral-500">
                Total R$ {money(total)}
                {freteNum !== 0 ? ` · frete R$ ${money(freteNum)} ja rateado nos valores` : ""}
              </p>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {parcelas.length === 0 ? (
                  <p className="text-xs text-neutral-500">Preencha os itens para ver as parcelas.</p>
                ) : modo === "prazo" && tipoPrazo === "custom" ? (
                  <>
                    {parcelas.map((p, idx) => (
                      <div key={p.numero} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs">
                        <span className="w-5 shrink-0 text-neutral-500">{p.numero}x</span>
                        <input
                          type="date"
                          value={p.vencimento}
                          onChange={(e) => setCustomParcela(idx, { vencimento: e.target.value })}
                          className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white outline-none focus:border-wine-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={custom[idx]?.valor ?? ""}
                          onChange={(e) => setCustomParcela(idx, { valor: e.target.value })}
                          placeholder="Valor"
                          className="w-24 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white outline-none focus:border-wine-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomParcela(idx)}
                          className="rounded-md bg-red-500/15 px-2 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25"
                        >
                          X
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        type="button"
                        onClick={addCustom}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white"
                      >
                        + Parcela
                      </button>
                      {parcelas.length > 0 && Math.abs(diffCustom) > 0.01 && (
                        <span className="text-[11px] font-semibold text-red-400">
                          {diffCustom > 0 ? `Faltam R$ ${money(diffCustom)}` : `Sobra R$ ${money(Math.abs(diffCustom))}`}
                        </span>
                      )}
                    </div>
                  </>
                ) : modo === "prazo" ? (
                  parcelas.map((p) => (
                    <div key={p.numero} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs">
                      <span className="w-5 shrink-0 text-neutral-500">{p.numero}x</span>
                      <input
                        type="date"
                        value={p.vencimento}
                        onChange={(e) => setVencimentoParcela(p.numero, e.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white outline-none focus:border-wine-500"
                      />
                      <span className="font-bold text-white">R$ {money(p.valor)}</span>
                    </div>
                  ))
                ) : (
                  parcelas.map((p) => (
                    <div key={p.numero} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-xs">
                      <span className="text-neutral-400">
                        {p.numero}x — {p.vencimento ? p.vencimento.split("-").reverse().join("/") : "—"}
                      </span>
                      <span className="font-bold text-white">R$ {money(p.valor)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={!formValido || enviando}
                className={classNames(
                  "w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-all",
                  formValido ? "bg-[#8B1D22] text-white hover:bg-[#721519]" : "cursor-not-allowed bg-neutral-800 text-neutral-500"
                )}
              >
                {enviando ? "Registrando..." : "Registrar Entrada"}
              </button>
              {!formValido && <p className="mt-2 text-center text-[11px] text-neutral-500">{erroForm}</p>}
            </div>
          </div>
        </div>
      </form>

      {/* ═══════ LISTA ═══════ */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Entradas Registradas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Fornecedor</th>
                <th className="px-6 py-3 text-center">Itens</th>
                <th className="px-6 py-3 text-right">Total (R$)</th>
                <th className="px-6 py-3 text-center">Parcelas</th>
                <th className="px-6 py-3 text-center">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {entradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                    Nenhuma entrada registrada. Use o formulario acima para registrar a primeira compra.
                  </td>
                </tr>
              ) : (
                entradas.map((entrada) => {
                  const grupos = agruparDespesasPorParcela(entrada, expenses);
                  const pagas = grupos.filter(
                    (g) => g.despesas.length > 0 && g.despesas.every((d) => d.status === "Pago")
                  ).length;
                  const aberto = expandedId === entrada.id;
                  return (
                    <Fragment key={entrada.id}>
                      <tr className="transition-colors hover:bg-neutral-800/30">
                        <td className="px-6 py-4 text-sm text-neutral-300">
                          {entrada.data ? new Date(entrada.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-6 py-4 font-medium text-white">{entrada.fornecedor}</td>
                        <td className="px-6 py-4 text-center text-sm text-neutral-300">{entrada.itens.length}</td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-amber-400">R$ {money(entrada.total)}</td>
                        <td className="px-6 py-4 text-center text-xs text-neutral-400">
                          {pagas}/{entrada.parcelas.length} pagas
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setExpandedId(aberto ? null : entrada.id)}
                              className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"
                            >
                              {aberto ? "Fechar" : "Detalhes"}
                            </button>
                            <button
                              onClick={() => handleEstornar(entrada.id)}
                              className="rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25"
                            >
                              Estornar
                            </button>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="bg-neutral-950/40">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid gap-5 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                  Itens — frete rateado no custo do lote ({entrada.formaPagamento})
                                </p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-neutral-500">
                                      <th className="py-1 text-left font-medium">Insumo</th>
                                      <th className="py-1 text-right font-medium">Qtd</th>
                                      <th className="py-1 text-right font-medium">Custo unit.</th>
                                      <th className="py-1 text-right font-medium">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-800/60">
                                    {entrada.itens.map((it, i) => (
                                      <tr key={i}>
                                        <td className="py-1.5 text-white">{it.nome}</td>
                                        <td className="py-1.5 text-right text-neutral-300">{it.qtd}</td>
                                        <td className="py-1.5 text-right text-neutral-300">R$ {money(it.custoUnitario)}</td>
                                        <td className="py-1.5 text-right text-neutral-300">R$ {money(it.qtd * it.custoUnitario)}</td>
                                      </tr>
                                    ))}
                                    <tr>
                                      <td className="py-1.5 text-neutral-500" colSpan={3}>
                                        Frete
                                      </td>
                                      <td className="py-1.5 text-right text-neutral-300">R$ {money(entrada.frete)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Parcelas / Despesas</p>
                                <div className="space-y-1.5">
                                  {grupos.map((g) => {
                                    const p = g.parcela;
                                    const todasPagas = g.despesas.length > 0 && g.despesas.every((d) => d.status === "Pago");
                                    const status = g.despesas.length === 0 ? "Removida" : todasPagas ? "Pago" : "Pendente";
                                    return (
                                      <div key={p.numero} className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-xs">
                                        <span className="flex items-center gap-1.5 text-neutral-400">
                                          {g.despesas.map((d) => (
                                            <span
                                              key={d.id}
                                              title={d.categoria}
                                              className={classNames(
                                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                                EXPENSE_CATEGORIA_COLORS[d.categoria] || "bg-neutral-500"
                                              )}
                                            />
                                          ))}
                                          <span>
                                            {p.numero}x — vence {p.vencimento ? p.vencimento.split("-").reverse().join("/") : "—"}
                                          </span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                          {g.despesas.length > 0 ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                todasPagas
                                                  ? g.despesas.forEach((d) => updateExpense(d.id, { status: "Pendente" }))
                                                  : g.despesas.forEach((d) => markAsPaid(d.id))
                                              }
                                              title={todasPagas ? "Clique para reabrir a parcela" : "Clique para marcar como paga"}
                                              className={classNames(
                                                "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white transition-colors",
                                                todasPagas
                                                  ? "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
                                                  : "border-[#8B1D22] bg-[#8B1D22] hover:bg-[#721519]"
                                              )}
                                            >
                                              {status}
                                            </button>
                                          ) : (
                                            <span className={classNames("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusBadge(status))}>
                                              {status}
                                            </span>
                                          )}
                                          <span className="font-bold text-white">R$ {money(p.valor)}</span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="mt-2 text-[11px] text-neutral-500">
                                  Subtotal R$ {money(entrada.subtotal)} + frete R$ {money(entrada.frete)} = total R$ {money(entrada.total)}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════ MODAL NOVO INSUMO ═══════ */}
      {novoInsumoIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={fecharNovoInsumo}>
          <div
            className="my-8 w-full max-w-md space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="h-5 w-1 shrink-0 rounded-full bg-wine-500" />
                <h3 className="text-xl font-bold text-white">Novo Insumo</h3>
              </div>
              <button type="button" onClick={fecharNovoInsumo} className="text-xl leading-none text-neutral-500 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={salvarNovoInsumo} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Nome do Insumo</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formNovoInsumo.nome}
                  onChange={(e) => setFormNovoInsumo({ ...formNovoInsumo, nome: e.target.value })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  placeholder="Ex: Leite Condensado 395g"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">Categoria</label>
                  <select
                    value={formNovoInsumo.categoria}
                    onChange={(e) => setFormNovoInsumo({ ...formNovoInsumo, categoria: e.target.value })}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  >
                    {["Uso Interno", "Embalagens"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-400">Unidade</label>
                  <select
                    value={formNovoInsumo.unidade}
                    onChange={(e) => setFormNovoInsumo({ ...formNovoInsumo, unidade: e.target.value })}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  >
                    {ALL_STOCK_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Marca (opcional)</label>
                <input
                  list="lista-marcas-novo-insumo"
                  value={formNovoInsumo.marca}
                  onChange={(e) => setFormNovoInsumo({ ...formNovoInsumo, marca: e.target.value })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  placeholder="Ex: Nestle (deixe vazio se nao usar marca)"
                />
                <datalist id="lista-marcas-novo-insumo">
                  {brands.map((b) => (
                    <option key={b.id} value={b.nome} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Preco Custo Inicial (R$ / {formNovoInsumo.unidade})</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formNovoInsumo.custo}
                  onChange={(e) => setFormNovoInsumo({ ...formNovoInsumo, custo: e.target.value })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-sm text-white focus:border-wine-500 focus:outline-none"
                  placeholder="0.000"
                />
                <p className="mt-1 text-[10px] text-neutral-600">Opcional — usado como preco medio quando nao ha entradas.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharNovoInsumo}
                  className="flex-1 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 hover:bg-wine-600"
                >
                  Cadastrar e Selecionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function statusBadge(status: string): string {
  if (status === "Pago") return "border-emerald-600 bg-emerald-600 text-white";
  if (status === "Em Atraso") return "border-red-600 bg-red-600 text-white";
  if (status === "Removida") return "border-neutral-600 bg-neutral-800 text-neutral-400";
  return "border-[#8B1D22] bg-[#8B1D22] text-white";
}
