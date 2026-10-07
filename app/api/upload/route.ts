import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const MAX_SIZE = 8 * 1024 * 1024;

function slugify(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "Imagem";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

async function objetoExiste(nome: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("storage")
      .select("name")
      .eq("name", nome)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

async function uploadParaSupabase(nome: string, file: File): Promise<{ data: any; error: any }> {
  return supabaseAdmin.storage.from("produtos").upload(nome, file, {
    cacheControl: "max-age=3600",
    upsert: false,
  });
}

async function getPublicUrlSupabase(nome: string): Promise<string> {
  const { data } = supabaseAdmin.storage.from("produtos").getPublicUrl(nome);
  return data.publicUrl;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    }

    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: "Formato inválido. Use jpg, png, webp, gif ou avif." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Imagem muito grande. Máximo 8MB." }, { status: 400 });
    }

    const base = slugify(file.name.replace(/\.[a-z0-9]+$/i, "")) || "Imagem";
    let nome = `${base}${ext}`;
    let contador = 2;
    while (await objetoExiste(nome)) {
      nome = `${base}-${contador}${ext}`;
      contador += 1;
      if (contador > 500) break;
    }

    const { data, error } = await uploadParaSupabase(nome, file);
    if (error) {
      console.error("Supabase upload error:", error);
      return NextResponse.json({ error: "Não foi possível enviar a imagem ao Supabase Storage." }, { status: 502 });
    }

    const publicUrl = await getPublicUrlSupabase(nome);
    return NextResponse.json({ path: publicUrl, nomeArquivo: nome });
  } catch (err) {
    console.error("upload error:", err);
    return NextResponse.json({ error: "Erro ao salvar a imagem." }, { status: 500 });
  }
}