import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const app = !getApps().length
  ? initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  : getApp();

const db = getFirestore(app);

const customers = [
  { name: "Samara", referencia: "Sem Referencia", phone: "(11) 3933-5449" },
  { name: "Rosemeire", referencia: "Sem Referencia", phone: "(11) 91109-2883" },
  { name: "Wellington", referencia: "Sodramar", phone: "(11) 91124-1619" },
  { name: "Ju", referencia: "Sem Referencia", phone: "(11) 91139-7178" },
  { name: "Marcos", referencia: "Sem Referencia", phone: "(11) 91154-9241" },
  { name: "Melissa", referencia: "Sodramar", phone: "(11) 91299-6455" },
  { name: "Tati", referencia: "Sem Referencia", phone: "(11) 91324-3652" },
  { name: "Roberta Frias", referencia: "Sem Referencia", phone: "(11) 91343-3491" },
  { name: "Alzira", referencia: "Sem Referencia", phone: "(11) 91361-7520" },
  { name: "Quitéria Machado", referencia: "Igreja", phone: "(11) 91367-6782" },
];

async function main() {
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
