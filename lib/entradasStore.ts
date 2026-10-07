import { create } from "zustand";
import { collection, doc, runTransaction, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { quandoAutenticado } from "./authSync";
import { assinarColecao } from "./retrySnapshot";
import { notifyError, notifySuccess } from "./notifications";
import { useEstoqueStore, montarDadosLote, sincronizarPrecoMedioInsumo, type Batch } from "./estoqueStore";
import { useExpenseStore } from "./store";
import {
  categoriaDoInsumo,
  custoUnitarioComFrete,
  descricaoDespesaEntrada,
  dividirValorPorCategoria,
  montarDadosDespesaEntrada,
  montarDadosEntrada,
  money,
  novoId,
  ratearFrete,
  round2,
  slugFornecedor,
  validarEntrada,
} from "./entradas";
import type { EntradaItem, EntradaMercadoria, Expense } from "@/types/database";

// ═══════════ TIPOS ═══════════

export interface DadosEntrada {
  fornecedor: string;
  data: string;
  frete: number;
  itens: { insumoId: string; brandId: string; qtd: number; custoUnitario: number }[];
  formaPagamento: string;
  aVista: boolean;
  parcelas: { vencimento: string; valor: number }[];
}

interface EntradasState {
  entradas: EntradaMercadoria[];
  fornecedores: string[];
  carregado: boolean;
  registrarEntrada: (dados: DadosEntrada) => Promise<string>;
  estornarEntrada: (entradaId: string) => Promise<void>;
  salvarFornecedor: (nome: string) => Promise<void>;
}

// ═══════════ STORE ═══════════

export const useEntradasStore = create<EntradasState>()((set, get) => ({
  entradas: [],
  fornecedores: [],
  carregado: false,

  registrarEntrada: async (dados) => {
    const insumos = useEstoqueStore.getState().insumos;
    const itens: EntradaItem[] = dados.itens.map((i) => ({
      insumoId: i.insumoId,
      nome: insumos.find((s) => s.id === i.insumoId)?.name || i.insumoId,
      brandId: i.brandId || "",
      qtd: i.qtd,
      custoUnitario: i.custoUnitario,
    }));

    const subtotal = round2(itens.reduce((s, i) => s + i.qtd * i.custoUnitario, 0));
    const frete = round2(dados.frete);
    const total = round2(subtotal + frete);

    const erro = validarEntrada({
      fornecedor: dados.fornecedor,
      data: dados.data,
      itens,
      parcelas: dados.parcelas,
      total,
    });
    if (erro) {
      notifyError("Entrada invalida", erro);
      throw new Error(erro);
    }

    try {
      const entradaId = crypto.randomUUID();
      const criadoEm = new Date().toISOString();
      const parcelas = dados.parcelas.map((p, i) => ({
        numero: i + 1,
        vencimento: p.vencimento,
        valor: round2(p.valor),
      }));

      const rateio = ratearFrete(subtotal, frete, itens);
      const novosLotes: Batch[] = itens.map((item, i) => ({
        id: novoId("b-"),
        insumoId: item.insumoId,
        brandId: item.brandId,
        dataEntrada: dados.data,
        quantidadeInicial: item.qtd,
        quantidadeRestante: item.qtd,
        precoUnitario: custoUnitarioComFrete(item, rateio[i] || 0),
      }));

      const porCategoria = new Map<string, number>();
      itens.forEach((item, i) => {
        const categoria = categoriaDoInsumo(insumos.find((s) => s.id === item.insumoId)?.category);
        const valorItem = item.qtd * item.custoUnitario + (rateio[i] || 0);
        porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + valorItem);
      });
      const partesCategoria = [...porCategoria].map(([categoria, valor]) => ({ categoria, valor: round2(valor) }));

      const novasDespesas: Expense[] = parcelas.flatMap((p) => {
        const base = descricaoDespesaEntrada(dados.fornecedor.trim(), p.numero, parcelas.length);
        const divisao = dividirValorPorCategoria(partesCategoria, p.valor);
        return divisao.map((parte) => ({
          id: novoId("dep-"),
          ...montarDadosDespesaEntrada({
            descricao: divisao.length > 1 ? `${base} · ${parte.categoria}` : base,
            valor: parte.valor,
            data: dados.data,
            vencimento: p.vencimento,
            entradaId,
            criadoEm,
            status: dados.aVista ? "Pago" : "Pendente",
            categoria: parte.categoria,
            parcela: p.numero,
          }),
        }));
      });

      const entrada: EntradaMercadoria = {
        id: entradaId,
        fornecedor: dados.fornecedor.trim(),
        data: dados.data,
        itens,
        subtotal,
        frete,
        total,
        formaPagamento: dados.formaPagamento,
        aVista: dados.aVista,
        parcelas,
        criadoEm,
        despesaIds: novasDespesas.map((d) => d.id),
        loteIds: novosLotes.map((l) => l.id),
      };

      const escrita = writeBatch(db);
      escrita.set(doc(db, "entradas-mercadoria", entradaId), montarDadosEntrada(entrada));
      novasDespesas.forEach((d) => {
        const { id, ...resto } = d;
        escrita.set(doc(db, "despesas", id), resto);
      });
      novosLotes.forEach((l) => escrita.set(doc(db, "lotes", l.id), montarDadosLote(l)));
      const fornecedorNome = entrada.fornecedor;
      if (slugFornecedor(fornecedorNome)) {
        escrita.set(doc(db, "fornecedores", slugFornecedor(fornecedorNome)), { nome: fornecedorNome }, { merge: true });
      }
      await escrita.commit();

      set((s) => ({
        entradas: s.entradas.some((e) => e.id === entradaId) ? s.entradas : [entrada, ...s.entradas],
        fornecedores: s.fornecedores.some((f) => f.toLowerCase() === fornecedorNome.toLowerCase())
          ? s.fornecedores
          : [...s.fornecedores, fornecedorNome].sort((a, b) => a.localeCompare(b)),
      }));
      const lotesAtuais = useEstoqueStore.getState().lotes;
      useEstoqueStore.setState({
        lotes: [...lotesAtuais, ...novosLotes.filter((l) => !lotesAtuais.some((x) => x.id === l.id))],
      });
      [...new Set(dados.itens.map((i) => i.insumoId))].forEach(sincronizarPrecoMedioInsumo);
      const despAtuais = useExpenseStore.getState().expenses;
      useExpenseStore.setState({
        expenses: [...novasDespesas.filter((d) => !despAtuais.some((x) => x.id === d.id)), ...despAtuais],
      });

      notifySuccess(
        "Entrada registrada",
        `${entrada.fornecedor} — ${itens.length} item(ns), ${parcelas.length}x de R$ ${money(parcelas[0].valor)}`
      );
      return entradaId;
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Nao foi possivel registrar a entrada.";
      notifyError("Erro", msg);
      throw err;
    }
  },

  estornarEntrada: async (entradaId) => {
    try {
      await runTransaction(db, async (t) => {
        const ref = doc(db, "entradas-mercadoria", entradaId);
        const snap = await t.get(ref);
        if (!snap.exists()) throw new Error("Entrada nao encontrada.");
        const entrada = { id: snap.id, ...(snap.data() as Omit<EntradaMercadoria, "id">) } as EntradaMercadoria;
        const ehAvista =
          entrada.aVista ?? (entrada.parcelas.length === 1 && entrada.parcelas[0]?.vencimento === entrada.data);

        if (!ehAvista) {
          for (let i = 0; i < entrada.despesaIds.length; i++) {
            const despSnap = await t.get(doc(db, "despesas", entrada.despesaIds[i]));
            if (despSnap.exists()) {
              const desp = despSnap.data() as Partial<Expense>;
              if (desp.status === "Pago") {
                throw new Error(
                  `A parcela ${desp.parcela ?? i + 1} de ${entrada.parcelas.length} ja esta paga. Apague a despesa no Financeiro (botao X) antes de estornar a entrada.`
                );
              }
            }
          }
        }

        t.delete(ref);
        entrada.despesaIds.forEach((id) => t.delete(doc(db, "despesas", id)));
        entrada.loteIds.forEach((id) => t.delete(doc(db, "lotes", id)));
        return entrada;
      });

      const entrada = get().entradas.find((e) => e.id === entradaId);
      set((s) => ({ entradas: s.entradas.filter((e) => e.id !== entradaId) }));
      if (entrada) {
        useEstoqueStore.setState({
          lotes: useEstoqueStore.getState().lotes.filter((l) => !entrada.loteIds.includes(l.id)),
        });
        [...new Set(entrada.itens.map((i) => i.insumoId))].forEach(sincronizarPrecoMedioInsumo);
        useExpenseStore.setState({
          expenses: useExpenseStore.getState().expenses.filter((e) => !entrada.despesaIds.includes(e.id)),
        });
      }
      notifySuccess("Entrada estornada", "Despesas e lotes removidos com sucesso.");
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Nao foi possivel estornar a entrada.";
      notifyError("Erro", msg);
      throw err;
    }
  },

  salvarFornecedor: async (nome) => {
    const limpo = (nome || "").trim();
    if (!limpo) {
      const erro = new Error("Informe o nome do fornecedor.");
      notifyError("Erro", erro.message);
      throw erro;
    }
    try {
      await setDoc(
        doc(db, "fornecedores", slugFornecedor(limpo)),
        { nome: limpo, atualizadoEm: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Nao foi possivel cadastrar o fornecedor.";
      notifyError("Erro", msg);
      throw err;
    }
    set((s) =>
      s.fornecedores.some((f) => f.toLowerCase() === limpo.toLowerCase())
        ? {}
        : { fornecedores: [...s.fornecedores, limpo].sort((a, b) => a.localeCompare(b)) }
    );
    notifySuccess("Fornecedor cadastrado", limpo);
  },
}));

// ═══════════ ASSINATURAS ═══════════

if (typeof window !== "undefined") {
  quandoAutenticado(() => {
    const cancelarEntradas = assinarColecao("entradas de mercadoria", collection(db, "entradas-mercadoria"), (snapshot) => {
      const entradas = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<EntradaMercadoria, "id">) } as EntradaMercadoria))
        .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      useEntradasStore.setState({ entradas, carregado: true });
    });
    const cancelarFornecedores = assinarColecao("fornecedores", collection(db, "fornecedores"), (snapshot) => {
      const fornecedores = snapshot.docs
        .map((d) => (d.data() as { nome?: string }).nome || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      useEntradasStore.setState({ fornecedores });
    });
    return () => {
      cancelarEntradas();
      cancelarFornecedores();
    };
  });
}
