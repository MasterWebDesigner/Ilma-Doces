const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const MAX_SIZE = 8 * 1024 * 1024;

function emuladorLocal(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
}

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
  const base = emuladorLocal()
    ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
    : "https://identitytoolkit.googleapis.com/v1";
  const apiKey = emuladorLocal() ? "demo-key" : process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  try {
    const resp = await fetch(`${base}/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const uid = data?.users?.[0]?.localId;
    return typeof uid === "string" && uid ? { uid } : null;
  } catch {
    return null;
  }
}

function urlStorageBase(): string {
  return emuladorLocal()
    ? "http://127.0.0.1:9199"
    : "https://firebasestorage.googleapis.com";
}

function bucket(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
}

async function objetoExiste(nome: string, token: string): Promise<boolean> {
  const url = `${urlStorageBase()}/v0/b/${bucket()}/o/${encodeURIComponent(nome)}`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Firebase ${token}` } });
    return resp.ok;
  } catch {
    return false;
  }
}

async function enviarParaStorage(nome: string, conteudo: Blob, token: string): Promise<Response> {
  const url = `${urlStorageBase()}/v0/b/${bucket()}/o?name=${encodeURIComponent(nome)}&uploadType=media`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": conteudo.type || "application/octet-stream",
      Authorization: `Firebase ${token}`,
    },
    body: conteudo,
  });
}

async function montarUrlPublica(nome: string, respostaUpload: Record<string, unknown>, token: string): Promise<string> {
  const codificado = encodeURIComponent(nome);
  const semToken = `${urlStorageBase()}/v0/b/${bucket()}/o/${codificado}?alt=media`;
  const tokens = Array.isArray(respostaUpload?.downloadTokens)
    ? (respostaUpload.downloadTokens as string[]).filter(Boolean)
    : [];
  if (tokens.length > 0) return `${semToken}&token=${tokens[0]}`;

  if (emuladorLocal()) return semToken;

  const novoToken = crypto.randomUUID();
  try {
    const resp = await fetch(`${urlStorageBase()}/v0/b/${bucket()}/o/${codificado}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Firebase ${token}`,
      },
      body: JSON.stringify({ metadata: { downloadTokens: [novoToken] } }),
    });
    if (resp.ok) return `${semToken}&token=${novoToken}`;
  } catch {}
  return semToken;
}

export async function POST(req: Request) {
  try {
    const autorizacao = req.headers.get("authorization") || "";
    const token = autorizacao.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return Response.json({ error: "Sessão necessária para enviar imagens." }, { status: 401 });
    }
    const usuario = await verificarToken(token);
    if (!usuario) {
      return Response.json({ error: "Sessão inválida. Entre novamente no painel." }, { status: 401 });
    }

    if (!bucket()) {
      return Response.json({ error: "Storage não configurado (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)." }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Arquivo ausente." }, { status: 400 });
    }

    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return Response.json(
        { error: "Formato inválido. Use jpg, png, webp, gif ou avif." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "Imagem muito grande. Máximo 8MB." }, { status: 400 });
    }

    const base = slugify(file.name.replace(/\.[a-z0-9]+$/i, "")) || "Imagem";
    let nome = `imagens/${base}${ext}`;
    let contador = 2;
    while (await objetoExiste(nome, token)) {
      nome = `imagens/${base}-${contador}${ext}`;
      contador += 1;
      if (contador > 500) break;
    }

    const respUpload = await enviarParaStorage(nome, file, token);
    if (!respUpload.ok) {
      const detalhe = await respUpload.text().catch(() => "");
      console.error("upload storage error:", respUpload.status, detalhe);
      return Response.json({ error: "Não foi possível enviar a imagem ao Storage." }, { status: 502 });
    }

    const metadados = await respUpload.json().catch(() => ({}));
    const path = await montarUrlPublica(nome, metadados, token);
    return Response.json({ path });
  } catch (err) {
    console.error("upload error:", err);
    return Response.json({ error: "Erro ao salvar a imagem." }, { status: 500 });
  }
}
