import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product, Order, OrderStatus, Customer, Expense, Brand, FichaTecnica, Category, FinancialTransaction, FidelidadeEvento } from "@/types/database";
import { PRODUCTS as INITIAL_PRODUCTS, CATEGORIES } from "@/lib/mockData";
import { useCredoresStore } from "./credoresStore";
import { montarTransacao, useFinanceiroStore } from "./financeiroStore";
import { getLocalDateStr, getLocalDateStrFromISO } from "./utils";
import { db, auth } from "./firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch, getDoc, getDocs, runTransaction } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { notifyError, notifyInfo } from "./notifications";
import { deveBloquearReversaoPedido, type OpcoesReversao } from "./antiRollback";
import { formatItemQty } from "./utils";
import { enforceBrindeRule, makeBrindeItem, isBrindeAtivo } from "./brinde";
import { montarDespesaBrinde, custoDoBrinde, CATEGORIA_DESPESA_BRINDE } from "./brindeCusto";
import { identidadesFidelidade, montarDocumentoFidelidade, brindesDisponiveis, saldoAposResgate, type SaldoFidelidadePublico } from "./fidelidade";
import { SETTINGS_CHANGED_EVENT, getStoreConfig } from "./storeConfig";
import { validarHorarioPedido } from "./horarioMinimo";
import { exigeSinalPedido, valorSinalPedido, localizarTransacaoSinal } from "./faturamento";

let sessaoAutenticada = false;
let contadorSemeado = false;

