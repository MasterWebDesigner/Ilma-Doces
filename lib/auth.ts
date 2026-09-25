import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./firebase";

const MAPA_USUARIOS: Record<string, string> = {
  ilma: "ilmadoces370@gmail.com",
  ilmadoces: "ilmadoces370@gmail.com",
  navarro: "navarrodesigner23@gmail.com",
  daniel: "navarrodesigner23@gmail.com",
};

export function resolverEmail(entrada: string): string | null {
  const valor = entrada.trim().toLowerCase();
  if (!valor) return null;
  if (valor.includes("@")) return valor;
  return MAPA_USUARIOS[valor] ?? null;
}

const NOMES_CONECTADO: Record<string, string> = {
  "ilmadoces370@gmail.com": "Ilma conectada",
  "navarrodesigner23@gmail.com": "Master Conectado",
};

export function nomeConectado(email: string | null | undefined): string {
  if (!email) return "Conectado";
  const chave = email.trim().toLowerCase();
  const nome = NOMES_CONECTADO[chave];
  if (nome) return nome;
  return `${chave.split("@")[0]} conectado`;
}

export async function entrar(usuario: string, senha: string): Promise<void> {
  const email = resolverEmail(usuario);
  if (!email) {
    throw new Error("Usuário não encontrado.");
  }
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    console.error("[Login] Erro do Firebase signInWithEmailAndPassword:", err);
    const code = (err as { code?: string }).code;
    console.error("[Login] Código do erro:", code, "| E-mail usado:", email);
    if (
      code === "auth/invalid-credential" ||
      code === "auth/wrong-password" ||
      code === "auth/user-not-found" ||
      code === "auth/invalid-email"
    ) {
      throw new Error("Usuário ou senha inválidos.");
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    }
    if (code === "auth/network-request-failed") {
      throw new Error("Sem conexão com a internet. Verifique sua rede.");
    }
    throw new Error("Não foi possível entrar. Tente novamente.");
  }
}

export async function sair(): Promise<void> {
  await signOut(auth);
}

export function useAuth(): { user: User | null; carregando: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCarregando(false);
    });
    return () => unsub();
  }, []);

  return { user, carregando };
}
