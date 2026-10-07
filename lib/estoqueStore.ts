import { create } from "zustand";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { quandoAutenticado } from "./authSync";
import { assinarColecao } from "./retrySnapshot";
import { notifyError } from "./notifications";
import { SEED_STOCK, SEED_LINKS } from "./seedData";
import { obterPrecoMedioInsumo } from "./precoMedio";
import {
  BATCH_KEY,
  STOCK_KEY,
  STOCK_BRANDS_KEY,
  SEED_KEY,
  loadBatchesData,
  limparLotesUmaVez,
} from "./stockStorage";

// ═══════════ TIPOS ═══════════

export interface StockItem {
  id: string;
  name: string;
  category: string;
  min: number;
  unit: string;
  precoCustoInicial?: number;
}

export interface StockBrand {
  id: string;
  stockItemId: string;
  brandId: string;
}

export interface Batch {
  id: string;
  insumoId: string;
  brandId: string;
  dataEntrada: string;
  quantidadeInicial: number;
  quantidadeRestante: number;
  precoUnitario: number;
  dataValidade?: string;
}

// ═══════════ LOGICA PEPS (pura) ═══════════

export function calcularQtyTotal(batches: Batch[], insumoId: string, brandId?: string): number {
  return batches
    .filter((b) => b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true))
    .reduce((s, b) => s + b.quantidadeRestante, 0);
}

export function calcularLotesAtivos(batches: Batch[], insumoId: string, brandId?: string): number {
  return batches.filter((b) =>
    b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true)
  ).length;
}

export function baixarEstoquePEPS(batches: Batch[], insumoId: string, quantidade: number, brandId?: string): Batch[] {
  const sorted = [...batches]
    .filter((b) =>
      b.insumoId === insumoId && b.quantidadeRestante > 0 && (brandId ? b.brandId === brandId : true)
    )
    .sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada));

  let restante = quantidade;
  const updated = batches.map((b) => ({ ...b }));

  for (const lote of sorted) {
    if (restante <= 0) break;
    const loteRef = updated.find((u) => u.id === lote.id);
    if (!loteRef) continue;
    const baixa = Math.min(loteRef.quantidadeRestante, restante);
    loteRef.quantidadeRestante -= baixa;
    restante -= baixa;
  }

  return updated;
}

// ═══════════ PAYLOADS (sem undefined p/ Firestore) ═══════════

export function montarDadosInsumo(item: StockItem) {
  return {
    name: item.name,
    category: item.category,
    min: item.min,
    unit: item.unit,
    precoCustoInicial: item.precoCustoInicial ?? 0,
  };
}

export function montarDadosVinculo(v: StockBrand) {
  return { stockItemId: v.stockItemId, brandId: v.brandId };
}

export function montarDadosLote(l: Batch) {
  return {
    insumoId: l.insumoId,
    brandId: l.brandId,
    dataEntrada: l.dataEntrada,
    quantidadeInicial: l.quantidadeInicial,
    quantidadeRestante: l.quantidadeRestante,
    precoUnitario: l.precoUnitario,
    ...(l.dataValidade ? { dataValidade: l.dataValidade } : {}),
  };
}

// ═══════════ MIGRACAO ONE-SHOT (localStorage -> Firestore) ═══════════

export const ESTOQUE_MIGRADO_KEY = "ilma-estoque-migrado-v1";

function lerListaLocal<T>(chave: string): T[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(chave);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function insumosDeOrigem(): StockItem[] {
  const local = lerListaLocal<any>(STOCK_KEY);
  if (local && local.length > 0) {
    return local.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      min: item.min,
      unit: item.unit,
      precoCustoInicial: item.precoCustoInicial ?? 0,
    }));
  }
  return SEED_STOCK;
}

function vinculosDeOrigem(): StockBrand[] {
  const local = lerListaLocal<StockBrand>(STOCK_BRANDS_KEY);
  if (local) return local;
  const derivados: StockBrand[] = [];
  for (const [stockItemId, brandIds] of Object.entries(SEED_LINKS)) {
    for (const brandId of brandIds) {
      derivados.push({ id: `sb-${stockItemId}-${brandId}`, stockItemId, brandId });
    }
  }
  return derivados;
}