if (typeof window !== "undefined") {
  const canceladoresPrivados: Array<() => void> = [];

  const semearContadorPedidos = (orders: Order[]) => {
    if (contadorSemeado) return;
    const maior = orders.reduce((max, o) => {
      const n = parseInt(o.orderNumber || "", 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    if (maior <= 0) return;
    contadorSemeado = true;
    runTransaction(db, async (tx) => {
      const ref = doc(db, "contadores", "pedidos");
      const snap = await tx.get(ref);
      const atual = Number(snap.data()?.valor) || 0;
      if (maior > atual) tx.set(ref, { valor: maior }, { merge: true });
    }).catch(() => {
      contadorSemeado = false;
    });
  };

  const preencherCustosBrindeZero = () => {
    const lista = useExpenseStore.getState().expenses;
    const products = useProductStore.getState().products;
    const fichas = useFichaTecnicaStore.getState().fichas;
    const custoPorNome = new Map<string, number>();
    const addCustoPorNome = (name: string | undefined, custo: number | undefined) => {
      const n = (name || "").toLowerCase().trim();
      const c = Number(custo) || 0;
      if (n && c > 0 && !custoPorNome.has(n)) custoPorNome.set(n, c);
    };
    INITIAL_PRODUCTS.forEach((p) => addCustoPorNome(p.name, p.precoCustoInicial));
    products.forEach((p) => addCustoPorNome(p.name, p.precoCustoInicial));
    let alterou = false;
    lista.forEach((e) => {
      if (e.categoria !== CATEGORIA_DESPESA_BRINDE || (Number(e.valor) || 0) > 0) return;
      const saborName = ((e.descricao || "").split("—")[1] || "").trim().toLowerCase();
      if (!saborName) return;
      const prod =
        products.find((p) => (p.name || "").toLowerCase() === saborName) ||
        products.find((p) => {
          const n = (p.name || "").toLowerCase();
          return n.includes(saborName) || saborName.includes(n);
        });
      let custo = prod
        ? custoDoBrinde(prod, fichas.find((f) => f.productId === prod.id))
        : 0;
      if (!(custo > 0)) {
        custo = custoPorNome.get(saborName) || 0;
        if (!(custo > 0)) {
          for (const [nome, valor] of custoPorNome) {
            if (nome.includes(saborName) || saborName.includes(nome)) {
              custo = valor;
              break;
            }
          }
        }
      }
      if (custo > 0) {
        e.valor = custo;
        alterou = true;
        try { updateDoc(doc(db, "despesas", e.id), { valor: custo }); } catch {}
      }
    });
    if (alterou) useExpenseStore.setState({ expenses: [...lista] });
  };

  let fidelidadeCache: Map<string, SaldoFidelidadePublico> | null = null;
  let fidelidadeTimer: ReturnType<typeof setTimeout> | null = null;
  let fidelidadeOcupado = false;
  let fidelidadeReagendado = false;
  let pedidosProntos = false;
  let clientesProntos = false;

  const agendarSincroniaFidelidade = () => {
    if (!sessaoAutenticada) return;
    if (fidelidadeTimer) clearTimeout(fidelidadeTimer);
    fidelidadeTimer = setTimeout(() => {
      fidelidadeTimer = null;
      void sincronizarFidelidadePublica();
    }, 600);
  };

  const sincronizarFidelidadePublica = async () => {
    if (!sessaoAutenticada) return;
    if (!pedidosProntos || !clientesProntos) return;
    if (fidelidadeOcupado) {
      fidelidadeReagendado = true;
      return;
    }
    fidelidadeOcupado = true;
    try {
      const customers = useCustomerStore.getState().customers;
      const orders = useOrderStore.getState().orders;
      const credores = useCredoresStore.getState().credores;

      if (fidelidadeCache === null) {
        const snapshot = await getDocs(collection(db, "fidelidade"));
        const inicial = new Map<string, SaldoFidelidadePublico>();
        snapshot.docs.forEach((d) => {
          const data = d.data() as Partial<SaldoFidelidadePublico>;
          inicial.set(d.id, { saldo: Number(data.saldo) || 0, autoTotal: Number(data.autoTotal) || 0 });
        });
        fidelidadeCache = inicial;
      }

      const alvos = identidadesFidelidade(customers, orders, credores);
      const agora = new Date().toISOString();
      const escritas: Array<Promise<void>> = [];
      alvos.forEach((nome, telefone) => {
        const valor = montarDocumentoFidelidade(telefone, nome, orders, credores, customers);
        const anterior = fidelidadeCache?.get(telefone);
        if (anterior && anterior.saldo === valor.saldo && anterior.autoTotal === valor.autoTotal) return;
        fidelidadeCache?.set(telefone, valor);
        escritas.push(
          setDoc(doc(db, "fidelidade", telefone), { ...valor, atualizadoEm: agora }, { merge: true })
        );
      });
      await Promise.all(escritas);
    } catch {
      fidelidadeCache = null;
    } finally {
      fidelidadeOcupado = false;
      if (fidelidadeReagendado) {
        fidelidadeReagendado = false;
        agendarSincroniaFidelidade();
      }
    }
  };

  onSnapshot(collection(db, "produtos"), (snapshot) => {
    const products = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
    if (products.length > 0) {
      const seedCostById = new Map(INITIAL_PRODUCTS.filter((p) => typeof p.precoCustoInicial === "number").map((p) => [p.id, p.precoCustoInicial as number]));
      const needsCost = products.filter((p) => p.precoCustoInicial == null && seedCostById.has(p.id));
      needsCost.forEach((p) => {
        const custo = seedCostById.get(p.id)!;
        p.precoCustoInicial = custo;
        if (sessaoAutenticada) {
          try { updateDoc(doc(db, "produtos", p.id), { precoCustoInicial: custo }); } catch {}
        }
      });
      useProductStore.setState({ products });
      preencherCustosBrindeZero();
    }
  });

  onSnapshot(collection(db, "marcas"), (snapshot) => {
    const brands = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Brand));
    if (brands.length > 0) {
      useBrandStore.setState({ brands });
    }
  });

  onSnapshot(collection(db, "categorias"), (snapshot) => {
    const firestoreCats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
    const state = useProductStore.getState();
    const result = reconcileCategories(firestoreCats, state.categories, state.products);

    if (sessaoAutenticada) {
      result.deletions.forEach((id) => {
        deleteDoc(doc(db, "categorias", id)).catch(() => {});
      });
      result.upserts.forEach((c) => {
        setDoc(doc(db, "categorias", c.id), sanitizeForFirestore(c), { merge: true }).catch(() => {});
      });
      result.changedProducts.forEach((p) => {
        updateDoc(doc(db, "produtos", p.id), { category_id: p.category_id }).catch(() => {});
      });
    }

    const next: { categories: Category[]; products?: Product[] } = { categories: result.categories };
    if (result.changedProducts.length > 0) {
      next.products = result.products;
    }
    useProductStore.setState(next);
  });

  // Colecoes com dados de clientes, pedidos e financeiro: so existem no
  // navegador de quem esta autenticado no painel.
  const assinarColecoesPrivadas = () => {
    canceladoresPrivados.push(
      onSnapshot(collection(db, "pedidos"), (snapshot) => {
        const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        const chronological = [...rawOrders].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        const withNumbers = chronological.map((o, idx) => ({
          ...o,
          orderNumber: o.orderNumber || String(idx + 1).padStart(4, "0"),
        }));
        const orders = withNumbers.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        useOrderStore.setState({ orders });
        semearContadorPedidos(orders);
        pedidosProntos = true;
        agendarSincroniaFidelidade();
      }),

      onSnapshot(collection(db, "clientes"), (snapshot) => {
        const customers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
        useCustomerStore.setState({ customers });
        clientesProntos = true;
        agendarSincroniaFidelidade();
      }),

      onSnapshot(collection(db, "despesas"), (snapshot) => {
        const expenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
        useExpenseStore.setState({ expenses });
        preencherCustosBrindeZero();
      }),

      onSnapshot(collection(db, "fichas_tecnicas"), (snapshot) => {
        const fichas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as FichaTecnica));
        if (fichas.length > 0) {
          useFichaTecnicaStore.setState({ fichas });
          preencherCustosBrindeZero();
        }
      })
    );
    agendarSincroniaFidelidade();
  };

  useCredoresStore.subscribe(() => agendarSincroniaFidelidade());
  window.addEventListener(SETTINGS_CHANGED_EVENT, agendarSincroniaFidelidade);

  onAuthStateChanged(auth, (user) => {
    if (user && !sessaoAutenticada) {
      sessaoAutenticada = true;
      assinarColecoesPrivadas();
    } else if (!user && sessaoAutenticada) {
      sessaoAutenticada = false;
      canceladoresPrivados.forEach((cancelar) => cancelar());
      canceladoresPrivados.length = 0;
      if (fidelidadeTimer) {
        clearTimeout(fidelidadeTimer);
        fidelidadeTimer = null;
      }
      fidelidadeCache = null;
      pedidosProntos = false;
      clientesProntos = false;
    }
  });
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      cleaned[key] = sanitizeForFirestore(val);
    }
  }
  return cleaned;
}

function normalizeCatName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface CategoryReconcileResult {
  categories: Category[];
  products: Product[];
  changedProducts: Product[];
  deletions: string[];
  upserts: Category[];
}

