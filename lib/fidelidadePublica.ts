import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { paraFidelidadePublica, type SaldoFidelidadePublico } from "./fidelidade";

export interface FidelidadePublica {
  autoTotal: number;
  offset: number;
  balance: number;
}

export async function consultarFidelidadePublica(phoneClean: string): Promise<FidelidadePublica> {
  if (phoneClean.length < 10) return paraFidelidadePublica(null);
  try {
    const snapshot = await getDoc(doc(db, "fidelidade", phoneClean));
    if (!snapshot.exists()) return paraFidelidadePublica(null);
    return paraFidelidadePublica(snapshot.data() as Partial<SaldoFidelidadePublico>);
  } catch {
    return paraFidelidadePublica(null);
  }
}
