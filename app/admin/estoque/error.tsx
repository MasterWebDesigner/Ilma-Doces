"use client";

export default function EstoqueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-bold text-white">Erro ao carregar estoque</h2>
      <p className="mt-2 text-sm text-neutral-400">{error.message}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-wine-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-wine-600"
      >
        Tentar novamente
      </button>
    </div>
  );
}