function reconcileCategories(
  firestoreCats: Category[],
  localCats: Category[],
  products: Product[]
): CategoryReconcileResult {
  const seedIds = new Set(CATEGORIES.map((c) => c.id));
  const seedById = new Map(CATEGORIES.map((c) => [c.id, c]));
  const localById = new Map(localCats.map((c) => [c.id, c]));
  const firestoreIds = new Set(firestoreCats.map((c) => c.id));
  const referenced = new Set(products.map((p) => p.category_id).filter(Boolean));

  let list: Category[] =
    firestoreCats.length > 0
      ? [...firestoreCats]
      : [...(localCats.length > 0 ? localCats : CATEGORIES)];
  const upserts: Category[] = [];

  if (firestoreCats.length === 0) {
    for (const c of list) {
      if (!firestoreIds.has(c.id)) upserts.push(c);
    }
  }

  for (const id of referenced) {
    if (list.some((c) => c.id === id)) continue;
    const healed = localById.get(id) ?? seedById.get(id);
    if (healed) {
      list.push(healed);
      if (!firestoreIds.has(healed.id)) upserts.push(healed);
    }
  }

  if (list.length === 0) list = [...CATEGORIES];

  const groups = new Map<string, Category[]>();
  for (const c of list) {
    const key = normalizeCatName(c.name) || c.id;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const categories: Category[] = [];
  const idMap = new Map<string, string>();
  const deletions: string[] = [];

  for (const arr of groups.values()) {
    const canonical = [...arr].sort((a, b) => {
      const aSeed = seedIds.has(a.id) ? 0 : 1;
      const bSeed = seedIds.has(b.id) ? 0 : 1;
      if (aSeed !== bSeed) return aSeed - bSeed;
      const ao = a.display_order ?? 999;
      const bo = b.display_order ?? 999;
      if (ao !== bo) return ao - bo;
      return a.id < b.id ? -1 : 1;
    })[0];
    categories.push(canonical);
    for (const dup of arr) {
      if (dup.id !== canonical.id) {
        idMap.set(dup.id, canonical.id);
        deletions.push(dup.id);
      }
    }
  }

  categories.sort((a, b) => {
    const ao = a.display_order ?? 999;
    const bo = b.display_order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  const fallbackId = categories[0]?.id;
  const changedProducts: Product[] = [];
  const nextProducts = products.map((p) => {
    let nextId = p.category_id;
    if (idMap.has(nextId)) nextId = idMap.get(nextId)!;
    if (!categories.some((c) => c.id === nextId)) nextId = fallbackId;
    if (nextId && nextId !== p.category_id) {
      const np = { ...p, category_id: nextId };
      changedProducts.push(np);
      return np;
    }
    return p;
  });

  return {
    categories,
    products: changedProducts.length > 0 ? nextProducts : products,
    changedProducts,
    deletions,
    upserts,
  };
}

// ──────────────── EXPENSE STORE ────────────────
export const EXPENSE_CATEGORIES = [
  "Insumos",
  "Fixos",
  "Embalacoes",
  "Transporte",
  "Equipe",
  "Marketing",
  "Custos de Brindes / Fidelidade",
  "Outros",
];

interface ExpenseState {
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  markAsPaid: (id: string) => void;
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      expenses: [],

      addExpense: (data) => {
        const id = "dep-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5);
        const expense: Expense = {
          ...data,
          id,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ expenses: [expense, ...s.expenses] }));
        setDoc(doc(db, "despesas", id), sanitizeForFirestore(expense)).catch(() => {
          notifyError("Erro", "Não foi possível adicionar a despesa.");
        });
      },

      updateExpense: (id, updates) => {
        try {
          updateDoc(doc(db, "despesas", id), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar a despesa.");
        }
      },

      deleteExpense: (id) => {
        try {
          deleteDoc(doc(db, "despesas", id));
        } catch (err) {
          notifyError("Erro", "Não foi possível deletar a despesa.");
        }
      },

      markAsPaid: (id) => {
        try {
          updateDoc(doc(db, "despesas", id), { status: "Pago" });
        } catch (err) {
          notifyError("Erro", "Não foi possível marcar a despesa como paga.");
        }
      },
    }),
    { name: "ilma-expenses" }
  )
);

// ──────────────── BRAND STORE ────────────────
interface BrandState {
  brands: Brand[];
  addBrand: (nome: string) => Brand | null;
  updateBrand: (id: string, data: Partial<Pick<Brand, "nome" | "status">>) => void;
  deleteBrand: (id: string) => void;
  getActiveBrands: () => Brand[];
  getBrandNameById: (id: string) => string;
}

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      brands: [],

      addBrand: (nome) => {
        const trimmed = nome.trim();
        if (!trimmed) return null;
        const exists = get().brands.some((b) => b.nome.toLowerCase() === trimmed.toLowerCase());
        if (exists) return null;
        const brand: Brand = {
          id: "br-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          nome: trimmed,
          status: "Ativa",
        };
        try {
          setDoc(doc(db, "marcas", brand.id), sanitizeForFirestore(brand));
        } catch (err) {
          notifyError("Erro", "Não foi possível adicionar a marca.");
        }
        set((s) => ({ brands: [...s.brands, brand] }));
        return brand;
      },

      updateBrand: (id, data) => {
        try {
          updateDoc(doc(db, "marcas", id), sanitizeForFirestore(data));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar a marca.");
        }
        set((s) => ({
          brands: s.brands.map((b) => (b.id === id ? { ...b, ...data } : b)),
        }));
      },

      deleteBrand: (id) => {
        try {
          deleteDoc(doc(db, "marcas", id));
        } catch (err) {
          notifyError("Erro", "Não foi possível deletar a marca.");
        }
        set((s) => ({ brands: s.brands.filter((b) => b.id !== id) }));
      },

      getActiveBrands: () => get().brands.filter((b) => b.status === "Ativa"),

      getBrandNameById: (id) => get().brands.find((b) => b.id === id)?.nome ?? "",
    }),
    { name: "ilma-brands-v2" }
  )
);

