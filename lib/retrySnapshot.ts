import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { onSnapshot } from "firebase/firestore";
import { notifyError, notifyInfo } from "./notifications";

const avisosDeFalha = new Set<string>();

const ATRASO_BASE_MS = 5000;
const ATRASO_MAX_MS = 30000;
const GRACIA_SAUDE_MS = 5000;

export function assinarComRetry(
  rotulo: string,
  assinar: (aoFalhar: (erro: Error) => void) => Unsubscribe
): Unsubscribe {
  let cancelado = false;
  let unsubscribe: Unsubscribe | null = null;
  let timerRetry: ReturnType<typeof setTimeout> | null = null;
  let timerSaude: ReturnType<typeof setTimeout> | null = null;
  let tentativas = 0;

  const limparTimers = () => {
    if (timerRetry) {
      clearTimeout(timerRetry);
      timerRetry = null;
    }
    if (timerSaude) {
      clearTimeout(timerSaude);
      timerSaude = null;
    }
  };

  const abrir = () => {
    if (cancelado) return;
    let morta = false;

    const aoFalhar = (erro: Error) => {
      morta = true;
      try {
        unsubscribe?.();
      } catch {}
      unsubscribe = null;
      if (timerSaude) {
        clearTimeout(timerSaude);
        timerSaude = null;
      }
      if (cancelado) return;
      if (!avisosDeFalha.has(rotulo)) {
        avisosDeFalha.add(rotulo);
        notifyError(
          "Sem conexão com o servidor",
          `Os dados de ${rotulo} podem estar desatualizados; nova tentativa automática em instantes.`
        );
      }
      tentativas += 1;
      const espera = Math.min(ATRASO_MAX_MS, ATRASO_BASE_MS * 2 ** Math.min(tentativas - 1, 3));
      console.warn(`[sync] falha ao assinar ${rotulo}: ${erro.message}; nova tentativa em ${espera}ms`);
      timerRetry = setTimeout(abrir, espera);
    };

    try {
      unsubscribe = assinar(aoFalhar);
    } catch (erro) {
      aoFalhar(erro instanceof Error ? erro : new Error(String(erro)));
      return;
    }
    if (cancelado) {
      try {
        unsubscribe?.();
      } catch {}
      unsubscribe = null;
      return;
    }

    timerSaude = setTimeout(() => {
      timerSaude = null;
      if (cancelado || morta) return;
      if (tentativas > 0) {
        tentativas = 0;
        if (avisosDeFalha.delete(rotulo)) {
          notifyInfo(
            "Conexão restabelecida",
            `Os dados de ${rotulo} voltaram a ser atualizados.`
          );
        }
      }
    }, GRACIA_SAUDE_MS);
  };

  abrir();

  return () => {
    cancelado = true;
    limparTimers();
    try {
      unsubscribe?.();
    } catch {}
    unsubscribe = null;
  };
}

export function assinarColecao(
  rotulo: string,
  consulta: Query<DocumentData> | CollectionReference<DocumentData>,
  aoDados: (snapshot: QuerySnapshot<DocumentData>) => void
): Unsubscribe {
  return assinarComRetry(rotulo, (aoFalhar) => onSnapshot(consulta, aoDados, aoFalhar));
}

export function assinarDocumento(
  rotulo: string,
  referencia: DocumentReference<DocumentData>,
  aoDados: (snapshot: DocumentSnapshot<DocumentData>) => void
): Unsubscribe {
  return assinarComRetry(rotulo, (aoFalhar) => onSnapshot(referencia, aoDados, aoFalhar));
}
