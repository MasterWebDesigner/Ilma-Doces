import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const raiz = process.cwd();
const PROJETO_PROD = "ilma-doces";
const PROJETO_LOCAL = "demo-ilma-doces";
const EMO_HOST = "127.0.0.1:8080";

const alvo = (process.argv[2] || "").toLowerCase();

function lerEnvLocal() {
  const env = {};
  const caminho = new URL("../.env.local", import.meta.url);
  if (existsSync(caminho)) {
    for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

function parseServiceAccount(raw) {
  const limpo = raw.trim().replace(/\s+/g, "");
  const tentativas = [raw.trim(), Buffer.from(limpo, "base64").toString("utf-8")];
  let ultimoErro;
  for (const tentativa of tentativas) {
    try {
      const parsed = JSON.parse(tentativa);
      if (parsed && typeof parsed === "object" && "project_id" in parsed) return parsed;
      ultimoErro = new Error("JSON valido mas sem project_id.");
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw new Error(
    `credencial invalida: ${ultimoErro instanceof Error ? ultimoErro.message : "formato desconhecido"}`
  );
}

function carregarCredencial(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  }
  const candidatos = [
    env.FIREBASE_SERVICE_ACCOUNT_FILE,
    path.join(raiz, ".secrets", "service-account.json"),
  ].filter(Boolean);
  for (const caminho of candidatos) {
    const absoluto = path.resolve(raiz, caminho);
    if (existsSync(absoluto)) {
      return parseServiceAccount(readFileSync(absoluto, "utf8"));
    }
  }
  throw new Error(
    "credencial nao encontrada: defina FIREBASE_SERVICE_ACCOUNT_KEY ou FIREBASE_SERVICE_ACCOUNT_FILE em .env.local, ou coloque .secrets/service-account.json"
  );
}

function carregarMarcasSeed() {
  const ts = readFileSync(path.join(raiz, "lib", "seedData.ts"), "utf8");
  const inicio = ts.indexOf("export const SEED_BRANDS");
  if (inicio < 0) throw new Error("SEED_BRANDS nao encontrado em lib/seedData.ts");
  const bloco = ts.slice(inicio, ts.indexOf("];", inicio));
  const marcas = [...bloco.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*nome:\s*"([^"]+)"\s*\}/g)].map((m) => ({
    id: m[1],
    nome: m[2],
  }));
  if (marcas.length !== 37) {
    throw new Error(`SEED_BRANDS com ${marcas.length} marcas (esperado 37) — abortado`);
  }
  return marcas;
}

function ping(porta) {
  return new Promise((res) => {
    const s = net.connect({ port: porta, host: "127.0.0.1" }, () => {
      s.end();
      res(true);
    });
    s.on("error", () => res(false));
  });
}

async function sincronizar(db, rotulo, marcas) {
  console.log(`\n[${rotulo}] create-only: so cria o que nao existe (nunca sobrescreve).`);
  let criadas = 0;
  let existentes = 0;
  let falhas = 0;
  for (const { id, nome } of marcas) {
    try {
      const ref = db.collection("marcas").doc(id);
      const snap = await ref.get();
      if (snap.exists) {
        existentes += 1;
        continue;
      }
      await ref.set({ id, nome, status: "Ativa" });
      criadas += 1;
      console.log(`  + ${id} - ${nome}`);
    } catch (e) {
      falhas += 1;
      console.log(`  ! ${id}: ${e.message}`);
    }
  }
  console.log(`[${rotulo}] criadas=${criadas} ja-existiam=${existentes} falhas=${falhas}`);
  return falhas;
}

async function main() {
  if (!["prod", "local", "ambos"].includes(alvo)) {
    console.log("Uso: node scripts/sync-brands.mjs <prod|local|ambos>");
    console.log("  prod  - grava as 37 marcas do seed no Firestore de PRODUCAO (ilma-doces)");
    console.log("  local - grava no emulador (rode com o emulador no ar: npm run dev)");
    console.log("  ambos - prod e local");
    process.exitCode = 1;
    return;
  }

  const marcas = carregarMarcasSeed();
  console.log(`Marcas do seed: ${marcas.length} (ids br-01..br-37, create-only)`);
  let falhas = 0;

  if (alvo === "prod" || alvo === "ambos") {
    const env = lerEnvLocal();
    const cred = carregarCredencial(env);
    const app = initializeApp({ credential: cert(cred), projectId: PROJETO_PROD }, "prod");
    const db = getFirestore(app);
    falhas += await sincronizar(db, "PRODUCAO", marcas);
    await app.delete();
  }

  if (alvo === "local" || alvo === "ambos") {
    if (!(await ping(8080))) {
      console.error("\nEmulador local offline. Suba com: npm run dev (depois rode de novo)");
      process.exitCode = 1;
      return;
    }
    process.env.FIRESTORE_EMULATOR_HOST = EMO_HOST;
    const app = initializeApp({ projectId: PROJETO_LOCAL }, "local");
    const db = getFirestore(app);
    falhas += await sincronizar(db, "LOCAL", marcas);
    console.log("Obs: o emulador so grava em emulator-data/ na parada limpa (Ctrl+C no npm run dev).");
    await app.delete();
  }

  process.exitCode = falhas > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Falha no sync de marcas:", err.message);
  process.exitCode = 1;
});