// ──────────────── CART STORE ────────────────
interface CartState {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, weight?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateNotes: (productId: string, notes: string) => void;
  setBrinde: (product: Product) => void;
  clearBrinde: () => void;
  clearCart: () => void;
  toggleCart: () => void;
  setOpen: (open: boolean) => void;
}

export function totalItemsCount(items: CartItem[]): number {
  return Math.round(
    items.reduce((total, item) => {
      if (item.is_brinde) return total + 1;
      if (item.product.isCustomWeight) return total + (item.unidades ?? 1);
      return total + item.quantity;
    }, 0)
  );
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  isOpen: false,
  addItem: (product, weight) => {
    let toastMsg: string | null = null;
    set((state) => {
      const addQty = product.isCustomWeight ? Math.max(1, Math.round((weight || 1) * 2) / 2) : 1;
      const existing = state.items.find((i) => i.product.id === product.id && !i.is_brinde);
      const currentQty = existing ? existing.quantity : 0;
      const pesoExtra = product.isCustomWeight ? { unidades: (existing?.unidades ?? 1) + 1 } : {};
      const pesoNovo = product.isCustomWeight ? { unidades: 1 } : {};

      if (product.controlarEstoque) {
        const estoque = Math.max(0, product.estoque ?? 0);
        if (estoque <= 0) {
          toastMsg = `${product.name} está esgotado.`;
          return state;
        }
        if (currentQty >= estoque) {
          toastMsg = product.isCustomWeight
            ? `Apenas ${formatItemQty(estoque, true)} disponíveis em estoque.`
            : `Apenas ${estoque} unidades disponíveis em estoque.`;
          return state;
        }
        const clampedAdd = Math.min(addQty, estoque - currentQty);
        if (clampedAdd < addQty) {
          toastMsg = product.isCustomWeight
            ? `Apenas ${formatItemQty(estoque - currentQty, true)} disponíveis em estoque.`
            : `Apenas ${estoque - currentQty} unidades disponíveis em estoque.`;
        }
        const next = existing
          ? state.items.map((i) =>
              i.product.id === product.id && !i.is_brinde
                ? { ...i, quantity: i.quantity + clampedAdd, ...pesoExtra }
                : i
            )
          : [...state.items, { product, quantity: clampedAdd, ...pesoNovo }];
        return { items: enforceBrindeRule(next, { allowLoyalty: true }) };
      }

      const next = existing
        ? state.items.map((i) =>
            i.product.id === product.id && !i.is_brinde
              ? { ...i, quantity: i.quantity + addQty, ...pesoExtra }
              : i
          )
        : [...state.items, { product, quantity: addQty, ...pesoNovo }];
      return { items: enforceBrindeRule(next, { allowLoyalty: true }) };
    });
    if (toastMsg) notifyInfo("Estoque", toastMsg);
  },
  removeItem: (id) =>
    set((s) => {
      const target = s.items.find((i) => i.product.id === id);
      if (target?.is_brinde) {
        return { items: s.items.filter((i) => !i.is_brinde) };
      }
      return {
        items: enforceBrindeRule(
          s.items.filter((i) => !(i.product.id === id && !i.is_brinde)),
          { allowLoyalty: true }
        ),
      };
    }),
  updateQuantity: (id, qty) => {
    let toastMsg: string | null = null;
    set((s) => {
      let finalQty = qty;
      const target = s.items.find((i) => i.product.id === id && !i.is_brinde);
      if (target && target.product.controlarEstoque && qty > 0) {
        const estoque = Math.max(0, target.product.estoque ?? 0);
        if (qty > estoque) {
          finalQty = estoque;
          toastMsg = target.product.isCustomWeight
            ? `Apenas ${formatItemQty(estoque, true)} disponíveis em estoque.`
            : estoque > 0
              ? `Apenas ${estoque} unidades disponíveis em estoque.`
              : `${target.product.name} está esgotado.`;
        }
      }
      return {
        items: enforceBrindeRule(
          finalQty <= 0
            ? s.items.filter((i) => !(i.product.id === id && !i.is_brinde))
            : s.items.map((i) =>
                i.product.id === id && !i.is_brinde ? { ...i, quantity: finalQty } : i
              ),
          { allowLoyalty: true }
        ),
      };
    });
    if (toastMsg) notifyInfo("Estoque", toastMsg);
  },
  updateNotes: (id, notes) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.product.id === id && !i.is_brinde ? { ...i, notes } : i
      ),
    })),
  setBrinde: (product) =>
    set((state) => {
      if (!isBrindeAtivo()) return state;
      const paid = state.items.filter((i) => !i.is_brinde);
      return { items: [...paid, makeBrindeItem(product)] };
    }),
  clearBrinde: () => set((s) => ({ items: s.items.filter((i) => !i.is_brinde) })),
  clearCart: () => set({ items: [] }),
  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
}));

// ──────────────── ORDER STORE ────────────────
export const CAMPOS_SINAL_ESTORNADO: Partial<Order> = {
  sinalPago: false,
  valorSinalPago: 0,
  valorPagoSinal: 0,
};

export function estornarTransacaoSinal(order: Order): void {
  const tx = localizarTransacaoSinal(useFinanceiroStore.getState().transactions, order);
  if (!tx) return;
  useFinanceiroStore.getState().deleteTransaction(tx.id);
  useFinanceiroStore.getState().removerTransacaoLocal(tx.id);
}

