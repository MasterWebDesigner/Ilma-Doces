import { readFileSync, existsSync } from "node:fs";
import net from "node:net";

const env = {};
const caminhoEnv = new URL("../.env.local", import.meta.url);
if (existsSync(caminhoEnv)) {
  for (const linha of readFileSync(caminhoEnv, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}

const PROJETO_PROD = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ilma-doces";
const PROJETO_LOCAL = "demo-ilma-doces";
const SENHA_LOCAL = env.NEXT_PUBLIC_LOCAL_SENHA || "local1234";
const API_KEY = env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const EMO = "http://127.0.0.1:8080";
const AUTH = "http://127.0.0.1:9099";
const USUARIOS = ["ilmadoces370@gmail.com", "navarrodesigner23@gmail.com"];
const COLECOES = [
  "categorias",
  "configuracoes",
  "produtos",
  "marcas",
  "fichas_tecnicas",
  "clientes",
  "credores",
  "despesas",
  "financeiro",
  "pedidos",
];

function ping(porta) {
  return new Promise((res) => {
    const s = net.connect({ port: porta, host: "127.0.0.1" }, () => {
      s.end();
      res(true);
    });
    s.on("error", () => res(false));
  });
}

async function listarProd(colecao) {
  const docs = [];
  let token = "";
  for (;;) {
    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJETO_PROD}/databases/(default)/documents/${colecao}?pageSize=300` +
      (token ? `&pageToken=${encodeURIComponent(token)}` : "") +
      (API_KEY ? `&key=${API_KEY}` : "");
    const r = await fetch(url);
    if (!r.ok) {
      const erro = await r.text();
      return { docs, status: r.status, erro };
    }
    const j = await r.json();
    docs.push(...(j.documents || []));
    token = j.nextPageToken || "";
    if (!token) break;
  }
  return { docs, status: 200, erro: "" };
}

async function listarLocal(colecao) {
  const url = `${EMO}/v1/projects/${PROJETO_LOCAL}/databases/(default)/documents/${colecao}?pageSize=1000`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  return (j.documents || []).map((d) => d.name.split("/").pop());
}

async function apagarLocal(colecao, ids) {
  for (const id of ids) {
    await fetch(
      `${EMO}/v1/projects/${PROJETO_LOCAL}/databases/(default)/documents/${colecao}/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  }
}

async function gravarLocal(colecao, doc) {
  const id = doc.name.split("/").pop();
  const r = await fetch(
    `${EMO}/v1/projects/${PROJETO_LOCAL}/databases/(default)/documents/${colecao}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: doc.fields || {} }),
    }
  );
  return r.ok;
}

async function criarUsuarios() {
  let criados = 0;
  for (const email of USUARIOS) {
    const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: SENHA_LOCAL, returnSecureToken: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      criados += 1;
      console.log(`  + usuario criado: ${email}`);
    } else if (j?.error?.message === "EMAIL_EXISTS") {
      console.log(`  = usuario ja existe: ${email}`);
    } else {
      console.log(`  ! falha ao criar ${email}: ${j?.error?.message || r.status}`);
    }
  }
  return criados;
}

async function main() {
  const [emoOk, authOk] = [await ping(8080), await ping(9099)];
  if (!emoOk || !authOk) {
    console.error("Emulador nao esta rodando. Suba o ambiente com: npm run dev");
    process.exitCode = 1;
    return;
  }

  console.log(`Sync PRODUCAO (${PROJETO_PROD}) -> EMULADOR LOCAL (${PROJETO_LOCAL})`);
  console.log("Direcao unica: nunca escreve em producao.\n");
  console.log("Usuarios do login local:");
  await criarUsuarios();

  let total = 0;
  let puladas = 0;
  console.log("\nColecoes:");
  for (const col of COLECOES) {
    const { docs, status, erro } = await listarProd(col);
    if (status !== 200) {
      console.log(`  - ${col}: SEM ACESSO PUBLICO (HTTP ${status}) — pulada`);
      puladas += 1;
      continue;
    }
    const locais = await listarLocal(col);
    await apagarLocal(col, locais);
    let ok = 0;
    for (const d of docs) {
      if (await gravarLocal(col, d)) ok += 1;
    }
    total += ok;
    console.log(`  + ${col}: ${ok} documento(s) copiado(s)`);
  }

  console.log(`\nPronto: ${total} documento(s) no ambiente local${puladas ? `, ${puladas} colecao(oes) pulada(s) por falta de acesso` : ""}.`);
  console.log("Obs: colecoes restritas em producao ficam vazias aqui; cadastre teste pelo proprio painel local.");
}

main().catch((err) => {
  console.error("Falha no sync:", err.message);
  process.exitCode = 1;
});
