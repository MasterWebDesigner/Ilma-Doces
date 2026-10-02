import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const raiz = process.cwd();
const dirBackup = path.join(raiz, "backups");

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

function serializar(valor) {
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(serializar);
  if (Buffer.isBuffer(valor)) return { __bytes: valor.toString("base64") };
  if (typeof valor.toDate === "function" && typeof valor.toMillis === "function") {
    return {
      seconds: valor.seconds,
      nanoseconds: valor.nanoseconds,
      iso: valor.toDate().toISOString(),
    };
  }
  const saida = {};
  for (const [chave, v] of Object.entries(valor)) saida[chave] = serializar(v);
  return saida;
}

function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function main() {
  const env = { ...process.env, ...lerEnvLocal() };
  const credencial = carregarCredencial(env);

  if (getApps().length === 0) {
    initializeApp({ credential: cert(credencial), projectId: credencial.project_id });
  }
  const db = getFirestore();

  console.log(`Backup da PRODUCAO (${credencial.project_id})...`);
  const colecoes = await db.listCollections();
  const backup = {
    geradoEm: new Date().toISOString(),
    projeto: credencial.project_id,
    colecoes: {},
  };

  let total = 0;
  for (const ref of colecoes) {
    const snap = await ref.get();
    const docs = {};
    snap.docs.forEach((d) => {
      docs[d.id] = serializar(d.data());
    });
    backup.colecoes[ref.id] = docs;
    total += snap.size;
    console.log(`  + ${ref.id}: ${snap.size} documento(s)`);
  }

  mkdirSync(dirBackup, { recursive: true });
  const arquivo = path.join(dirBackup, `firestore-${carimbo()}.json`);
  writeFileSync(arquivo, JSON.stringify(backup, null, 2), "utf8");

  console.log(`\nPronto: ${total} documento(s) em ${Object.keys(backup.colecoes).length} colecao(oes).`);
  console.log(`Arquivo: ${path.relative(raiz, arquivo)}`);
}

main().catch((err) => {
  console.error("db:backup falhou:", err.message);
  process.exitCode = 1;
});