async function gravarAtualizacaoPedido(
  orderId: string,
  updates: Partial<Order>,
  transacao: Omit<FinancialTransaction, "id" | "createdAt"> | null,
  permitirReverter?: boolean
): Promise<boolean> {
  if (updates.status !== undefined && !permitirReverter) {
    const snap = await getDoc(doc(db, "pedidos", orderId));
    const statusRemoto = snap.exists() ? (snap.data() as Partial<Order>).status : undefined;
    if (deveBloquearReversaoPedido(statusRemoto, updates.status)) {
      notifyError(
        "Pedido encerrado",
        "Pedido concluído, recusado ou cancelado não muda de status sem uma reabertura explícita."
      );
      return false;
    }
  }
  const dados = sanitizeForFirestore(updates);
  const txFinal = transacao ? montarTransacao(transacao) : null;
  if (txFinal) {
    const batch = writeBatch(db);
    batch.update(doc(db, "pedidos", orderId), dados);
    batch.set(doc(db, "financeiro", txFinal.id), txFinal);
    await batch.commit();
    useFinanceiroStore.getState().incluirTransacaoLocal(txFinal);
  } else {
    await updateDoc(doc(db, "pedidos", orderId), dados);
  }
  return true;
}

// Numeracao sequencial do pedido. O painel (autenticado) semeia o contador com o
// maior numero existente e o checkout anonnimo apenas incrementa, entao nao e
// preciso ler a colecao pedidos para criar um pedido.
async function proximoNumeroPedido(baseLocal: number): Promise<number> {
  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, "contadores", "pedidos");
      const snap = await tx.get(ref);
      const atual = Number(snap.data()?.valor) || 0;
      const proximo = sessaoAutenticada ? Math.max(atual, baseLocal) + 1 : atual + 1;
      tx.set(ref, { valor: proximo }, { merge: true });
      return proximo;
    });
  } catch {
    return baseLocal + 1;
  }
}

interface OrderState {
  orders: Order[];
  addOrder: (order: Omit<Order, "id" | "createdAt" | "status"> & { status?: OrderStatus }) => Promise<Order>;
  updateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  updateOrder: (orderId: string, updates: Partial<Order>, opcoes?: OpcoesReversao) => Promise<boolean>;
  updateOrderComTransacao: (
    orderId: string,
    updates: Partial<Order>,
    transacao: Omit<FinancialTransaction, "id" | "createdAt"> | null,
    opcoes?: OpcoesReversao
  ) => Promise<boolean>;
  getTodayOrders: () => Order[];
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],

      addOrder: async (data) => {
        if (data.origem === "site") {
          const checagemHorario = validarHorarioPedido({
            scheduledDate: data.scheduledDate,
            scheduledTime: data.scheduledTime,
            margemPreparoMinutos: getStoreConfig().margemPreparoMinutos,
          });
          if (!checagemHorario.ok) {
            notifyError("Horário indisponível", checagemHorario.error);
            throw new Error(checagemHorario.error);
          }
        }
        const currentOrders = get().orders;
        const numero = await proximoNumeroPedido(currentOrders.length);
        const orderNumber = String(numero).padStart(4, "0");
        const sinalExigido = data.sinalExigido ?? exigeSinalPedido(data.items || []);
        const order: Order = {
          status: "pendente",
          ...data,
          sinalExigido,
          valorSinal: data.valorSinal ?? (sinalExigido ? valorSinalPedido(data.total) : undefined),
          id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          orderNumber,
          createdAt: new Date().toISOString(),
        };
        if (order.status === "confirmado" || order.status === "concluido") {
          order.estoqueBaixado = true;
        }

        try {
          const sanitizedOrder = sanitizeForFirestore(order);
          const batch = writeBatch(db);
          batch.set(doc(db, "pedidos", sanitizedOrder.id), sanitizedOrder);
          const normPhone = sanitizedOrder.customerPhone ? sanitizedOrder.customerPhone.replace(/\D/g, "") : "";
          if (normPhone) {
            batch.set(doc(db, "clientes", normPhone), sanitizeForFirestore({
              name: sanitizedOrder.customerName,
              phone: normPhone,
              lastOrderDate: sanitizedOrder.createdAt,
              status: "Nova",
            }), { merge: true });
          }
          batch.commit().catch(() => {
            notifyError("Erro", "Não foi possível salvar o pedido no servidor.");
          });
        } catch (err) {
          notifyError("Erro", "Não foi possível criar o pedido.");
        }

        set((s) => ({ orders: [order, ...s.orders] }));

        const fichasBrinde = useFichaTecnicaStore.getState().fichas;
        (order.items || []).forEach((item) => {
          if (!item.is_brinde) return;
          const ficha = fichasBrinde.find((f) => f.productId === item.product.id);
          useExpenseStore.getState().addExpense(
            montarDespesaBrinde(item.product, order.customerName || "Cliente", ficha, getLocalDateStr())
          );
        });

        if (order.status === "confirmado" || order.status === "concluido") {
          order.items.forEach((item) => {
            useProductStore.getState().deductStock(item.product.id, item.quantity);
          });
        }
        return order;
      },

      updateStatus: (orderId, status) => get().updateOrderComTransacao(orderId, { status }, null),

      updateOrder: (orderId, updates, opcoes) => get().updateOrderComTransacao(orderId, updates, null, opcoes),

      updateOrderComTransacao: async (orderId, updates, transacao, opcoes) => {
        const prevOrder = get().orders.find((o) => o.id === orderId);
        const prevStatus = prevOrder?.status ?? "pendente";
        const wasFinal = prevStatus === "confirmado" || prevStatus === "concluido";

        const isFinalNovo = (updates.status === "confirmado" || updates.status === "concluido") && !wasFinal;
        const encerrouPedido = updates.status === "recusado" || updates.status === "cancelado";
        const estoqueDeduzido = prevOrder?.estoqueBaixado ?? (prevStatus === "confirmado" || prevStatus === "concluido");
        const restaurarEstoque = encerrouPedido && !!prevOrder && estoqueDeduzido;

        let payload: Partial<Order> = updates;
        if (isFinalNovo) payload = { ...updates, estoqueBaixado: true };
        else if (restaurarEstoque) payload = { ...updates, estoqueBaixado: false };

        let ok = false;
        try {
          ok = await gravarAtualizacaoPedido(orderId, payload, transacao, opcoes?.permitirReverter);
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar o pedido.");
          return false;
        }
        if (!ok) return false;

        if (isFinalNovo && prevOrder) {
          const itemsToDeduct = updates.items ?? prevOrder.items;
          itemsToDeduct.forEach((item: any) => {
            useProductStore.getState().deductStock(item.product.id, item.quantity);
          });
        }
        if (restaurarEstoque && prevOrder) {
          prevOrder.items.forEach((item: any) => {
            useProductStore.getState().restoreStock(item.product.id, item.quantity);
          });
        }
        set((s) => ({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, ...payload } : o)),
        }));
        return true;
      },

      getTodayOrders: () => {
        const today = getLocalDateStr();
        return get().orders.filter((o) => getLocalDateStrFromISO(o.createdAt) === today);
      },
    }),
    {
      name: "ilma-orders",
      migrate: (persistedState: any, version: number) => {
        if (persistedState && persistedState.orders) {
          const sorted = [...persistedState.orders].sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
          persistedState.orders = sorted.map((o: any, idx: number) => ({
            ...o,
            orderNumber: o.orderNumber || String(idx + 1).padStart(4, "0"),
          })).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        }
        return persistedState;
      },
      version: 1,
    }
  )
);

