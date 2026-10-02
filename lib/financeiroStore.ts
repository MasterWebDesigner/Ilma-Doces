import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from './firebase';
import { quandoAutenticado } from './authSync';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { assinarColecao } from './retrySnapshot';
import type { FinancialTransaction } from '@/types/database';

export function montarTransacao(data: Omit<FinancialTransaction, 'id' | 'createdAt'>): FinancialTransaction {
  return {
    ...data,
    id: 'fin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
  };
}

interface FinanceiroState {
  transactions: FinancialTransaction[];
  addTransaction: (tx: Omit<FinancialTransaction, 'id' | 'createdAt'>) => string;
  deleteTransaction: (id: string) => void;
  incluirTransacaoLocal: (tx: FinancialTransaction) => void;
  removerTransacaoLocal: (id: string) => void;
}

if (typeof window !== "undefined") {
  quandoAutenticado(() =>
    assinarColecao("financeiro", collection(db, "financeiro"), (snapshot) => {
      const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialTransaction));
      useFinanceiroStore.setState({ transactions });
    })
  );
}

export const useFinanceiroStore = create<FinanceiroState>()(
  persist(
    (set) => ({
      transactions: [],
      addTransaction: (data) => {
        const tx = montarTransacao(data);
        setDoc(doc(db, "financeiro", tx.id), tx);
        return tx.id;
      },
      deleteTransaction: (id) => {
        deleteDoc(doc(db, "financeiro", id));
      },
      incluirTransacaoLocal: (tx) =>
        set((s) => ({ transactions: s.transactions.some((t) => t.id === tx.id) ? s.transactions : [tx, ...s.transactions] })),
      removerTransacaoLocal: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
    }),
    { name: 'ilma-financeiro-store' }
  )
);