async function gravarParesEmLotes(pares: Array<[DocumentReference, any]>): Promise<void> {
  for (let i = 0; i < pares.length; i += 400) {
    const escrita = writeBatch(db);
    pares.slice(i, i + 400).forEach(([ref, dados]) => escrita.set(ref, dados));
    await escrita.commit();
  }
}

export async function migrarEstoqueSePreciso(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const jaMigrado = Boolean(localStorage.getItem(ESTOQUE_MIGRADO_KEY));
    const ehEmulador = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
    if (jaMigrado && !ehEmulador) return;
    const lotesLocais = loadBatchesData<Batch>();
    limparLotesUmaVez();
    const remotos = await getDocs(collection(db, "insumos"));
    if (!remotos.empty) {
      localStorage.setItem(ESTOQUE_MIGRADO_KEY, "1");
      return;
    }
    const insumos = insumosDeOrigem();
    const vinculos = vinculosDeOrigem();
    const pares: Array<[DocumentReference, any]> = [
      ...insumos.map((i): [DocumentReference, any] => [doc(db, "insumos", i.id), montarDadosInsumo(i)]),
      ...vinculos.map((v): [DocumentReference, any] => [doc(db, "insumo-marcas", v.id), montarDadosVinculo(v)]),
      ...lotesLocais.map((l): [DocumentReference, any] => [doc(db, "lotes", l.id), montarDadosLote(l)]),
    ];
    await gravarParesEmLotes(pares);
    localStorage.setItem(ESTOQUE_MIGRADO_KEY, "1");
  } catch {
    notifyError("Erro", "Nao foi possivel migrar o estoque para a nuvem. Tente novamente.");
  }
}

// ═══════════ STORE ═══════════

interface EstoqueState {
  insumos: StockItem[];
  vinculos: StockBrand[];
  lotes: Batch[];
  carregado: boolean;
  adicionarInsumo: (dados: Omit<StockItem, "id">) => string;
  editarInsumo: (id: string, dados: Omit<StockItem, "id">) => void;
  removerInsumo: (id: string) => void;
  adicionarLote: (dados: Omit<Batch, "id">) => void;
  baixarEstoque: (insumoId: string, quantidade: number, brandId?: string) => void;
  vincularMarca: (stockItemId: string, brandId: string) => void;
  removerVinculo: (stockBrandId: string) => void;
  removerVinculosDaMarca: (brandId: string) => void;
  resetarEstoque: () => Promise<void>;
}

