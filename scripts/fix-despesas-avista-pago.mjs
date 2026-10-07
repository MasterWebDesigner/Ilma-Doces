import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gravar = process.argv.includes("--gravar");
const conta = JSON.parse(readFileSync(resolve(raiz, ".secrets/service-account.json"), "utf8"));

if (getApps().length === 0) initializeApp({ credential: cert(conta) });
const db = getFirestore();

const alvo = process.env.FIRESTORE_EMULATOR_HOST ? "EMULADOR" : "PRODUCAO";
const ehAvista = (d) =>
  Boolean(d.entradaId) &&
  d.status !== "Pago" &&
  !/parcela\s+\d+\s*\/\s*\d+/i.test(d.descricao || "") &&
  (d.vencimento || d.data) === d.data;

const snap = await db.collection("despesas").get();
const plano = [];
for (const doc of snap.docs) {
  const d = doc.data();
  if (ehAvista(d)) plano.push({ id: doc.id, descricao: d.descricao, valor: d.valor });
}

console.log(`Alvo: ${alvo} | despesas: ${snap.size} | a corrigir para Pago: ${plano.length}`);
for (const p of plano.slice(0, 20)) console.log(`  ${p.id} | ${p.descricao} | R$ ${p.valor}`);
if (plano.length > 20) console.log(`  ... e mais ${plano.length - 20}`);

if (!gravar) {
  console.log("\nDRY RUN — nenhuma alteracao gravada. Rode novamente com --gravar para aplicar.");
  process.exit(0);
}

let gravados = 0;
for (let i = 0; i < plano.length; i += 400) {
  const lote = db.batch();
  for (const p of plano.slice(i, i + 400)) {
    lote.update(db.collection("despesas").doc(p.id), { status: "Pago" });
    gravados++;
  }
  await lote.commit();
}
console.log(`\nGravado: ${gravados} despesa(s) de entrada a vista marcada(s) como Pago.`);
