export interface StockCheckItem {
  productId: string;
  quantity: number;
}

export interface StockInsufficient {
  productId: string;
  nome: string;
  solicitado: number;
  disponivel: number;
}

export async function validarEstoqueServidor(
  items: StockCheckItem[]
): Promise<{ ok: boolean; insufficient: StockInsufficient[]; error?: string }> {
  if (!items.length) return { ok: true, insufficient: [] };
  try {
    const res = await fetch("/api/pedidos/validar-estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 409 && data?.insufficient) {
      return { ok: false, insufficient: data.insufficient as StockInsufficient[] };
    }
    if (!res.ok) {
      return { ok: true, insufficient: [], error: data?.error || "Falha na validação de estoque." };
    }
    return { ok: true, insufficient: [] };
  } catch (err) {
    console.error("validarEstoqueServidor:", err);
    return { ok: true, insufficient: [], error: "Sem conexão com o servidor de estoque." };
  }
}

export function listarSemEstoque(insufficient: StockInsufficient[]): string {
  return insufficient
    .map((i) => `${i.nome} (disponível: ${i.disponivel}, pedido: ${i.solicitado})`)
    .join(", ");
}
