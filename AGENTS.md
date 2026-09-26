# AGENTS.md — Ilma Doces

## Fluxo Git e Deploy (obrigatório)

- Trabalhar **sempre na branch `dev`**: commits, testes e execução em localhost (`npm run dev`, http://localhost:3000).
- **Nunca** fazer commit ou push direto na branch `main`.
- A branch `main` é exclusiva para **grandes lançamentos e versões estáveis**. Ela só avança pelo comando manual:
  - `npm run release` → faz checkout de `main`, merge da `dev`, push da `main` (isso sim dispara o deploy de produção na Vercel) e volta para a `dev`.
- Pushes na `dev` **não geram deploys**: o `ignoreCommand` do `vercel.json` cancela qualquer build que não seja de produção (`VERCEL_ENV = production`).
- Proteção local: hook `.githooks/pre-commit` bloqueia commits na `main`. Nesta máquina o `core.hooksPath` aponta para a cópia externa `C:/Users/Dan/.githooks-ilma` (assim funciona também na `main`, onde a pasta `.githooks` ainda não existe); em outra máquina rode `git config core.hooksPath .githooks`. Emergência: `git commit --no-verify`.

## Comandos de verificação antes de commitar

- `npx tsc --noEmit` (typecheck)
- `npm run lint` (0 erros)
- `npm run test:run` (testes vitest)
- Rotas em localhost: `Invoke-WebRequest http://localhost:3000/<rota> -UseBasicParsing` → 200

## Ambiente local isolado (Firebase Emulator)

- `npm run dev` sobe os emuladores (Firestore 127.0.0.1:8080 + Auth 127.0.0.1:9099) junto do Next: o localhost **nunca** toca no banco de produção. A flag `NEXT_PUBLIC_FIREBASE_EMULATOR=1` existe **apenas** no `.env.local` (gitignored) — a Vercel não a tem, então produção segue 100% no projeto `ilma-doces`.
- Login local: usuário `ilma` ou `navarro` com a senha de `NEXT_PUBLIC_LOCAL_SENHA` (default `local1234`); a tela de login mostra o banner "Ambiente local" com a senha.
- `npm run db:sync` copia dados de produção → local (direção única, nunca escreve na produção). Rerode quando quiser espelhar de novo; apaga e recopia as 9 coleções.
- `npm run dev:next` roda só o Next (sem emulador — nesse caso o app volta a apontar pra produção; usar só para emergências).
- `node scripts/verify-login.mjs` confere se o login local está respondendo.
- `firestore.rules` é allow-all **do emulador** — nunca rodar `firebase deploy` (o CLI nem está logado; manter assim).
- Dados locais persistem em `firebase-emulator-data/` (gitignored). Requisitos: Java (OpenJDK 21) e `firebase-tools` (devDependency).

## Convenções

- Código em pt-BR na UI; mensagens de erro amigáveis.
- Não adicionar comentários no código (exceto cabeçalhos `/* ===...=== */`).
- Nunca editar `.tsx`/arquivos com acentos via PowerShell `Set-Content` (corrompe UTF-8) — usar as ferramentas de edição do editor.
- Não commitar/push/deploy sem pedido explícito do usuário (o `npm run release` só roda quando ele pedir).
- Deploy de produção: somente via `npm run release`.
