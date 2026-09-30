import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const env = {};
const caminhoEnv = resolve(process.cwd(), ".env.local");
if (existsSync(caminhoEnv)) {
  for (const linha of readFileSync(caminhoEnv, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}

const BUCKET = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
const SENHA = env.NEXT_PUBLIC_LOCAL_SENHA || "local1234";
const EMAIL = "ilmadoces370@gmail.com";
const FS_PORT = Number(process.env.ILMA_FS_PORT || 8080);
const AUTH_URL = process.env.ILMA_AUTH_URL || "http://127.0.0.1:9099";
const STORAGE_URL = process.env.ILMA_STORAGE_URL || "http://127.0.0.1:9199";

const app = initializeApp({ apiKey: "demo-key", projectId: "demo-ilma-doces", authDomain: "localhost" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", FS_PORT);
const auth = getAuth(app);
connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });

let ok = 0;
let falhas = 0;

function registrar(nome, resultado, detalhe = "") {
  if (resultado) {
    ok++;
    console.log(`  OK   ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

async function devePermitir(nome, fn) {
  try {
    await fn();
    registrar(nome, true);
  } catch (err) {
    registrar(nome, false, `esperava permitir, veio: ${err.message}`);
  }
}

async function deveNegar(nome, fn) {
  try {
    await fn();
    registrar(nome, false, "esperava negar e foi permitido");
  } catch (err) {
    const negado = err?.code === "permission-denied" || /permission|insufficient/i.test(String(err?.message || ""));
    registrar(nome, negado, negado ? "" : `erro inesperado: [${err?.code}] ${err?.message}`);
  }
}

const pedidoAnon = (extras = {}) => ({
  id: "t-anon-1",
  status: "pendente",
  origem: "site",
  total: 120,
  customerName: "Cliente Teste",
  customerPhone: "11999990001",
  items: [{ quantity: 1 }],
  deliveryType: "retirada",
  paymentMethod: "pix",
  createdAt: new Date().toISOString(),
  orderNumber: "0001",
  ...extras,
});

console.log("\n— SEM AUTENTICACAO (visitante do site) —");
await deveNegar("le a colecao pedidos", () => getDocs(collection(db, "pedidos")));
await deveNegar("le a colecao clientes", () => getDocs(collection(db, "clientes")));
await deveNegar("le a colecao financeiro", () => getDocs(collection(db, "financeiro")));
await deveNegar("le a colecao credores", () => getDocs(collection(db, "credores")));
await deveNegar("le a colecao despesas", () => getDocs(collection(db, "despesas")));
await deveNegar("le a colecao fichas_tecnicas", () => getDocs(collection(db, "fichas_tecnicas")));
await devePermitir("le a colecao produtos", () => getDocs(collection(db, "produtos")));
await devePermitir("le a colecao categorias", () => getDocs(collection(db, "categorias")));
await devePermitir("le a colecao marcas", () => getDocs(collection(db, "marcas")));
await devePermitir("le configuracoes/loja", () => getDocs(collection(db, "configuracoes")));

await devePermitir("cria pedido de checkout (pendente/site)", () =>
  setDoc(doc(db, "pedidos", "t-anon-1"), pedidoAnon())
);
await deveNegar("cria pedido ja confirmado", () =>
  setDoc(doc(db, "pedidos", "t-anon-2"), pedidoAnon({ id: "t-anon-2", status: "confirmado" }))
);
await deveNegar("cria pedido com sinal pago declarado", () =>
  setDoc(doc(db, "pedidos", "t-anon-3"), pedidoAnon({ id: "t-anon-3", valorPagoSinal: 50 }))
);
await deveNegar("cria pedido manual (origem manual)", () =>
  setDoc(doc(db, "pedidos", "t-anon-4"), pedidoAnon({ id: "t-anon-4", origem: "manual" }))
);
await deveNegar("atualiza um pedido", () =>
  setDoc(doc(db, "pedidos", "t-anon-1"), { status: "concluido" }, { merge: true })
);
await deveNegar("apaga um pedido", () => deleteDoc(doc(db, "pedidos", "t-anon-1")));

await devePermitir("cria cadastro de cliente no checkout", () =>
  setDoc(doc(db, "clientes", "11999990001"), {
    name: "Cliente Teste",
    phone: "11999990001",
    lastOrderDate: new Date().toISOString(),
    status: "Nova",
    referencia: "",
  })
);
await devePermitir("atualiza nome do proprio cliente", () =>
  setDoc(doc(db, "clientes", "11999990001"), { name: "Cliente Teste Editado" }, { merge: true })
);
await deveNegar("altera totalSpent do cliente", () =>
  setDoc(doc(db, "clientes", "11999990001"), { totalSpent: 99999 }, { merge: true })
);
await deveNegar("altera fidelidade para status que nao e Nova", () =>
  setDoc(doc(db, "clientes", "11999990001"), { status: "Inativa" }, { merge: true })
);
await deveNegar("le a lista de clientes", () => getDocs(collection(db, "clientes")));

await devePermitir("registra despesa de brinde", () =>
  setDoc(doc(db, "despesas", "t-brinde-1"), {
    descricao: "BRINDE — Bolo — Cliente Teste",
    categoria: "Custos de Brindes / Fidelidade",
    valor: 12.5,
    data: "2026-09-30",
    status: "Pago",
  })
);
await deveNegar("registra despesa comum", () =>
  setDoc(doc(db, "despesas", "t-desp-1"), {
    descricao: "Aluguel",
    categoria: "Custos Fixos",
    valor: 1000,
    data: "2026-09-30",
    status: "Pendente",
  })
);

const contadorExiste = await getDoc(doc(db, "contadores", "pedidos"));
const contadorOriginal = contadorExiste.exists() ? Number(contadorExiste.data()?.valor) || 0 : null;
if (contadorOriginal === null) {
  await devePermitir("contador cria com valor 1", () =>
    setDoc(doc(db, "contadores", "pedidos"), { valor: 1 })
  );
}
const valorContador = contadorOriginal ?? 1;
await devePermitir("contador incrementa em 1", () =>
  setDoc(doc(db, "contadores", "pedidos"), { valor: valorContador + 1 }, { merge: true })
);
await deveNegar("contador pula 2 numeros", () =>
  setDoc(doc(db, "contadores", "pedidos"), { valor: valorContador + 3 }, { merge: true })
);

await devePermitir("lê o contador", () => getDocs(collection(db, "contadores")));

await deveNegar("lista a colecao fidelidade", () => getDocs(collection(db, "fidelidade")));
await deveNegar("grava saldo de fidelidade", () =>
  setDoc(doc(db, "fidelidade", "11999990001"), { saldo: 999, autoTotal: 999 })
);

console.log("\n— LOTE DE CHECKOUT (batch pedido + cliente) —");
await devePermitir("batch pedido+cliente do checkout", async () => {
  const batch = writeBatch(db);
  batch.set(doc(db, "pedidos", "t-batch-1"), pedidoAnon({ id: "t-batch-1", orderNumber: "0002" }));
  batch.set(
    doc(db, "clientes", "11999990002"),
    { name: "Cliente Teste 2", phone: "11999990002", lastOrderDate: new Date().toISOString(), status: "Nova" },
    { merge: true }
  );
  await batch.commit();
});

console.log("\n— COM AUTENTICACAO (painel) —");
try {
  await createUserWithEmailAndPassword(auth, EMAIL, SENHA);
} catch (err) {
  if (err?.code === "auth/email-already-in-use") {
    try {
      await signInWithEmailAndPassword(auth, EMAIL, SENHA);
    } catch (erroEntrar) {
      registrar("entra com o usuario do painel no emulador", false, erroEntrar.message);
    }
  } else {
    registrar("cria usuario do painel no emulador", false, err.message);
  }
}
if (!auth.currentUser) registrar("sessao autenticada do painel", false, "sem usuario logado");

await devePermitir("le a lista de pedidos", () => getDocs(collection(db, "pedidos")));
await devePermitir("le a lista de clientes", () => getDocs(collection(db, "clientes")));
await devePermitir("le a lista de financeiro", () => getDocs(collection(db, "financeiro")));
await devePermitir("cria pedido confirmado", () =>
  setDoc(doc(db, "pedidos", "t-adm-1"), pedidoAnon({ id: "t-adm-1", status: "confirmado", origem: "manual" }))
);
await devePermitir("atualiza totalSpent do cliente", () =>
  setDoc(doc(db, "clientes", "11999990001"), { totalSpent: 250 }, { merge: true })
);
await devePermitir("apaga pedido", () => deleteDoc(doc(db, "pedidos", "t-adm-1")));
await devePermitir("contador salta para numero maior", () =>
  setDoc(doc(db, "contadores", "pedidos"), { valor: valorContador + 7 }, { merge: true })
);
await devePermitir("grava configuracoes da loja", () =>
  setDoc(doc(db, "configuracoes", "loja"), { storeName: "Ilma Doces" }, { merge: true })
);
await devePermitir("fidelidade: painel grava saldo agregado", () =>
  setDoc(
    doc(db, "fidelidade", "11999990001"),
    { saldo: 40, autoTotal: 100, atualizadoEm: new Date().toISOString() },
    { merge: true }
  )
);
await devePermitir("fidelidade: painel lista saldos", () => getDocs(collection(db, "fidelidade")));
await devePermitir("fidelidade: painel le um saldo", () => getDoc(doc(db, "fidelidade", "11999990001")));

const token = await auth.currentUser?.getIdToken();

console.log("\n— STORAGE (upload da rota /api/upload) —");
const storageNoAr = await new Promise((resolver) => {
  const conexao = createConnection({ host: "127.0.0.1", port: Number(new URL(STORAGE_URL).port) || 80 });
  conexao.setTimeout(500);
  conexao.on("connect", () => {
    conexao.destroy();
    resolver(true);
  });
  conexao.on("error", () => resolver(false));
  conexao.on("timeout", () => {
    conexao.destroy();
    resolver(false);
  });
});
if (!storageNoAr) {
  console.log("  AVISO emulador de Storage (9199) desligado — testes de storage pulados. Reinicie o npm run dev.");
} else if (!BUCKET) {
  registrar("bucket configurado", false, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ausente");
} else {
  const conteudo = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
  );
  const urlUpload = `${STORAGE_URL}/v0/b/${BUCKET}/o?name=${encodeURIComponent("imagens/RegraProbe.png")}&uploadType=media`;

  await deveNegar("storage nega upload sem sessao", () =>
    fetch(urlUpload, { method: "POST", headers: { "Content-Type": "image/png" }, body: conteudo }).then(async (r) => {
      if (r.ok) throw new Error("permitido sem sessao");
      return Promise.reject(new Error("permission denied"));
    })
  );

  await devePermitir("storage aceita upload autenticado", async () => {
    const r = await fetch(urlUpload, {
      method: "POST",
      headers: { "Content-Type": "image/png", Authorization: `Firebase ${token}` },
      body: conteudo,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  });

  await devePermitir("storage le metadados autenticado", async () => {
    const r = await fetch(`${STORAGE_URL}/v0/b/${BUCKET}/o/${encodeURIComponent("imagens/RegraProbe.png")}`, {
      headers: { Authorization: `Firebase ${token}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });

  await devePermitir("storage entrega a imagem publicamente", async () => {
    const r = await fetch(
      `${STORAGE_URL}/v0/b/${BUCKET}/o/${encodeURIComponent("imagens/RegraProbe.png")}?alt=media`
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
}

console.log("\n— DEPOIS DA SESSAO (visitante de novo) —");
await signOut(auth);
await devePermitir("fidelidade: visitante le um saldo", () => getDoc(doc(db, "fidelidade", "11999990001")));
await deveNegar("fidelidade: visitante nao lista todos os saldos", () => getDocs(collection(db, "fidelidade")));
await deveNegar("fidelidade: visitante nao grava saldo", () =>
  setDoc(doc(db, "fidelidade", "11999990001"), { saldo: 1 }, { merge: true })
);

console.log("\n— LIMPEZA —");
await signInWithEmailAndPassword(auth, EMAIL, SENHA);
for (const [col, id] of [
  ["pedidos", "t-anon-1"],
  ["pedidos", "t-batch-1"],
  ["pedidos", "t-adm-1"],
  ["clientes", "11999990001"],
  ["clientes", "11999990002"],
  ["despesas", "t-brinde-1"],
  ["despesas", "t-desp-1"],
  ["fidelidade", "11999990001"],
]) {
  try {
    await deleteDoc(doc(db, col, id));
  } catch {}
}
try {
  if (contadorOriginal !== null) {
    await setDoc(doc(db, "contadores", "pedidos"), { valor: contadorOriginal }, { merge: true });
  } else {
    await deleteDoc(doc(db, "contadores", "pedidos"));
  }
} catch {}
await signOut(auth);

console.log(`\nResultado: ${ok} ok, ${falhas} falha(s).`);
if (falhas > 0) process.exitCode = 1;
