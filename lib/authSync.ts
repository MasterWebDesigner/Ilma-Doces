import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

type Cancelar = () => void;

export function quandoAutenticado(assinar: () => Cancelar): Cancelar {
  let cancelar: Cancelar | null = null;
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && !cancelar) {
      cancelar = assinar();
    } else if (!user && cancelar) {
      cancelar();
      cancelar = null;
    }
  });
}
