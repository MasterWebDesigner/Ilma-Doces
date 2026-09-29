import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const tmp = path.join(raiz, "emulator-data-export-tmp");
const destino = path.join(raiz, "emulator-data");
const backup = path.join(raiz, "emulator-data-backup-tmp");
const cli = path.join(raiz, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(backup, { recursive: true, force: true });

const r = spawnSync(process.execPath, [cli, "emulators:export", tmp, "--project", "demo-ilma-doces"], {
  stdio: "inherit",
  cwd: raiz,
});

const ok = fs.existsSync(path.join(tmp, "firebase-export-metadata.json"));
if (!ok) {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.error("db:export: exportacao falhou" + (r.status !== null ? ` (exit ${r.status})` : ""));
  process.exit(1);
}

if (fs.existsSync(destino)) fs.renameSync(destino, backup);
fs.renameSync(tmp, destino);
fs.rmSync(backup, { recursive: true, force: true });
console.log("db:export: snapshot salvo em emulator-data/ (" + new Date().toLocaleString("pt-BR") + ")");
