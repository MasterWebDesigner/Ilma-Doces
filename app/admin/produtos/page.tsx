"use client";

import { useState, useMemo } from "react";
import { useProductStore, useBrandStore, useFichaTecnicaStore } from "@/lib/store";
import { auth } from "@/lib/firebase";
import { obterPrecoMedioInsumo } from "@/lib/precoMedio";
import { converterCustoFicha } from "@/lib/units";
import { compararTexto } from "@/lib/utils";
import { statusProduto, type StatusProduto } from "@/lib/produtoStatus";
import { formatarSabores, parseSabores, saboresDoCombo, validarCombo } from "@/lib/combo";
import { useEstoqueStore } from "@/lib/estoqueStore";
import GelinhosPanel from "@/components/admin/GelinhosPanel";

interface PreviewLote {
  id: string;
  insumoId: string;
  dataEntrada: string;
  precoUnitario: number;
  brandId?: string;
}

interface PreviewInsumo {
  unit: string;
  precoCustoInicial?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  "cat-1": "bg-[#8B1D22]/15 text-[#8B1D22] dark:bg-red-950 dark:text-red-400",
  "cat-3": "bg-cyan-500/15 text-cyan-400",
};

const SABORES_PADRAO_COMBO = [
  "Brigadeiro Gourmet",
  "Beijinho",
  "Ninho com Morango",
  "Ninho com Nutella",
  "Amendoim",
  "Maracujá",
  "Belga",
  "Uva",
  "Flocos",
  "Prestígio",
];

const EMPTY_FORM = { name: "", category_id: "cat-1", description: "", price: 0, prepTime: "", imageUrl: "", status: "ativo" as StatusProduto, isCustomWeight: false, controlarEstoque: false, estoque: 0, estoqueMinimo: 5, estoqueCritico: 2, cardapioRapido: false, comboAtivo: false, comboTotal: 50, comboSabores: formatarSabores(SABORES_PADRAO_COMBO), comboCategoriaId: "", comboPasso: 0 };

