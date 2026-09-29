"use client";

import { useSyncExternalStore } from "react";
import { formatarTelefone } from "@/lib/phone";

const CHAVE = "ilma-borrar-telefones";

const ouvintes = new Set<() => void>();

export const TELEFONE_OCULTO = "(••) •••••-••••";

function aplicarNoDocumento(ativo: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("phone-blurred", ativo);
}

export function borrarTelefonesAtivo(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CHAVE) === "1";
}

export function sincronizarBorracaoTelefones() {
  aplicarNoDocumento(borrarTelefonesAtivo());
}

export function definirBorracaoTelefones(ativo: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, ativo ? "1" : "0");
  aplicarNoDocumento(ativo);
  ouvintes.forEach((notificar) => notificar());
}

export function useBorracaoTelefones(): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      ouvintes.add(aoMudar);
      return () => {
        ouvintes.delete(aoMudar);
      };
    },
    borrarTelefonesAtivo,
    () => false
  );
}

export function OpcaoTelefone({ value, nome, telefone }: { value: string; nome: string; telefone: string }) {
  const borrado = useBorracaoTelefones();
  return (
    <option value={value}>
      {nome} ({borrado ? TELEFONE_OCULTO : formatarTelefone(telefone)})
    </option>
  );
}
