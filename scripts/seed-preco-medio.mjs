import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { SEED_BATCHES } from "../lib/seedData.ts";
import { obterPrecoMedioInsumo } from "../lib/precoMedio.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gravar = process.argv.includes("--gravar");
const conta = JSON.parse(readFileSync(resolve(raiz, ".secrets/service-account.json"), "utf8"));

if (getApps().length === 0) initializeApp({ credential: cert(conta) });
const db = getFirestore();

const arredondar = (v) => Math.round(v * 1000) / 1000;

const snapInsumos = await db.collection("insumos").get();
const snapLotes = await db.collection("lotes").get();
const lotes = snapLotes.docs.map((d) => ({ id: d.id, ...d.data() }));

const plano = [];
const pulados = [];

for (const doc of snapInsumos.docs) {
  const d = doc.data();
  const atual = typeof d.precoCustoInicial === "number" ? d.precoCustoInicial : 0;
  if (atual > 0) {
    pulados.push({ id: doc.id, nome: d.name, motivo: `ja possui valor ${atual}` });
    continue;
  }
  const lotesDoInsumo = lotes.filter((l) => l.insumoId === doc.id);
  const origem = lotesDoInsumo.length > 0 ? "lotes reais" : "SEED_BATCHES";
  const media = obterPrecoMedioInsumo(
    lotesDoInsumo.length > 0 ? lotesDoInsumo : SEED_BATCHES,
    doc.id
  );
  if (!(media > 0)) {
    pulados.push({ id: doc.id, nome: d.name, motivo: "sem media disponivel" });
    continue;
  }
  plano.push({ id: doc.id, nome: d.name, valor: arredondar(media), origem });
}

console.log(`Insumos: ${snapInsumos.size} | plano: ${plano.length} | pulados: ${pulados.length}`);
for (const p of pulados) console.log(`  PULADO ${p.id} ${p.nome}: ${p.motivo}`);
const amostra = plano.slice(0, 8);
for (const p of amostra) console.log(`  ${p.id} ${p.nome} -> ${p.valor} (${p.origem})`);
if (plano.length > amostra.length) console.log(`  ... e mais ${plano.length - amostra.length}`);

if (!gravar) {
  console.log("\nDRY RUN — nenhuma alteracao gravada. Rode novamente com --gravar para aplicar.");
  process.exit(0);
}

let gravados = 0;
for (let i = 0; i < plano.length; i += 400) {
  const lote = db.batch();
  for (const p of plano.slice(i, i + 400)) {
    lote.update(db.collection("insumos").doc(p.id), { precoCustoInicial: p.valor });
    gravados++;
  }
  await lote.commit();
}
console.log(`\nGravado: ${gravados} insumo(s) atualizado(s) com preco medio.`);
