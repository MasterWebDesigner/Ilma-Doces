import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-bold text-white">Página não encontrada</h2>
      <p className="mt-2 text-sm text-neutral-400">A página que você procura não existe.</p>
      <Link
        href="/admin"
        className="mt-6 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-wine-600"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}