// ──────────────── CUSTOMER STORE ────────────────
function eventoFidelidade(tipo: FidelidadeEvento["tipo"], saldo: number, brindes?: number): FidelidadeEvento {
  return {
    data: new Date().toISOString(),
    tipo,
    saldo: Math.max(0, Number(saldo) || 0),
    brindes: brindes ?? brindesDisponiveis(saldo, getStoreConfig().valorMinimoBrinde),
  };
}

interface CustomerState {
  customers: Customer[];
  upsertCustomer: (name: string, phone: string, referencia?: string) => void;
  getCustomerByPhone: (phone: string) => Customer | undefined;
  setFidelidadeOffset: (phone: string, offset: number, saldoResultante?: number) => void;
  resgatarBrinde: (phone: string, autoTotal: number, name?: string) => void;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customers: [],

      upsertCustomer: (name, phone, referencia) => {
        const normalized = phone ? phone.replace(/\D/g, "") : "";
        if (!normalized) return;
        try {
          setDoc(doc(db, "clientes", normalized), sanitizeForFirestore({
            name,
            phone: normalized,
            lastOrderDate: new Date().toISOString(),
            referencia,
          }), { merge: true });
        } catch (err) {
          notifyError("Erro", "Não foi possível salvar os dados do cliente.");
        }
      },

      getCustomerByPhone: (phone) => {
        const normalized = phone.replace(/\D/g, "");
        return get().customers.find((c) => c.phone === normalized);
      },

      setFidelidadeOffset: (phone, offset, saldoResultante) => {
        const normalized = phone ? phone.replace(/\D/g, "") : "";
        if (!normalized) return;
        const safeOffset = Math.max(0, offset);
        const now = new Date().toISOString();
        const existing = get().customers.find((c) => (c.phone || "").replace(/\D/g, "") === normalized);
        const payload: Record<string, unknown> = {
          fidelidadeOffset: safeOffset,
          fidelidadeEditadoEm: now,
        };
        if (existing) {
          payload.name = existing.name;
          payload.phone = normalized;
        }
        let historico: FidelidadeEvento[] | undefined;
        if (saldoResultante !== undefined) {
          const evento = eventoFidelidade(saldoResultante > 0 ? "ajuste" : "reset", saldoResultante);
          historico = [...(existing?.fidelidadeHistorico || []), evento].slice(-50);
          payload.fidelidadeHistorico = historico;
        }
        try {
          setDoc(doc(db, "clientes", normalized), sanitizeForFirestore(payload), { merge: true });
          set((s) => {
            const idx = s.customers.findIndex((c) => (c.phone || "").replace(/\D/g, "") === normalized);
            if (idx >= 0) {
              const next = [...s.customers];
              next[idx] = {
                ...next[idx],
                fidelidadeOffset: safeOffset,
                fidelidadeEditadoEm: now,
                ...(historico ? { fidelidadeHistorico: historico } : {}),
              };
              return { customers: next };
            }
            return {
              customers: [
                ...s.customers,
                {
                  id: normalized,
                  name: existing?.name || "",
                  phone: normalized,
                  totalOrders: 0,
                  totalSpent: 0,
                  lastOrderDate: now,
                  status: "Nova",
                  fidelidadeOffset: safeOffset,
                  fidelidadeEditadoEm: now,
                  ...(historico ? { fidelidadeHistorico: historico } : {}),
                },
              ],
            };
          });
        } catch (err) {
          notifyError("Erro", "Não foi possível salvar a fidelidade do cliente.");
        }
      },

