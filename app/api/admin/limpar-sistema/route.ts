import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const TABELAS: Record<string, string> = {
  pedidos: "pedidos",
  clientes: "clientes",
  credores: "credores",
  financeiro: "financeiro",
  despesas: "despesas",
};

let clienteSupabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (clienteSupabase) return clienteSupabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new Error(
      "Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias."
    );
  }

  clienteSupabase = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return clienteSupabase;
}

async function limparTabela(supabase: SupabaseClient, tabela: string): Promise<number> {
  const { data: registos, error: erroBusca } = await supabase
    .from(tabela)
    .select("id");

  if (erroBusca) {
    throw new Error(`Erro ao buscar registos de "${tabela}": ${erroBusca.message}`);
  }

  if (!registos || registos.length === 0) return 0;

  const ids = registos.map((r) => r.id);

  const { error: erroDelete } = await supabase
    .from(tabela)
    .delete()
    .in("id", ids);

  if (erroDelete) {
    throw new Error(`Erro ao apagar registos de "${tabela}": ${erroDelete.message}`);
  }

  return ids.length;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabase();

    let body: { collection?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo do pedido inválido. Envie JSON com a propriedade 'collection'." },
        { status: 400 }
      );
    }

    const { collection } = body;

    if (!collection) {
      return NextResponse.json(
        { success: false, error: "Propriedade 'collection' em falta." },
        { status: 400 }
      );
    }

    const tabela = TABELAS[collection];

    if (!tabela) {
      return NextResponse.json(
        { success: false, error: `Coleção inválida: "${collection}". Use: ${Object.keys(TABELAS).join(", ")}.` },
        { status: 400 }
      );
    }

    const apagados = await limparTabela(supabase, tabela);

    return NextResponse.json({
      success: true,
      cleared: collection,
      deleted: apagados,
      message: `Coleção "${collection}" limpa com sucesso (${apagados} registo(s) apagado(s)).`,
    });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro interno do servidor.";
    console.error("[limpar-sistema]", mensagem);
    return NextResponse.json({ success: false, error: mensagem }, { status: 500 });
  }
}
