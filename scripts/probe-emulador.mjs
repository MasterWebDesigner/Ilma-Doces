import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";

const app = initializeApp({ apiKey: "demo-key", projectId: "demo-ilma-doces", authDomain: "localhost" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

const SENHA_LOCAL = process.env.NEXT_PUBLIC_LOCAL_SENHA || "local1234";
const USUARIOS = ["ilmadoces370@gmail.com", "navarrodesigner23@gmail.com"];

const id = "probe" + Date.now();

async function entrar() {
  for (const email of USUARIOS) {
    try {
      await signInWithEmailAndPassword(auth, email, SENHA_LOCAL);
      return;
    } catch {}
  }
  throw new Error("sem sessao no emulador: as regras exigem login");
}

const primeiraLeitura = () =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout na leitura (onSnapshot nao retornou em 10s)")), 10000);
    const unsub = onSnapshot(
      collection(db, "clientes"),
      (snap) => {
        clearTimeout(t);
        resolve({ unsub, count: snap.size });
      },
      (err) => {
        clearTimeout(t);
        reject(new Error("ERRO no onSnapshot: " + err.message));
      }
    );
  });

try {
  await entrar();

  const { unsub, count } = await primeiraLeitura();
  console.log(`leitura onSnapshot clientes: OK (${count} docs)`);
  unsub();

  await setDoc(
    doc(db, "clientes", id),
    { name: "Probe", phone: "11999990000", lastOrderDate: new Date().toISOString(), referencia: "" },
    { merge: true }
  );
  console.log("escrita setDoc(merge): OK");

  const segundo = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout na releitura")), 10000);
    const unsub = onSnapshot(collection(db, "clientes"), (snap) => {
      clearTimeout(t);
      unsub();
      resolve(snap.size);
    });
  });
  console.log(`releitura apos escrita: ${segundo} docs (esperado ${count + 1})`);

  await deleteDoc(doc(db, "clientes", id));
  console.log("limpeza do probe: OK");
} catch (err) {
  console.log(err.message);
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
