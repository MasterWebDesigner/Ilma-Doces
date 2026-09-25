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

## Convenções

- Código em pt-BR na UI; mensagens de erro amigáveis.
- Não adicionar comentários no código (exceto cabeçalhos `/* ===...=== */`).
- Nunca editar `.tsx`/arquivos com acentos via PowerShell `Set-Content` (corrompe UTF-8) — usar as ferramentas de edição do editor.
- Não commitar/push/deploy sem pedido explícito do usuário (o `npm run release` só roda quando ele pedir).
- Deploy de produção: somente via `npm run release`.
