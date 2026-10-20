"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { entrar, useAuth } from "@/lib/auth";

const FEATURES = [
  {
    titulo: "Venda Rápida",
    descricao: "Balcão e PIX em segundos",
    icone: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    titulo: "Pedidos & Fidelidade",
    descricao: "Clientes e brindes sob controle",
    icone: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    titulo: "Estoque & Financeiro",
    descricao: "Insumos, entradas e faturamento",
    icone: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
    <main className="flex min-h-screen bg-[#0A0A0A]">
      <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#8B1D22] via-[#6f161b] to-[#3d0b0d] p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

        <Link href="/" className="relative flex items-center gap-3">
          <img src="/logo/logo1.png" alt="Ilma Doces" className="h-12 w-auto object-contain" />
          <div>
            <p className="text-lg font-bold leading-none">Ilma Doces</p>
            <p className="mt-1 text-[11px] text-white/70">Confeitaria Artesanal</p>
          </div>
        </Link>

        <div className="relative my-auto max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight">
            Sua confeitaria artesanal, sob controle.
          </h1>
          <div className="mt-8 space-y-3">
            {FEATURES.map((item) => (
              <div key={item.titulo} className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 p-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  {item.icone}
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.titulo}</p>
                  <p className="text-xs text-white/70">{item.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.2em] text-white/60">
          Ilma Doces · Confeitaria Artesanal
        </p>
      </aside>

      <section className="relative flex flex-1 flex-col px-6 py-6 sm:px-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 transition-colors hover:text-white">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Voltar para o site
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/logo/logo1.png" alt="Ilma Doces" className="h-10 w-auto object-contain" />
            <span className="text-sm font-bold text-white">Ilma Doces</span>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h2 className="text-2xl font-bold text-white">Entre na sua conta</h2>
          <p className="mt-1 text-sm text-neutral-400">Bem-vindo de volta</p>

          {process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1" && (
            <div className="mt-5 rounded-xl border border-[#8B1D22]/50 bg-[#8B1D22]/10 px-3 py-2.5 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#e8b4b8]">
                Ambiente local — testes não afetam a produção
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                Usuário: <strong>ilma</strong> ou <strong>navarro</strong> · Senha:{" "}
                <strong>{process.env.NEXT_PUBLIC_LOCAL_SENHA}</strong>
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300" htmlFor="usuario">
                Usuário ou e-mail
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  id="usuario"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ex: ilma"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 py-3 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-[#8B1D22]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300" htmlFor="senha">
                Senha
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </span>
                <input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 py-3 pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-[#8B1D22]"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-500 transition-colors hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {erro && (
              <p className="rounded-lg border border-red-900/60 bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-300">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#8B1D22] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#721519] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {enviando ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-auto pt-8 text-center text-[11px] text-neutral-500">
          Acesso restrito à equipe Ilma Doces
        </p>
      </section>
    </main>
  );
}
