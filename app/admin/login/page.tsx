"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { entrar, useAuth } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (user) router.replace("/admin");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      await entrar(usuario, senha);
      router.replace("/admin");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Usuário ou senha inválidos.");
      setEnviando(false);
    }
  }

  if (user) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo/logo1.png" alt="Ilma Doces" className="h-14 w-auto object-contain" />
          <h1 className="mt-3 text-lg font-bold text-neutral-900 dark:text-white">
            Painel Administrativo
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Entre com o seu usuário e senha
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
              Usuário
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ex: ilma"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#8B1D22] dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
              Senha
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-[#8B1D22] dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600"
            />
          </div>

          {erro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-300">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B1D22] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#6f161b] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {enviando ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Entrar"
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          Acesso restrito à equipe Ilma Doces
        </p>
      </div>
    </main>
  );
}