export const useEstoqueStore = create<EstoqueState>()((set, get) => ({
  insumos: [],
  vinculos: [],
  lotes: [],
  carregado: false,

  adicionarInsumo: (dados) => {
    const id = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5);
    const item: StockItem = { ...dados, id };
    set((s) => ({ insumos: [...s.insumos, item] }));
    setDoc(doc(db, "insumos", id), montarDadosInsumo(item)).catch(() => {
      notifyError("Erro", "Nao foi possivel adicionar o insumo.");
    });
    return id;
  },

  editarInsumo: (id, dados) => {
    const item: StockItem = { ...dados, id };
    set((s) => ({ insumos: s.insumos.map((i) => (i.id === id ? item : i)) }));
    setDoc(doc(db, "insumos", id), montarDadosInsumo(item)).catch(() => {
      notifyError("Erro", "Nao foi possivel salvar o insumo.");
    });
  },

  removerInsumo: (id) => {
    const { vinculos, lotes } = get();
    const vinculosAlvo = vinculos.filter((v) => v.stockItemId === id);
    const lotesAlvo = lotes.filter((l) => l.insumoId === id);
    set((s) => ({
      insumos: s.insumos.filter((i) => i.id !== id),
      vinculos: s.vinculos.filter((v) => v.stockItemId !== id),
      lotes: s.lotes.filter((l) => l.insumoId !== id),
    }));
    const escrita = writeBatch(db);
    escrita.delete(doc(db, "insumos", id));
    vinculosAlvo.forEach((v) => escrita.delete(doc(db, "insumo-marcas", v.id)));
    lotesAlvo.forEach((l) => escrita.delete(doc(db, "lotes", l.id)));
    escrita.commit().catch(() => {
      notifyError("Erro", "Nao foi possivel apagar o insumo.");
    });
  },

  adicionarLote: (dados) => {
    const lote: Batch = {
      ...dados,
      id: "b-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
    };
    set((s) => ({ lotes: [...s.lotes, lote] }));
    setDoc(doc(db, "lotes", lote.id), montarDadosLote(lote)).catch(() => {
      notifyError("Erro", "Nao foi possivel registrar a entrada de estoque.");
    });
    sincronizarPrecoMedioInsumo(dados.insumoId);
  },

  baixarEstoque: (insumoId, quantidade, brandId) => {
    const { lotes } = get();
    if (calcularQtyTotal(lotes, insumoId, brandId) <= 0) return;
    const atualizados = baixarEstoquePEPS(lotes, insumoId, quantidade, brandId);
    const alterados = atualizados.filter((l) => {
      const original = lotes.find((o) => o.id === l.id);
      return original && original.quantidadeRestante !== l.quantidadeRestante;
    });
    if (alterados.length === 0) return;
    set({ lotes: atualizados });
    const escrita = writeBatch(db);
    alterados.forEach((l) =>
      escrita.update(doc(db, "lotes", l.id), { quantidadeRestante: l.quantidadeRestante })
    );
    escrita.commit().catch(() => {
      notifyError("Erro", "Nao foi possivel dar baixa no estoque.");
    });
  },

  vincularMarca: (stockItemId, brandId) => {
    const { vinculos } = get();
    if (vinculos.some((v) => v.stockItemId === stockItemId && v.brandId === brandId)) return;
    const vinculo: StockBrand = {
      id: "sb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      stockItemId,
      brandId,
    };
    set({ vinculos: [...vinculos, vinculo] });
    setDoc(doc(db, "insumo-marcas", vinculo.id), montarDadosVinculo(vinculo)).catch(() => {
      notifyError("Erro", "Nao foi possivel vincular a marca ao insumo.");
    });
  },

  removerVinculo: (stockBrandId) => {
    const { vinculos, lotes } = get();
    const sb = vinculos.find((v) => v.id === stockBrandId);
    if (!sb) return;
    const lotesAlvo = lotes.filter((l) => l.insumoId === sb.stockItemId && l.brandId === sb.brandId);
    set((s) => ({
      vinculos: s.vinculos.filter((v) => v.id !== stockBrandId),
      lotes: s.lotes.filter((l) => !(l.insumoId === sb.stockItemId && l.brandId === sb.brandId)),
    }));
    const escrita = writeBatch(db);
    escrita.delete(doc(db, "insumo-marcas", stockBrandId));
    lotesAlvo.forEach((l) => escrita.delete(doc(db, "lotes", l.id)));
    escrita.commit().catch(() => {
      notifyError("Erro", "Nao foi possivel remover o vinculo da marca.");
    });
    sincronizarPrecoMedioInsumo(sb.stockItemId);
  },

  removerVinculosDaMarca: (brandId) => {
    const { vinculos, lotes } = get();
    const vinculosAlvo = vinculos.filter((v) => v.brandId === brandId);
    const lotesAlvo = lotes.filter((l) => l.brandId === brandId);
    set((s) => ({
      vinculos: s.vinculos.filter((v) => v.brandId !== brandId),
      lotes: s.lotes.filter((l) => l.brandId !== brandId),
    }));
    const escrita = writeBatch(db);
    vinculosAlvo.forEach((v) => escrita.delete(doc(db, "insumo-marcas", v.id)));
    lotesAlvo.forEach((l) => escrita.delete(doc(db, "lotes", l.id)));
    escrita.commit().catch(() => {
      notifyError("Erro", "Nao foi possivel remover os vinculos da marca.");
    });
    [...new Set(vinculosAlvo.map((v) => v.stockItemId))].forEach(sincronizarPrecoMedioInsumo);
  },

  resetarEstoque: async () => {
    const { insumos, vinculos, lotes } = get();
    const refs: DocumentReference[] = [
      ...insumos.map((i) => doc(db, "insumos", i.id)),
      ...vinculos.map((v) => doc(db, "insumo-marcas", v.id)),
      ...lotes.map((l) => doc(db, "lotes", l.id)),
    ];
    for (let i = 0; i < refs.length; i += 400) {
      const escrita = writeBatch(db);
      refs.slice(i, i + 400).forEach((ref) => escrita.delete(ref));
      try {
        await escrita.commit();
      } catch {
        notifyError("Erro", "Nao foi possivel apagar o estoque da nuvem.");
        return;
      }
    }
    try {
      localStorage.removeItem(STOCK_KEY);
      localStorage.removeItem(STOCK_BRANDS_KEY);
      localStorage.removeItem(BATCH_KEY);
      localStorage.removeItem(SEED_KEY);
      localStorage.removeItem(ESTOQUE_MIGRADO_KEY);
      localStorage.removeItem("ilma-brands-v2");
    } finally {
      window.location.reload();
    }
  },
}));