export default function AdminProdutos() {
  const products = useProductStore((s) => s.products);
  const categories = useProductStore((s) => s.categories);
  const addProduct = useProductStore((s) => s.addProduct);
  const updateProduct = useProductStore((s) => s.updateProduct);
  const deleteProduct = useProductStore((s) => s.deleteProduct);
  const addCategory = useProductStore((s) => s.addCategory);
  const updateCategory = useProductStore((s) => s.updateCategory);
  const deleteCategory = useProductStore((s) => s.deleteCategory);

  const brands = useBrandStore((s) => s.brands);
  const addBrand = useBrandStore((s) => s.addBrand);
  const updateBrand = useBrandStore((s) => s.updateBrand);
  const deleteBrand = useBrandStore((s) => s.deleteBrand);
  const getBrandIdByName = (name: string) => brands.find((b) => b.nome === name)?.id ?? "";

  const fichas = useFichaTecnicaStore((s) => s.fichas);
  const deleteFicha = useFichaTecnicaStore((s) => s.deleteFicha);
  const productIdsWithFicha = useMemo(() => new Set(fichas.map((f) => f.productId)), [fichas]);

  const [filter, setFilter] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [onlyRapido, setOnlyRapido] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [fichaPreviewProductId, setFichaPreviewProductId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"produtos" | "gelinhos">("produtos");

  const insumosEstoque = useEstoqueStore((s) => s.insumos);
  const previewBatches = useEstoqueStore((s) => s.lotes);
  const previewInsumos = useMemo(
    () =>
      new Map<string, PreviewInsumo>(
        insumosEstoque.map((i) => [i.id, { unit: i.unit, precoCustoInicial: i.precoCustoInicial }])
      ),
    [insumosEstoque]
  );

  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState("");
  const [deleteBrandId, setDeleteBrandId] = useState<string | null>(null);
  const [brandError, setBrandError] = useState("");

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);

  const CATEGORY_NAME: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const activeBrands = brands.filter((b) => b.status === "Ativa");
  const filteredBrands = brands.filter((b) => b.nome.toLowerCase().includes(brandSearch.toLowerCase()));

  const filtered = products.filter((p) => {
    if (onlyRapido && !p.cardapioRapido) return false;
    if (filter !== "all" && p.category_id !== filter) return false;
    if (filterBrand !== "all" && p.brand !== filterBrand) return false;
    return true;
  });
  const rapidCount = products.filter((p) => p.cardapioRapido).length;

  const usedBrandNames = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();

  function openCreate() {
    setEditingId(null);
    const firstCat = [...categories].sort(
      (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999)
    )[0];
    const catDocinhos = categories.find((c) => c.name.trim().toLowerCase() === "docinhos");
    setForm({ ...EMPTY_FORM, category_id: firstCat?.id ?? EMPTY_FORM.category_id, comboCategoriaId: catDocinhos?.id ?? "" });
    setModalOpen(true);
  }
  function openEdit(p: typeof products[0]) {
    setEditingId(p.id);
    setForm({ name: p.name, category_id: p.category_id, description: p.description ?? "", price: p.price, prepTime: "", imageUrl: p.image_url ?? "", status: statusProduto(p), isCustomWeight: p.isCustomWeight ?? false, controlarEstoque: p.controlarEstoque ?? false, estoque: p.estoque ?? 0, estoqueMinimo: p.estoqueMinimo ?? 5, estoqueCritico: p.estoqueCritico ?? 2, cardapioRapido: p.cardapioRapido ?? false, comboAtivo: !!p.combo && p.combo.total > 0 && (p.combo.sabores.length > 0 || !!p.combo.categoriaId), comboTotal: p.combo?.total ?? 50, comboSabores: p.combo ? formatarSabores(p.combo.sabores) : formatarSabores(SABORES_PADRAO_COMBO), comboCategoriaId: p.combo?.categoriaId ?? "", comboPasso: p.combo?.passo ?? 0 });
    setModalOpen(true);
  }
  function openDuplicate(p: typeof products[0]) {
    setEditingId(null);
    setForm({ name: p.name + " (Copia)", category_id: p.category_id, description: p.description ?? "", price: p.price, prepTime: "", imageUrl: p.image_url ?? "", status: statusProduto(p), isCustomWeight: p.isCustomWeight ?? false, controlarEstoque: p.controlarEstoque ?? false, estoque: p.estoque ?? 0, estoqueMinimo: p.estoqueMinimo ?? 5, estoqueCritico: p.estoqueCritico ?? 2, cardapioRapido: false, comboAtivo: !!p.combo && p.combo.total > 0 && (p.combo.sabores.length > 0 || !!p.combo.categoriaId), comboTotal: p.combo?.total ?? 50, comboSabores: p.combo ? formatarSabores(p.combo.sabores) : formatarSabores(SABORES_PADRAO_COMBO), comboCategoriaId: p.combo?.categoriaId ?? "", comboPasso: p.combo?.passo ?? 0 });
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const saboresCombo = form.comboAtivo
      ? form.comboCategoriaId
        ? saboresDoCombo({ total: form.comboTotal, sabores: [], categoriaId: form.comboCategoriaId }, products)
        : parseSabores(form.comboSabores)
      : [];
    const passo = form.comboPasso > 0 ? form.comboPasso : undefined;
    const comboBase = form.comboCategoriaId
      ? { total: form.comboTotal, sabores: [], categoriaId: form.comboCategoriaId }
      : { total: form.comboTotal, sabores: saboresCombo };
    const combo = form.comboAtivo
      ? passo
        ? { ...comboBase, passo }
        : comboBase
      : null;
    if (form.comboAtivo) {
      const erroCombo = validarCombo(form.comboTotal, saboresCombo, passo);
      if (erroCombo) {
        alert(
          form.comboCategoriaId
            ? `${erroCombo} Confira se a categoria selecionada tem produtos ativos (fora combos).`
            : erroCombo
        );
        return;
      }
    }
    if (editingId) {
      updateProduct(editingId, {
        name: form.name,
        category_id: form.category_id,
        description: form.description,
        price: form.price,
        image_url: form.imageUrl || null,
        brand: "",
        is_available: form.status !== "esgotado",
        ativo: form.status !== "inativo",
        isCustomWeight: form.isCustomWeight,
        controlarEstoque: form.controlarEstoque,
        estoque: form.estoque,
        estoqueMinimo: form.estoqueMinimo,
        estoqueCritico: form.estoqueCritico,
        cardapioRapido: form.cardapioRapido,
        combo,
      });
    } else {
      addProduct({
        name: form.name,
        category_id: form.category_id,
        description: form.description,
        price: form.price,
        image_url: form.imageUrl || null,
        brand: "",
        is_available: form.status !== "esgotado",
        ativo: form.status !== "inativo",
        isCustomWeight: form.isCustomWeight,
        controlarEstoque: form.controlarEstoque,
        estoque: form.estoque,
        estoqueMinimo: form.estoqueMinimo,
        estoqueCritico: form.estoqueCritico,
        cardapioRapido: form.cardapioRapido,
        combo,
      });
    }
    setModalOpen(false);
  }

  function handleDelete(id: string) {
    const ficha = fichas.find((f) => f.productId === id);
    if (ficha) deleteFicha(ficha.id);
    deleteProduct(id);
    setDeleteConfirm(null);
  }

  function handleAddBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    setBrandError("");
    const result = addBrand(name);
    if (!result) {
      setBrandError("Ja existe uma marca com esse nome.");
      return;
    }
    setForm((f) => ({ ...f, brand: name }));
    setNewBrandName("");
  }

  function handleUpdateBrand(id: string) {
    const name = editBrandName.trim();
    if (!name) return;
    setBrandError("");
    const exists = brands.some((b) => b.id !== id && b.nome.toLowerCase() === name.toLowerCase());
    if (exists) {
      setBrandError("Ja existe uma marca com esse nome.");
      return;
    }
    const oldBrand = brands.find((b) => b.id === id);
    if (oldBrand && oldBrand.nome !== name) {
      products.forEach((p) => {
        if (p.brand === oldBrand.nome) {
          updateProduct(p.id, { brand: name });
        }
      });
    }
    updateBrand(id, { nome: name });
    setEditingBrandId(null);
    setEditBrandName("");
  }

  function handleDeleteBrandConfirm() {
    if (!deleteBrandId) return;
    const brand = brands.find((b) => b.id === deleteBrandId);
    if (brand) {
      products.forEach((p) => {
        if (p.brand === brand.nome) {
          updateProduct(p.id, { brand: "" });
        }
      });
    }
    deleteBrand(deleteBrandId);
    setDeleteBrandId(null);
  }

  const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()));

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryError("");
    const exists = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setCategoryError("Já existe uma categoria com esse nome.");
      return;
    }
    addCategory(name);
    setNewCategoryName("");
  }

  function handleUpdateCategory(id: string) {
    const name = editCategoryName.trim();
    if (!name) return;
    setCategoryError("");
    const exists = categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setCategoryError("Já existe uma categoria com esse nome.");
      return;
    }
    updateCategory(id, name);
    setEditingCategoryId(null);
    setEditCategoryName("");
  }

  function handleCategoryPhotoChange(e: React.ChangeEvent<HTMLInputElement>, id: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setUploadingCatId(id);
    uploadImageFile(file)
      .then((path) => updateCategory(id, cat.name, path))
      .catch((err) => {
        alert(err instanceof Error ? err.message : "Erro ao enviar a imagem.");
      })
      .finally(() => {
        e.target.value = "";
        setUploadingCatId(null);
      });
  }

  function handleDeleteCategoryConfirm() {
    if (!deleteCategoryId) return;
    if (categories.length <= 1) {
      setCategoryError("É necessário manter pelo menos uma categoria.");
      setDeleteCategoryId(null);
      return;
    }
    deleteCategory(deleteCategoryId);
    setDeleteCategoryId(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImageFile(file)
      .then((path) => {
        setForm((f) => ({ ...f, imageUrl: path }));
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : "Erro ao enviar a imagem.");
      })
      .finally(() => {
        e.target.value = "";
      });
  }

  async function uploadImageFile(file: File): Promise<string> {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const resp = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Erro ao enviar a imagem.");
      return data.path as string;
    } finally {
      setUploadingImage(false);
    }
  }

  const base64ImageCount = products.filter((p) => p.image_url?.startsWith("data:")).length;

  async function migrateBase64Images() {
    if (
      !window.confirm(
        `Converter ${base64ImageCount} foto(s) salvas em texto para arquivos no Storage?`
      )
    ) {
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const p of products) {
      if (!p.image_url?.startsWith("data:")) continue;
      try {
        const blob = await fetch(p.image_url).then((r) => r.blob());
        const extFromType = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const file = new File([blob], `${p.name}.${extFromType}`, { type: blob.type });
        const path = await uploadImageFile(file);
        updateProduct(p.id, { image_url: path });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    alert(`Migração concluída: ${ok} foto(s) movidas${fail ? `, ${fail} falha(s)` : ""}.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cardápio</h1>
          <p className="mt-1 text-sm text-neutral-400">{products.length} produtos cadastrados.</p>
        </div>
        {activeTab === "produtos" && (
          <div className="flex gap-3">
            {base64ImageCount > 0 && (
              <button
                onClick={migrateBase64Images}
                disabled={uploadingImage}
                className="border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 rounded-xl font-medium px-4 py-2.5 text-sm transition-all disabled:opacity-50"
              >
                Migrar {base64ImageCount} foto(s) antigas
              </button>
            )}
            <button onClick={() => setCategoryModalOpen(true)} className="border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 rounded-xl font-medium px-4 py-2.5 text-sm transition-all">
              Gerenciar Categorias
            </button>
            <button onClick={openCreate} className="rounded-xl bg-[#8B1D22] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#72171B]">
              + Novo Produto
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
        <button
          onClick={() => setActiveTab("produtos")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === "produtos" ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
          }`}
        >
          Produtos
        </button>
        <button
          onClick={() => setActiveTab("gelinhos")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === "gelinhos" ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"
          }`}
        >
          Pronta Entrega / Gelinhos
        </button>
      </div>

      {activeTab === "gelinhos" ? (
        <GelinhosPanel />
      ) : (
      <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${filter === "all" && !onlyRapido ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"}`}>Todos ({products.length})</button>
        <button onClick={() => setOnlyRapido(!onlyRapido)} className={`pill-rapido rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${onlyRapido ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"}`}>⚡ Cardápio Rápido ({rapidCount})</button>
        {categories.map((cat) => {
          const count = products.filter((p) => p.category_id === cat.id).length;
          return (
            <button key={cat.id} onClick={() => { setFilter(cat.id); setOnlyRapido(false); }} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${filter === cat.id && !onlyRapido ? "bg-[#8B1D22] text-white shadow-sm" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200/60"}`}>
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="px-6 py-3">Produto</th>
              <th className="px-6 py-3">Categoria</th>
              <th className="px-6 py-3 text-right">Preco</th>
              <th className="px-6 py-3 text-center">Status</th>
              <th className="px-6 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {filtered.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-neutral-800/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-800">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-neutral-500">{p.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white">{p.name}</p>
                        {productIdsWithFicha.has(p.id) ? (
                          <button onClick={() => setFichaPreviewProductId(p.id)} className="cursor-pointer rounded-full border border-[#8B1D22]/30 bg-transparent px-2 py-0.5 text-[9px] font-bold text-[#8B1D22] transition-all hover:bg-[#8B1D22]/10">
                            Ficha
                          </button>
                        ) : (
                          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[9px] font-bold text-neutral-600">Sem Ficha</span>
                        )}
                      </div>
                      <p className="mt-0.5 max-w-xs text-xs text-neutral-500 line-clamp-1">{p.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[p.category_id] ?? "bg-neutral-800 text-neutral-400"}`}>
                    {CATEGORY_NAME[p.category_id] ?? "—"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-bold text-emerald-400">R$ {p.price.toFixed(2).replace(".", ",")}</span>
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${p.isCustomWeight ? "bg-amber-500/15 text-amber-400" : "bg-neutral-800 text-neutral-400"}`}>
                    {p.isCustomWeight ? "/kg" : "un"}
                  </span>
                  {p.combo && p.combo.total > 0 && (
                    <span className="ml-1.5 inline-block rounded border border-wine-500/30 bg-wine-500/15 px-1.5 py-0.5 text-[9px] font-bold text-wine-400">
                      🎁 {p.combo.total} un
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusProduto(p) === "ativo" ? "bg-emerald-500/15 text-emerald-400" : statusProduto(p) === "esgotado" ? "bg-red-500/15 text-red-400" : "bg-neutral-700/60 text-neutral-400"}`}>
                    {statusProduto(p) === "ativo" ? "Ativo" : statusProduto(p) === "esgotado" ? "Esgotado" : "Inativo"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                  <button
                    onClick={() => updateProduct(p.id, { cardapioRapido: !p.cardapioRapido })}
                    className={`badge-rapido rounded-md px-2.5 py-1 text-xs font-medium transition-all ${p.cardapioRapido ? "border border-red-900/60 bg-red-950/60 text-red-300 hover:bg-red-900/50" : "bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"}`}
                    title={p.cardapioRapido ? "Remover do Cardápio Rápido (Venda Rápida)" : "Adicionar ao Cardápio Rápido (Venda Rápida)"}
                  >
                    ⚡ {p.cardapioRapido ? "Rápido" : "Não"}
                  </button>
                  <button onClick={() => openEdit(p)} className="border border-[#8B1D22]/30 text-[#8B1D22] hover:bg-[#8B1D22]/10 bg-transparent rounded-lg px-3 py-1.5 text-xs font-semibold">Editar</button>
                  <button onClick={() => openDuplicate(p)} className="border border-[#8B1D22]/30 text-[#8B1D22] hover:bg-[#8B1D22]/10 bg-transparent rounded-lg px-3 py-1.5 text-xs font-semibold">Duplicar</button>
                  <button onClick={() => setDeleteConfirm(p.id)} className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg px-3 py-1.5 text-xs font-semibold">Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-neutral-500"><p className="text-lg font-semibold">Nenhum produto nesta categoria.</p></div>}
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Excluir este produto?</h3>
              <p className="mt-2 text-sm text-neutral-400">Esta acao nao pode ser desfeita.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-5 text-lg font-bold text-white">{editingId ? "Editar Item" : "Cadastrar Novo Item"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome do Item</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: Coxinha, Bolo, Gelinho..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Categoria</label>
                  <div className="flex gap-2">
                    <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500">
                      {[...categories].sort((a, b) => compararTexto(a.name, b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const nome = prompt("Nome da nova categoria (ex: Salgados, Tortas):");
                        if (nome && nome.trim()) {
                          addCategory(nome.trim());
                        }
                      }}
                      className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-sm font-bold text-neutral-400 transition-colors hover:border-wine-500 hover:bg-wine-500/15 hover:text-wine-400"
                      title="Adicionar nova categoria"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Tempo de Preparo</label>
                  <input type="text" value={form.prepTime} onChange={(e) => setForm({ ...form, prepTime: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ex: 24h" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Descricao / Ingredientes</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" rows={3} placeholder="Descreva os ingredientes..." />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {form.isCustomWeight ? "Preço por Kilo (R$/kg)" : "Preço por Unidade (R$)"}
                </label>
                <input type="number" step="0.01" min="0" required value={form.price || ""} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="0.00" />
              </div>
               <div>
                 <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Foto do Produto (Escolher arquivo ou URL)</label>
                   <div className="flex flex-col gap-2">
                     <input
                       type="file"
                       accept="image/*"
                       onChange={handleFileChange}
                       disabled={uploadingImage}
                       className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-wine-500 file:text-white hover:file:bg-wine-600 cursor-pointer disabled:opacity-50"
                     />
                     {uploadingImage && (
                       <p className="text-xs font-semibold text-wine-400">Enviando imagem para /imagens/...</p>
                     )}
                     <input type="text" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500" placeholder="Ou digite o caminho ex: /imagens/Maionese.webp" />
                   </div>
                 {form.imageUrl && <div className="mt-2 flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 p-2"><img src={form.imageUrl} alt="Preview" className="h-12 w-12 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /><span className="text-xs text-neutral-500">Preview</span></div>}
               </div>
               <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-2">
                 <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Tipo de Venda</label>
                 <div className="flex gap-3">
                   <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${!form.isCustomWeight ? "border-wine-500 bg-wine-500/15 text-wine-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                     <input type="radio" name="saleType" checked={form.isCustomWeight === false} onChange={() => setForm({ ...form, isCustomWeight: false })} className="sr-only" />📦 Unidade
                   </label>
                   <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${form.isCustomWeight ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                     <input type="radio" name="saleType" checked={form.isCustomWeight === true} onChange={() => setForm({ ...form, isCustomWeight: true })} className="sr-only" />⚖️ Kilo
                   </label>
                 </div>
                 <p className="text-[10px] leading-relaxed text-neutral-500">
                   {form.isCustomWeight
                     ? "No cardápio do site o cliente escolhe o peso (mín. 1 kg, passos de 0,5 kg) e o preço é aplicado por quilo — ex.: R$ 100,00/kg."
                     : "No cardápio do site o cliente adiciona a quantidade em unidades (1 un, 2 un...) pelo preço fixo cadastrado."}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      id="comboAtivo"
                      checked={form.comboAtivo}
                      onChange={(e) => setForm({ ...form, comboAtivo: e.target.checked })}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-wine-500 focus:ring-wine-500"
                    />
                    <span className="text-xs font-medium text-neutral-300">🎁 Combo (Caixa de Docinhos)</span>
                  </label>
                  {form.comboAtivo && (
                    <>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Docinhos por caixa (total)</label>
                        <input
                          type="number"
                          min={1}
                          value={form.comboTotal}
                          onChange={(e) => setForm({ ...form, comboTotal: parseInt(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Múltiplo por sabor (opcional)</label>
                        <input
                          type="number"
                          min={0}
                          value={form.comboPasso}
                          onChange={(e) => setForm({ ...form, comboPasso: parseInt(e.target.value) || 0 })}
                          placeholder="0 = qualquer quantidade"
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                        />
                        <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                          Ex.: caixa de 50 → informe 25 (cada sabor só em 0, 25 ou 50 — pode ser 50 do mesmo). Caixa de 4 → deixe em 0.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Sabores a partir de uma categoria (recomendado)</label>
                        <select
                          value={form.comboCategoriaId}
                          onChange={(e) => setForm({ ...form, comboCategoriaId: e.target.value })}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                        >
                          <option value="">— Usar lista manual de sabores —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {form.comboCategoriaId ? (
                          <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2.5">
                            <p className="mb-1.5 text-[10px] text-neutral-500">
                              Sabores que o cliente verá (produtos da categoria, inclusive inativos — a loja prepara sob demanda):
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {products
                                .filter((p) => p.category_id === form.comboCategoriaId && p.is_available !== false && !p.combo)
                                .map((p) => (
                                  <span key={p.id} className="rounded-full bg-wine-500/15 px-2 py-0.5 text-[10px] font-semibold text-wine-400">
                                    {p.name}
                                    {p.ativo === false && " (inativo)"}
                                  </span>
                                ))}
                              {products.filter((p) => p.category_id === form.comboCategoriaId && p.is_available !== false && !p.combo).length === 0 && (
                                <span className="text-[10px] font-semibold text-amber-400">Nenhum produto nesta categoria ainda — cadastre os sabores primeiro.</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <textarea
                            value={form.comboSabores}
                            onChange={(e) => setForm({ ...form, comboSabores: e.target.value })}
                            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-wine-500"
                            rows={6}
                            placeholder="Brigadeiro Gourmet&#10;Beijinho&#10;Ninho com Morango"
                          />
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-neutral-500">
                        O cliente escolhe o mix de sabores por caixa no cardápio, na Venda Rápida e nos pedidos. Com &quot;Múltiplo por sabor&quot; preenchido (ex.: 25 em caixa de 50), cada sabor só aceita quantidades múltiplas desse valor — pode ser 50 do mesmo sabor.
                      </p>
                    </>
                  )}
                </div>
                 <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-3">
                   <div className="flex items-center gap-3">
                     <input
                       type="checkbox"
                       id="controlarEstoque"
                      checked={form.controlarEstoque}
                      onChange={(e) => setForm({ ...form, controlarEstoque: e.target.checked })}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-wine-500 focus:ring-wine-500"
                    />
                    <label htmlFor="controlarEstoque" className="cursor-pointer text-xs font-medium text-neutral-300">
                      Controlar estoque automaticamente
                    </label>
                  </div>
                  {form.controlarEstoque && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Estoque Atual</label>
                        <input type="number" min="0" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Estoque Mínimo</label>
                        <input type="number" min="0" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Estoque Crítico</label>
                        <input type="number" min="0" value={form.estoqueCritico} onChange={(e) => setForm({ ...form, estoqueCritico: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-wine-500" />
                      </div>
                    </div>
                  )}
                </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Status</label>
                <div className="flex gap-3">
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${form.status === "ativo" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                    <input type="radio" name="status" checked={form.status === "ativo"} onChange={() => setForm({ ...form, status: "ativo" })} className="sr-only" />Ativo
                  </label>
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${form.status === "inativo" ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                    <input type="radio" name="status" checked={form.status === "inativo"} onChange={() => setForm({ ...form, status: "inativo" })} className="sr-only" />Inativo
                  </label>
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${form.status === "esgotado" ? "border-red-500 bg-red-500/15 text-red-400" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>
                    <input type="radio" name="status" checked={form.status === "esgotado"} onChange={() => setForm({ ...form, status: "esgotado" })} className="sr-only" />Esgotado
                  </label>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
                  Ativo aparece no site e pode ser comprado. Inativo fica escondido do site. Esgotado aparece no cardápio sem botão de compra — vira automático quando o estoque zera.
                </p>
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    id="cardapioRapido"
                    checked={form.cardapioRapido}
                    onChange={(e) => setForm({ ...form, cardapioRapido: e.target.checked })}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-xs font-medium text-neutral-300">⚡ Cardápio Rápido (Venda Rápida / Balcão)</span>
                </label>
                <p className="mt-1.5 pl-7 text-[10px] text-neutral-500">Itens marcados aparecem no modal ⚡ Venda Rápida do dashboard.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button type="submit" className="flex-1 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-wine-500/20 hover:bg-wine-600">{editingId ? "Salvar Alteracoes" : "Criar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Brand Management Modal */}
      {brandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setBrandModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-white">Gerenciar Marcas</h2>
            <p className="mb-4 text-xs text-neutral-500">Cadastre e gerencie as marcas dos seus produtos.</p>

            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-amber-500"
                placeholder="Buscar marca..."
              />
            </div>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => { setNewBrandName(e.target.value); setBrandError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBrand(); } }}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                placeholder="Nova marca..."
              />
              <button
                onClick={handleAddBrand}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600"
              >
                +
              </button>
            </div>

            {brandError && <p className="mb-2 text-xs text-red-400">{brandError}</p>}

            <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950">
              {filteredBrands.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-500">
                  {brandSearch ? "Nenhuma marca encontrada." : "Nenhuma marca cadastrada."}
                </div>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {filteredBrands.map((b) => {
                    const inUse = usedBrandNames.includes(b.nome);
                    return (
                      <li key={b.id} className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-neutral-900">
                        {editingBrandId === b.id ? (
                          <div className="flex w-full items-center gap-2">
                            <input
                              type="text"
                              value={editBrandName}
                              onChange={(e) => setEditBrandName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateBrand(b.id); if (e.key === "Escape") { setEditingBrandId(null); setEditBrandName(""); } }}
                              autoFocus
                              className="flex-1 rounded border border-amber-500 bg-neutral-800 px-2 py-1 text-sm text-white outline-none"
                            />
                            <button onClick={() => handleUpdateBrand(b.id)} className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600">Salvar</button>
                            <button onClick={() => { setEditingBrandId(null); setEditBrandName(""); }} className="rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-600">Cancelar</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm font-medium text-white">{b.nome}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${b.status === "Ativa" ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-700 text-neutral-500"}`}>
                                {b.status}
                              </span>
                              {inUse && <span className="text-[9px] text-neutral-600">(usado)</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateBrand(b.id, { status: b.status === "Ativa" ? "Inativa" : "Ativa" })}
                                className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-neutral-800"
                                title={b.status === "Ativa" ? "Desativar" : "Ativar"}
                              >
                                {b.status === "Ativa" ? (
                                  <span className="text-amber-400">Desativar</span>
                                ) : (
                                  <span className="text-emerald-400">Ativar</span>
                                )}
                              </button>
                              <button
                                onClick={() => { setEditingBrandId(b.id); setEditBrandName(b.nome); setBrandError(""); }}
                                className="border border-[#8B1D22]/30 text-[#8B1D22] hover:bg-[#8B1D22]/10 bg-transparent rounded-lg px-3 py-1.5 text-xs font-semibold"
                              >
                                Editar
                              </button>
                              {!inUse && (
                                <button
                                  onClick={() => setDeleteBrandId(b.id)}
                                  className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg px-3 py-1.5 text-xs font-semibold"
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => { setBrandModalOpen(false); setBrandSearch(""); setBrandError(""); setEditingBrandId(null); }} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Brand Confirmation */}
      {deleteBrandId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteBrandId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Excluir esta marca?</h3>
              <p className="mt-2 text-sm text-neutral-400">Os produtos vinculados ficarão sem marca. Esta ação não pode ser desfeita.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setDeleteBrandId(null)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={handleDeleteBrandConfirm} className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ FICHA TECNICA PREVIEW ═══════ */}
      {fichaPreviewProductId && (() => {
        const ficha = fichas.find((f) => f.productId === fichaPreviewProductId);
        const product = products.find((p) => p.id === fichaPreviewProductId);
        if (!ficha || !product) return null;
        const custosAtuais = ficha.ingredientes.map((ing) => {
          const insumo = previewInsumos.get(ing.insumoId);
          const precoMedio = insumo
            ? obterPrecoMedioInsumo(previewBatches, ing.insumoId, insumo.precoCustoInicial)
            : 0;
          if (insumo && precoMedio > 0) {
            return converterCustoFicha(ing.quantidade, ing.unidade, precoMedio, insumo.unit);
          }
          return ing.quantidade * (ing.custoUnitario ?? 0);
        });
        const custoIng = custosAtuais.reduce((s, c) => s + c, 0);
        const custoInvisivel = custoIng * (ficha.custoInvisivelPct / 100);
        const maoDeObra = ficha.maoDeObraValorHora * (ficha.maoDeObraMin / 60);
        const custoTotal = custoIng + custoInvisivel + maoDeObra;
        const pv = custoTotal / (1 - ficha.margemLucroPct / 100);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setFichaPreviewProductId(null)}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-blue-500/30 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{product.name}</h2>
                  <p className="text-xs text-neutral-500">Ficha Tecnica</p>
                </div>
                <button onClick={() => setFichaPreviewProductId(null)} className="text-neutral-500 hover:text-white text-xl leading-none">✕</button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Custo Ing.</p>
                  <p className="text-sm font-bold text-emerald-400">R$ {custoIng.toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Custo Total</p>
                  <p className="text-sm font-bold text-white">R$ {custoTotal.toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">PV Sugerido</p>
                  <p className="text-sm font-bold text-amber-400">R$ {pv.toFixed(2).replace(".", ",")}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-2.5 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Rendimento</p>
                  <p className="text-sm font-bold text-blue-400">{ficha.rendimento} {ficha.unidadeRendimento}</p>
                </div>
              </div>

              {/* Detalhes */}
              <div className="flex flex-wrap gap-3 mb-4 text-[10px] text-neutral-500">
                <span>Custo Invisivel: {ficha.custoInvisivelPct}%</span>
                <span>•</span>
                <span>Mao de Obra: {ficha.maoDeObraMin}min (R$ {ficha.maoDeObraValorHora.toFixed(2)}/h)</span>
                <span>•</span>
                <span>Margem: {ficha.margemLucroPct}%</span>
              </div>

              {/* Ingredientes */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">Ingredientes ({ficha.ingredientes.length})</p>
                {ficha.ingredientes.length === 0 ? (
                  <p className="text-xs text-neutral-600">Nenhum ingrediente cadastrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {ficha.ingredientes.map((ing, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-md bg-neutral-900/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{ing.nome}</span>
                          <span className="text-[10px] text-neutral-500">{ing.quantidade} {ing.unidade}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-400">R$ {(custosAtuais[idx] ?? 0).toFixed(3).replace(".", ",")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button onClick={() => setFichaPreviewProductId(null)} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Category Management Modal */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCategoryModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-white">Gerenciar Categorias</h2>
            <p className="mb-4 text-xs text-neutral-500">Cadastre e gerencie as categorias dos seus itens.</p>

            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-wine-500"
                placeholder="Buscar categoria..."
              />
            </div>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => { setNewCategoryName(e.target.value); setCategoryError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); } }}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-wine-500"
                placeholder="Nova categoria (ex: Salgados)..."
              />
              <button
                onClick={handleAddCategory}
                className="rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-wine-500/20 transition-all hover:bg-wine-600"
              >
                +
              </button>
            </div>

            {categoryError && <p className="mb-2 text-xs text-red-400">{categoryError}</p>}

            <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950">
              {filteredCategories.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-500">
                  {categorySearch ? "Nenhuma categoria encontrada." : "Nenhuma categoria cadastrada."}
                </div>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {filteredCategories.map((c) => {
                    const count = products.filter((p) => p.category_id === c.id).length;
                    return (
                      <li key={c.id} className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-neutral-900">
                        {editingCategoryId === c.id ? (
                          <div className="flex w-full items-center gap-2">
                            <input
                              type="text"
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateCategory(c.id); if (e.key === "Escape") { setEditingCategoryId(null); setEditCategoryName(""); } }}
                              autoFocus
                              className="flex-1 rounded border border-wine-500 bg-neutral-800 px-2 py-1 text-sm text-white outline-none"
                            />
                            <button onClick={() => handleUpdateCategory(c.id)} className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600">Salvar</button>
                            <button onClick={() => { setEditingCategoryId(null); setEditCategoryName(""); }} className="rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-600">Cancelar</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5">
                              {c.image_url ? (
                                <img src={c.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                              ) : (
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xs text-neutral-500">📷</span>
                              )}
                              <span className="text-sm font-medium text-white">{c.name}</span>
                              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[9px] font-semibold text-neutral-400">
                                {count} {count === 1 ? "item" : "itens"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <label
                                className={`cursor-pointer rounded-lg border border-neutral-700 px-2 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white ${uploadingCatId === c.id ? "opacity-50" : ""}`}
                                title="Foto da categoria (escolher arquivo)"
                              >
                                {uploadingCatId === c.id ? "…" : "📷"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingCatId === c.id}
                                  onChange={(e) => handleCategoryPhotoChange(e, c.id)}
                                />
                              </label>
                              <button
                                onClick={() => { setEditingCategoryId(c.id); setEditCategoryName(c.name); setCategoryError(""); }}
                                className="border border-[#8B1D22]/30 text-[#8B1D22] hover:bg-[#8B1D22]/10 bg-transparent rounded-lg px-3 py-1.5 text-xs font-semibold"
                              >
                                Editar
                              </button>
                              {categories.length > 1 && (
                                <button
                                  onClick={() => setDeleteCategoryId(c.id)}
                                  className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg px-3 py-1.5 text-xs font-semibold"
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => { setCategoryModalOpen(false); setCategorySearch(""); setCategoryError(""); setEditingCategoryId(null); }} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation */}
      {deleteCategoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteCategoryId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">Excluir esta categoria?</h3>
              <p className="mt-2 text-sm text-neutral-400">Os produtos vinculados serão movidos para outra categoria disponível. Esta ação não pode ser desfeita.</p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setDeleteCategoryId(null)} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:bg-neutral-800">Cancelar</button>
                <button onClick={handleDeleteCategoryConfirm} className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
