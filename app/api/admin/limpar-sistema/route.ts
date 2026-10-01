import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type LimparSistemaBody = {
  collection: "pedidos" | "clientes" | "credores" | "financeiro" | "despesas";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LimparSistemaBody;
    const { collection } = body;

    if (!collection) {
      return NextResponse.json({ error: "Coleção não informada." }, { status: 400 });
    }

    const collectionsToClear: Record<
      "pedidos" | "clientes" | "credores" | "financeiro" | "despesas",
      { table: string; idField: string }
    > = {
      pedidos: { table: "pedidos", idField: "id" },
      clientes: { table: "clientes", idField: "id" },
      credores: { table: "credores", idField: "id" },
      financeiro: { table: "financeiro", idField: "id" },
      despesas: { table: "despesas", idField: "id" },
    };

    const { table, idField } = collectionsToClear[collection];

    if (!table) {
      return NextResponse.json({ error: "Coleção inválida." }, { status: 400 });
    }

    // Fetch all records from the table
    const { data: records, error: fetchError } = await supabase
      .from(table)
      .select(idField);

    if (fetchError) {
      console.error(`Erro ao buscar registros de ${table}:`, fetchError);
      return NextResponse.json({ error: "Erro ao buscar registros." }, { status: 500 });
    }

    if (records && Array.isArray(records) && records.length > 0) {
      // Delete each record safely
      for (const record of records) {
        const idValue = record[idField as keyof typeof record];
        if (idValue !== undefined && idValue !== null) {
          await supabase.from(table).delete().eq(idField as string, idValue as string | number);
        }
      }
    }

    return NextResponse.json({ success: true, cleared: collection });
  } catch (err: any) {
    console.error("Erro na rota limpar-sistema:", err);
    return NextResponse.json({ error: err.message || "Erro interno do servidor." }, { status: 500 });
  }
}