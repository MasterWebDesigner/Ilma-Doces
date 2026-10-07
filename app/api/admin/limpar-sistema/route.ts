import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function parseServiceAccount(raw: string) {
  const limpo = raw.trim().replace(/\s+/g, "");
  const tentativas = [raw.trim(), Buffer.from(limpo, "base64").toString("utf-8")];

  let ultimoErro: unknown;
  for (const tentativa of tentativas) {
    try {
      const parsed = JSON.parse(tentativa);
      if (parsed && typeof parsed === "object" && "project_id" in parsed) {
        return parsed;
      }
      ultimoErro = new Error("JSON válido mas sem project_id.");
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw new Error(
    `FIREBASE_SERVICE_ACCOUNT_KEY inválida: ${
      ultimoErro instanceof Error ? ultimoErro.message : "formato desconhecido"
    }`
  );
}

function getDb() {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }

  const emuladorLocal = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-ilma-doces";

  if (emuladorLocal) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    const app = initializeApp({ projectId });
    return getFirestore(app);
  }

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY é obrigatória em produção.");
  }

  const serviceAccount = parseServiceAccount(rawKey);

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });

  return getFirestore(app);
}

const COLECOES = [
  "pedidos",
  "clientes",
  "credores",
  "financeiro",
  "despesas",
  "fidelidade",
  "contadores",
  "entradas-mercadoria",
  "fornecedores",
] as const;

type Colecao = (typeof COLECOES)[number];

export async function POST(request: Request) {
  try {
    let body: { collection?: string; dryRun?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Corpo inválido. Envie JSON com a propriedade 'collection'.",
        },
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

    if (!COLECOES.includes(collection as Colecao)) {
      return NextResponse.json(
        {
          success: false,
          error: `Coleção inválida: "${collection}". Use: ${COLECOES.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const db = getDb();
    const snapshot = await db.collection(collection).get();

    if (body.dryRun === true) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        cleared: collection,
        found: snapshot.size,
        message: `Dry run: ${snapshot.size} registo(s) em "${collection}".`,
      });
    }

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        cleared: collection,
        deleted: 0,
        message: `Coleção "${collection}" já estava vazia.`,
      });
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    const apagados = snapshot.size;

    return NextResponse.json({
      success: true,
      cleared: collection,
      deleted: apagados,
      message: `Coleção "${collection}" limpa (${apagados} registo(s) apagado(s)).`,
    });
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : "Erro interno do servidor.";
    console.error("[limpar-sistema]", mensagem);
    return NextResponse.json(
      { success: false, error: mensagem },
      { status: 500 }
    );
  }
}
