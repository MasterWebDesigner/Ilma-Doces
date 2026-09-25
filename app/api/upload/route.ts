import { promises as fs } from "fs";
import path from "path";

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Arquivo ausente." }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return Response.json(
        { error: "Formato inválido. Use jpg, png, webp, gif ou avif." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "Imagem muito grande. Máximo 8MB." }, { status: 400 });
    }

    const base = slugify(path.basename(file.name, path.extname(file.name)));
    const dir = path.join(process.cwd(), "public", "imagens");
    await fs.mkdir(dir, { recursive: true });

    let fileName = `${base}${ext}`;
    let counter = 2;
    while (
      await fs
        .access(path.join(dir, fileName))
        .then(() => true)
        .catch(() => false)
    ) {
      fileName = `${base}-${counter}${ext}`;
      counter += 1;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, fileName), buffer);

    return Response.json({ path: `/imagens/${fileName}` });
  } catch (err) {
    console.error("upload error:", err);
    return Response.json({ error: "Erro ao salvar a imagem." }, { status: 500 });
  }
}
