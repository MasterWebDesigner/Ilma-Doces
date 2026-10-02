import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export const dynamic = "force-dynamic";

interface CheckItem {
  productId?: unknown;
  quantity?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const items: CheckItem[] = Array.isArray(body?.items) ? body.items : null;
    const origem: string = typeof body?.origem === "string" && body.origem ? body.origem : "site";

    if (!items || items.length === 0) {
      return Response.json({ error: "Lista de itens ausente." }, { status: 400 });
    }

    const insufficient: Array<{
      productId: string;
      nome: string;
      solicitado: number;
      disponivel: number;
      motivo?: "inativo" | "esgotado";
    }> = [];

    for (const item of items) {
      const productId = typeof item.productId === "string" ? item.productId.trim() : "";
      const quantity = Number(item.quantity);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

      const snap = await getDoc(doc(db, "produtos", productId));
      if (!snap.exists()) continue;

      const produto = snap.data() as {
        name?: string;
        controlarEstoque?: boolean;
        estoque?: number;
        is_available?: boolean;
        ativo?: boolean;
      };

      if (origem !== "balcao") {
        if (produto.ativo === false) {
          insufficient.push({
            productId,
            nome: produto.name || productId,
            solicitado: quantity,
            disponivel: 0,
            motivo: "inativo",
          });
          continue;
        }
        if (produto.is_available === false) {
          insufficient.push({
            productId,
            nome: produto.name || productId,
            solicitado: quantity,
            disponivel: 0,
            motivo: "esgotado",
          });
          continue;
        }
      }

      if (!produto.controlarEstoque) continue;

      const disponivel = Math.max(0, Number(produto.estoque) || 0);
      if (disponivel < quantity) {
        insufficient.push({
          productId,
          nome: produto.name || productId,
          solicitado: quantity,
          disponivel,
        });
      }
    }

    if (insufficient.length > 0) {
      return Response.json({ ok: false, insufficient }, { status: 409 });
    }

    return Response.json({ ok: true, insufficient: [] });
  } catch (err) {
    console.error("validar-estoque error:", err);
    return Response.json({ error: "Erro ao validar estoque." }, { status: 500 });
  }
}
