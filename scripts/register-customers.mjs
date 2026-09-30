import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
        })
    )
  : {};

const emuladorLocal = env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
const SENHA_LOCAL = env.NEXT_PUBLIC_LOCAL_SENHA || "local1234";
const USUARIO_LOCAL = "ilmadoces370@gmail.com";

if (!emuladorLocal) {
  console.error(
    "Este script semeia apenas dados de TESTE no ambiente local.\n" +
      "Rode com NEXT_PUBLIC_FIREBASE_EMULATOR=1 no .env.local e os emuladores ativos (npm run dev)."
  );
  process.exit(1);
}

const app = !getApps().length
  ? initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: "demo-ilma-doces",
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  : getApp();

const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

const customers = [
  { name: "Cliente Teste 01", referencia: "Ponto Teste", phone: "(11) 99999-0001" },
  { name: "Cliente Teste 02", referencia: "Sem Referencia", phone: "(11) 99999-0002" },
  { name: "Cliente Teste 03", referencia: "Ponto Teste", phone: "(11) 99999-0003" },
  { name: "Cliente Teste 04", referencia: "Sem Referencia", phone: "(11) 99999-0004" },
  { name: "Cliente Teste 05", referencia: "Sem Referencia", phone: "(11) 99999-0005" },
  { name: "Cliente Teste 06", referencia: "Ponto Teste", phone: "(11) 99999-0006" },
  { name: "Cliente Teste 07", referencia: "Sem Referencia", phone: "(11) 99999-0007" },
  { name: "Cliente Teste 08", referencia: "Sem Referencia", phone: "(11) 99999-0008" },
  { name: "Cliente Teste 09", referencia: "Sem Referencia", phone: "(11) 99999-0009" },
  { name: "Cliente Teste 10", referencia: "Ponto Teste", phone: "(11) 99999-0010" },
];

async function entrar() {
  try {
    await signInWithEmailAndPassword(auth, USUARIO_LOCAL, SENHA_LOCAL);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      await createUserWithEmailAndPassword(auth, USUARIO_LOCAL, SENHA_LOCAL);
      return;
    }
    throw err;
  }
}

async function main() {
  await entrar();
  let ok = 0;
  let skip = 0;
  for (const c of customers) {
    const id = c.phone.replace(/\D/g, "");
    if (!id) {
      console.log(`SKIP (sem telefone): ${c.name}`);
      skip++;
      continue;
    }
    const ref = doc(db, "clientes", id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      console.log(`EXISTE (merge referencia): ${c.name} → ${id}`);
      await setDoc(
        ref,
        { name: c.name, phone: id, referencia: c.referencia },
        { merge: true }
      );
    } else {
      console.log(`CRIADO: ${c.name} → ${id}`);
      await setDoc(ref, {
        id,
        name: c.name,
        phone: id,
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: "",
        status: "Nova",
        referencia: c.referencia,
      });
    }
    ok++;
  }
  console.log(`\nConcluído: ${ok} cadastrados/atualizados, ${skip} ignorados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