      resgatarBrinde: (phone, autoTotal, name) => {
        if (!isBrindeAtivo()) return;
        const normalized = phone ? phone.replace(/\D/g, "") : "";
        if (!normalized) return;
        const now = new Date().toISOString();
        const existing = get().customers.find((c) => (c.phone || "").replace(/\D/g, "") === normalized);
        const prevResgates = Number(existing?.fidelidadeResgates) || 0;
        const auto = Math.max(0, Number(autoTotal) || 0);
        const offsetAtual = Number(existing?.fidelidadeOffset) || 0;
        const balance = Math.max(0, auto - offsetAtual);
        const meta = getStoreConfig().valorMinimoBrinde;
        const saldoRestante = saldoAposResgate(balance, meta);
        const novoOffset = Math.max(0, auto - saldoRestante);
        const payload: Record<string, unknown> = {
          fidelidadeOffset: novoOffset,
          fidelidadeEditadoEm: now,
          fidelidadeResgates: prevResgates + 1,
          fidelidadeUltimoResgate: now,
          phone: normalized,
        };
        const historico = [
          ...(existing?.fidelidadeHistorico || []),
          eventoFidelidade("resgate", saldoRestante),
        ].slice(-50);
        payload.fidelidadeHistorico = historico;
        if (name || existing?.name) payload.name = name || existing!.name;
        try {
          setDoc(doc(db, "clientes", normalized), sanitizeForFirestore(payload), { merge: true });
          set((s) => {
            const idx = s.customers.findIndex((c) => (c.phone || "").replace(/\D/g, "") === normalized);
            if (idx >= 0) {
              const next = [...s.customers];
              next[idx] = {
                ...next[idx],
                name: (payload.name as string) || next[idx].name,
                fidelidadeOffset: novoOffset,
                fidelidadeEditadoEm: now,
                fidelidadeResgates: prevResgates + 1,
                fidelidadeUltimoResgate: now,
                fidelidadeHistorico: historico,
              };
              return { customers: next };
            }
            return {
              customers: [
                ...s.customers,
                {
                  id: normalized,
                  name: (payload.name as string) || "",
                  phone: normalized,
                  totalOrders: 0,
                  totalSpent: 0,
                  lastOrderDate: now,
                  status: "Nova",
                  fidelidadeOffset: novoOffset,
                  fidelidadeEditadoEm: now,
                  fidelidadeResgates: 1,
                  fidelidadeUltimoResgate: now,
                  fidelidadeHistorico: historico,
                },
              ],
            };
          });
        } catch (err) {
          notifyError("Erro", "Não foi possível resgatar o brinde.");
        }
      },
    }),
    { name: "ilma-customers" }
  )
);

// ──────────────── PRODUCT STORE ────────────────
interface ProductState {
  products: Product[];
  categories: typeof CATEGORIES;
  addProduct: (product: Omit<Product, "id" | "display_order">) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  toggleAvailable: (id: string) => void;
  deductStock: (productId: string, quantity: number) => void;
  restoreStock: (productId: string, quantity: number) => void;
  adjustStock: (productId: string, newQty: number) => void;
  addCategory: (name: string) => void;
  updateCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set, get) => ({
      products: INITIAL_PRODUCTS,
      categories: CATEGORIES,

      addProduct: (data) => {
        const product: Product = {
          ...data,
          id: "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          display_order: get().products.length + 1,
        };
        try {
          setDoc(doc(db, "produtos", product.id), sanitizeForFirestore(product));
        } catch (err) {
          notifyError("Erro", "Não foi possível adicionar o produto.");
        }
        set((s) => ({ products: [...s.products, product] }));
      },

      updateProduct: (id, data) => {
        try {
          updateDoc(doc(db, "produtos", id), sanitizeForFirestore(data));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar o produto.");
        }
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...data } : p)),
        }));
      },

      deleteProduct: (id) => {
        try {
          deleteDoc(doc(db, "produtos", id));
        } catch (err) {
          notifyError("Erro", "Não foi possível deletar o produto.");
        }
        set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
      },

      toggleAvailable: (id) => {
        const product = get().products.find((p) => p.id === id);
        if (product) {
          try {
            updateDoc(doc(db, "produtos", id), { is_available: !product.is_available });
          } catch (err) {
            notifyError("Erro", "Não foi possível atualizar a disponibilidade do produto.");
          }
        }
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id ? { ...p, is_available: !p.is_available } : p
          ),
        }));
      },

      deductStock: (productId, quantity) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product || !product.controlarEstoque) return;
        const newQty = Math.max(0, (product.estoque ?? 0) - quantity);
        const isEsgotado = newQty === 0;
        const updates: Partial<Product> = { estoque: newQty };
        if (isEsgotado && product.is_available) {
          updates.is_available = false;
        }
        try {
          updateDoc(doc(db, "produtos", productId), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar o estoque do produto.");
        }
        set((s) => ({
          products: s.products.map((p) => (p.id === productId ? { ...p, ...updates } : p)),
        }));
      },

      restoreStock: (productId, quantity) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product || !product.controlarEstoque) return;
        const prevQty = product.estoque ?? 0;
        const newQty = prevQty + quantity;
        const updates: Partial<Product> = { estoque: newQty };
        if (prevQty === 0 && newQty > 0 && !product.is_available) {
          updates.is_available = true;
        }
        try {
          updateDoc(doc(db, "produtos", productId), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível restaurar o estoque do produto.");
        }
        set((s) => ({
          products: s.products.map((p) => (p.id === productId ? { ...p, ...updates } : p)),
        }));
      },

      adjustStock: (productId, newQty) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product) return;
        const qty = Math.max(0, newQty);
        const isEsgotado = qty === 0;
        const updates: Partial<Product> = { estoque: qty };
        if (isEsgotado && product.is_available) {
          updates.is_available = false;
        } else if (!isEsgotado && !product.is_available && product.controlarEstoque) {
          updates.is_available = true;
        }
        try {
          updateDoc(doc(db, "produtos", productId), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível ajustar o estoque do produto.");
        }
        set((s) => ({
          products: s.products.map((p) => (p.id === productId ? { ...p, ...updates } : p)),
        }));
      },

      addCategory: (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const norm = normalizeCatName(trimmed);
        const exists = get().categories.some((c) => normalizeCatName(c.name) === norm);
        if (exists) {
          notifyError("Categoria já existe", "Já existe uma categoria com esse nome.");
          return;
        }
        const slug = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
        const id = "cat-" + Date.now();
        const newCategory: Category = { id, name: trimmed, slug, display_order: get().categories.length + 1 };
        try {
          setDoc(doc(db, "categorias", id), sanitizeForFirestore(newCategory));
        } catch (err) {
          notifyError("Erro", "Não foi possível adicionar a categoria.");
        }
        set((s) => ({
          categories: [...s.categories, newCategory],
        }));
      },

      updateCategory: (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const norm = normalizeCatName(trimmed);
        const collision = get().categories.some(
          (c) => c.id !== id && normalizeCatName(c.name) === norm
        );
        if (collision) {
          notifyError("Nome já existe", "Já existe outra categoria com esse nome.");
          return;
        }
        const slug = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
        try {
          updateDoc(doc(db, "categorias", id), { name: trimmed, slug });
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar a categoria.");
        }
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name: trimmed, slug } : c)),
        }));
      },

      deleteCategory: (id: string) => {
        const state = get();
        if (state.categories.length <= 1) return;
        const targetCat = state.categories.find((c) => c.id === id);
        if (!targetCat) return;
        const fallbackCat =
          state.categories.find(
            (c) => c.id !== id && CATEGORIES.some((s) => s.id === c.id)
          ) || state.categories.find((c) => c.id !== id);
        if (!fallbackCat) return;

        try {
          deleteDoc(doc(db, "categorias", id));
        } catch (err) {
          notifyError("Erro", "Não foi possível deletar a categoria.");
        }

        const changedProducts: Product[] = [];
        const updatedProducts = state.products.map((p) => {
          if (p.category_id === id) {
            const np = { ...p, category_id: fallbackCat.id };
            changedProducts.push(np);
            return np;
          }
          return p;
        });
        changedProducts.forEach((p) => {
          try {
            updateDoc(doc(db, "produtos", p.id), { category_id: p.category_id });
          } catch {}
        });

        set({
          categories: state.categories.filter((c) => c.id !== id),
          products: updatedProducts,
        });
      },
    }),
    {
      name: "ilma-products",
      version: 6,
      migrate: (persistedState: any, version: number) => {
        if (version < 6) {
          if (typeof window !== "undefined") {
            INITIAL_PRODUCTS.forEach((p) => {
              try { setDoc(doc(db, "produtos", p.id), sanitizeForFirestore(p), { merge: true }); } catch {}
            });
            CATEGORIES.forEach((c) => {
              try { setDoc(doc(db, "categorias", c.id), sanitizeForFirestore(c), { merge: true }); } catch {}
            });
          }
          return {
            ...persistedState,
            products: INITIAL_PRODUCTS,
            categories: CATEGORIES,
          };
        }
        return persistedState;
      },
    }
  )
);

