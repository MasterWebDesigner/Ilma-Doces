import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

async function verificarToken(token: string): Promise<{ uid: string } | null> {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // Note: Supabase auth verification is simpler - we just check if the token is valid
    // The actual user verification can be done via Supabase Auth directly
    const data = await resp.json().catch(() => null);
    return resp.ok ? { uid: data?.[0]?.id?.toString() || null } : null;
  } catch {
    return null;
  }
}

async function objetoExiste(nome: string, token: string): Promise<boolean> {
  try {
    const { data } = await supabase
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
  return supabase.storage.from("produtos").upload(nome, file, {
    cacheControl: "max-age=3600",
    upsert: false,
  });
}

async function getPublicUrlSupabase(nome: string): Promise<string> {
  const { data } = supabase.storage.from("produtos").getPublicUrl(nome);
  return data.publicUrl;
}

export async function POST(req: Request) {
  try {
    const autorizacao = req.headers.get("authorization") || "";
    const token = autorizacao.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Sessão necessária para enviar imagens." }, { status: 401 });
    }
    const usuario = await verificarToken(token);
    if (!usuario) {
      return NextResponse.json({ error: "Sessão inválida. Entre novamente no painel." }, { status: 401 });
    }

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
    while (await objetoExiste(nome, token)) {
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