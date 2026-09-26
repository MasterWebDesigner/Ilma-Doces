import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product, Order, OrderStatus, Customer, Expense, Brand, FichaTecnica, Category } from "@/types/database";
import { PRODUCTS as INITIAL_PRODUCTS, CATEGORIES } from "@/lib/mockData";
import { useCredoresStore } from "./credoresStore";
import { getLocalDateStr } from "./utils";
import { db } from "./firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { notifyError, notifyInfo } from "./notifications";
import { formatItemQty } from "./utils";
import { enforceBrindeRule, makeBrindeItem, isBrindeAtivo } from "./brinde";
import { montarDespesaBrinde, custoDoBrinde, CATEGORIA_DESPESA_BRINDE } from "./brindeCusto";

if (typeof window !== "undefined") {
  onSnapshot(collection(db, "pedidos"), (snapshot) => {
    const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    const chronological = [...rawOrders].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    const withNumbers = chronological.map((o, idx) => ({
      ...o,
      orderNumber: o.orderNumber || String(idx + 1).padStart(4, "0"),
    }));
    const orders = withNumbers.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    useOrderStore.setState({ orders });
  });

  onSnapshot(collection(db, "clientes"), (snapshot) => {
    const customers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
    useCustomerStore.setState({ customers });
  });

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

  onSnapshot(collection(db, "despesas"), (snapshot) => {
    const expenses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
    useExpenseStore.setState({ expenses });
    preencherCustosBrindeZero();
  });

  onSnapshot(collection(db, "produtos"), (snapshot) => {
    const products = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
    if (products.length > 0) {
      const seedCostById = new Map(INITIAL_PRODUCTS.filter((p) => typeof p.precoCustoInicial === "number").map((p) => [p.id, p.precoCustoInicial as number]));
      const needsCost = products.filter((p) => p.precoCustoInicial == null && seedCostById.has(p.id));
      needsCost.forEach((p) => {
        const custo = seedCostById.get(p.id)!;
        p.precoCustoInicial = custo;
        try { updateDoc(doc(db, "produtos", p.id), { precoCustoInicial: custo }); } catch {}
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

  onSnapshot(collection(db, "fichas_tecnicas"), (snapshot) => {
    const fichas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as FichaTecnica));
    if (fichas.length > 0) {
      useFichaTecnicaStore.setState({ fichas });
      preencherCustosBrindeZero();
    }
  });

  onSnapshot(collection(db, "categorias"), (snapshot) => {
    const firestoreCats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Category));
    const state = useProductStore.getState();
    const result = reconcileCategories(firestoreCats, state.categories, state.products);

    result.deletions.forEach((id) => {
      deleteDoc(doc(db, "categorias", id)).catch(() => {});
    });
    result.upserts.forEach((c) => {
      setDoc(doc(db, "categorias", c.id), sanitizeForFirestore(c), { merge: true }).catch(() => {});
    });
    result.changedProducts.forEach((p) => {
      updateDoc(doc(db, "produtos", p.id), { category_id: p.category_id }).catch(() => {});
    });

    const next: { categories: Category[]; products?: Product[] } = { categories: result.categories };
    if (result.changedProducts.length > 0) {
      next.products = result.products;
    }
    useProductStore.setState(next);
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

export const useCartStore = create<CartState>((set) => ({
  items: [],
  isOpen: false,
  addItem: (product, weight) => {
    let toastMsg: string | null = null;
    set((state) => {
      const addQty = product.isCustomWeight ? Math.max(1, Math.round((weight || 1) * 2) / 2) : 1;
      const existing = state.items.find((i) => i.product.id === product.id && !i.is_brinde);
      const currentQty = existing ? existing.quantity : 0;

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
                ? { ...i, quantity: i.quantity + clampedAdd }
                : i
            )
          : [...state.items, { product, quantity: clampedAdd }];
        return { items: enforceBrindeRule(next, { allowLoyalty: true }) };
      }

      const next = existing
        ? state.items.map((i) =>
            i.product.id === product.id && !i.is_brinde
              ? { ...i, quantity: i.quantity + addQty }
              : i
          )
        : [...state.items, { product, quantity: addQty }];
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
interface OrderState {
  orders: Order[];
  addOrder: (order: Omit<Order, "id" | "createdAt" | "status"> & { status?: OrderStatus }) => Order;
  updateStatus: (orderId: string, status: OrderStatus) => void;
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  getTodayOrders: () => Order[];
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],

      addOrder: (data) => {
        const currentOrders = get().orders;
        const nextNum = currentOrders.length + 1;
        const orderNumber = String(nextNum).padStart(4, "0");
        const order: Order = {
          status: "pendente",
          ...data,
          id: "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
          orderNumber,
          createdAt: new Date().toISOString(),
        };

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

      updateStatus: (orderId, status) => {
        try {
          updateDoc(doc(db, "pedidos", orderId), { status });
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar o status do pedido.");
        }
        const prevOrder = get().orders.find((o) => o.id === orderId);
        const prevStatus = prevOrder?.status ?? "pendente";
        const wasFinal = prevStatus === "confirmado" || prevStatus === "concluido";
        const isFinal = status === "confirmado" || status === "concluido";
        if (isFinal && !wasFinal && prevOrder) {
          prevOrder.items.forEach((item) => {
            useProductStore.getState().deductStock(item.product.id, item.quantity);
          });
        }
        set((s) => ({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        }));
      },

      updateOrder: (orderId, updates) => {
        try {
          updateDoc(doc(db, "pedidos", orderId), sanitizeForFirestore(updates));
        } catch (err) {
          notifyError("Erro", "Não foi possível atualizar o pedido.");
        }
        const prevOrder = get().orders.find((o) => o.id === orderId);
        const prevStatus = prevOrder?.status ?? "pendente";
        const wasFinal = prevStatus === "confirmado" || prevStatus === "concluido";
        if (updates.status) {
          const isFinal = updates.status === "confirmado" || updates.status === "concluido";
          if (isFinal && !wasFinal && prevOrder) {
            const itemsToDeduct = updates.items ?? prevOrder.items;
            itemsToDeduct.forEach((item: any) => {
              useProductStore.getState().deductStock(item.product.id, item.quantity);
            });
          }
        }
        set((s) => ({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, ...updates } : o)),
        }));
      },

      getTodayOrders: () => {
        const today = getLocalDateStr();
        return get().orders.filter((o) => o.createdAt.slice(0, 10) === today);
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
interface CustomerState {
  customers: Customer[];
  upsertCustomer: (name: string, phone: string, referencia?: string) => void;
  getCustomerByPhone: (phone: string) => Customer | undefined;
  setFidelidadeOffset: (phone: string, offset: number) => void;
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

      setFidelidadeOffset: (phone, offset) => {
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
        const payload: Record<string, unknown> = {
          fidelidadeOffset: Math.max(0, autoTotal),
          fidelidadeEditadoEm: now,
          fidelidadeResgates: prevResgates + 1,
          fidelidadeUltimoResgate: now,
          phone: normalized,
        };
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
                fidelidadeOffset: Math.max(0, autoTotal),
                fidelidadeEditadoEm: now,
                fidelidadeResgates: prevResgates + 1,
                fidelidadeUltimoResgate: now,
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
                  fidelidadeOffset: Math.max(0, autoTotal),
                  fidelidadeEditadoEm: now,
                  fidelidadeResgates: 1,
                  fidelidadeUltimoResgate: now,
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