// ──────────────── FICHA TECNICA STORE ────────────────
interface FichaTecnicaState {
  fichas: FichaTecnica[];
  addFicha: (ficha: Omit<FichaTecnica, "id" | "createdAt">) => void;
  updateFicha: (id: string, updates: Partial<FichaTecnica>) => void;
  deleteFicha: (id: string) => void;
  getFichaByProduct: (productId: string) => FichaTecnica | undefined;
}

export const useFichaTecnicaStore = create<FichaTecnicaState>()(
  persist(
    (set, get) => ({
      fichas: [],

      addFicha: (data) => {
        const ficha: FichaTecnica = {
          ...data,
          id: "ft-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          createdAt: new Date().toISOString(),
        };
        try {
          setDoc(doc(db, "fichas_tecnicas", ficha.id), sanitizeForFirestore(ficha));
        } catch (err) {
          notifyError("Erro", "Não foi possível adicionar a ficha técnica.");
        }
        set((s) => ({ fichas: [ficha, ...s.fichas] }));
      },

      updateFicha: (id, updates) => {
        try {
          updateDoc(doc(db, "fichas_tecnicas", id), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar a ficha técnica.");
        }
        set((s) => ({
          fichas: s.fichas.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        }));
      },

      deleteFicha: (id) => {
        try {
          deleteDoc(doc(db, "fichas_tecnicas", id));
        } catch (err) {
          notifyError("Erro", "Não foi possível deletar a ficha técnica.");
        }
        set((s) => ({ fichas: s.fichas.filter((f) => f.id !== id) }));
      },

      getFichaByProduct: (productId) =>
        get().fichas.find((f) => f.productId === productId),
    }),
    {
      name: "ilma-fichas-tecnicas",
      version: 1,
      migrate: (persistedState: any, version: number) => {
        // Ensure all fichas have required fields with defaults
        if (persistedState?.fichas) {
          persistedState.fichas = persistedState.fichas.map((f: any) => ({
            ...f,
            custoInvisivelPct: f.custoInvisivelPct ?? 15,
            maoDeObraMin: f.maoDeObraMin ?? 30,
            maoDeObraValorHora: f.maoDeObraValorHora ?? 15.625,
            margemLucroPct: f.margemLucroPct ?? 50,
            rendimento: f.rendimento ?? 1,
            unidadeRendimento: f.unidadeRendimento ?? "un",
          }));
        }
        return persistedState;
      },
    }
  )
);