// ═══════════ PRECO MEDIO PERSISTENTE ═══════════

export function sincronizarPrecoMedioInsumo(insumoId: string): void {
  const { lotes, insumos } = useEstoqueStore.getState();
  const insumo = insumos.find((i) => i.id === insumoId);
  if (!insumo) return;
  const media = obterPrecoMedioInsumo(lotes, insumoId);
  if (!(media > 0)) return;
  const valor = Math.round(media * 1000) / 1000;
  if (Math.abs(valor - (insumo.precoCustoInicial ?? 0)) < 0.0005) return;
  useEstoqueStore.setState((s) => ({
    insumos: s.insumos.map((i) => (i.id === insumoId ? { ...i, precoCustoInicial: valor } : i)),
  }));
  setDoc(doc(db, "insumos", insumoId), { precoCustoInicial: valor }, { merge: true }).catch(() => {
    notifyError("Erro", "Nao foi possivel atualizar o preco medio do insumo.");
  });
}

// ═══════════ BACKUP LOCAL ═══════════

function salvarBackupEstoque(): void {
  if (typeof window === "undefined") return;
  const { insumos, vinculos, lotes } = useEstoqueStore.getState();
  if (insumos.length === 0) return;
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(insumos));
    localStorage.setItem(STOCK_BRANDS_KEY, JSON.stringify(vinculos));
    localStorage.setItem(BATCH_KEY, JSON.stringify(lotes));
  } catch {}
}

// ═══════════ ASSINATURAS ═══════════

if (typeof window !== "undefined") {
  useEstoqueStore.subscribe((estado, anterior) => {
    if (
      estado.insumos !== anterior.insumos ||
      estado.vinculos !== anterior.vinculos ||
      estado.lotes !== anterior.lotes
    ) {
      salvarBackupEstoque();
    }
  });
  window.addEventListener("pagehide", salvarBackupEstoque);
  quandoAutenticado(() => {
    const cancelarInsumos = assinarColecao("insumos", collection(db, "insumos"), (snapshot) => {
      useEstoqueStore.setState({
        insumos: snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StockItem, "id">) })),
        carregado: true,
      });
    });
    const cancelarVinculos = assinarColecao("vinculos do estoque", collection(db, "insumo-marcas"), (snapshot) => {
      useEstoqueStore.setState({
        vinculos: snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StockBrand, "id">) })),
      });
    });
    const cancelarLotes = assinarColecao("lotes do estoque", collection(db, "lotes"), (snapshot) => {
      useEstoqueStore.setState({
        lotes: snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, "id">) })),
      });
    });
    void migrarEstoqueSePreciso();
    return () => {
      cancelarInsumos();
      cancelarVinculos();
      cancelarLotes();
    };
  });
}
