import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import type { FinancialTransaction } from '@/types/database';

interface FinanceiroState {
  transactions: FinancialTransaction[];
  addTransaction: (tx: Omit<FinancialTransaction, 'id' | 'createdAt'>) => string;
  deleteTransaction: (id: string) => void;
}

if (typeof window !== "undefined") {
  onSnapshot(collection(db, "financeiro"), (snapshot) => {
    const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialTransaction));
    useFinanceiroStore.setState({ transactions });
  });
}

export const useFinanceiroStore = create<FinanceiroState>()(
  persist(
    (set) => ({
      transactions: [],
      addTransaction: (data) => {
        const id = 'fin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        const tx: FinancialTransaction = {
          ...data,
          id,
          createdAt: new Date().toISOString(),
        };
        setDoc(doc(db, "financeiro", id), tx);
        return id;
      },
      deleteTransaction: (id) => {
        deleteDoc(doc(db, "financeiro", id));
      },
    }),
    { name: 'ilma-financeiro-store' }
  )
);
