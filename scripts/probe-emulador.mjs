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

const app = initializeApp({ apiKey: "demo-key", projectId: "demo-ilma-doces", authDomain: "localhost" });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const id = "probe" + Date.now();

const primeiro = new Promise((resolve, reject) => {
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
  const { unsub, count } = await primeiro;
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
