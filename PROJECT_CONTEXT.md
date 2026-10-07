# Project Context - Ilma Doces

Este documento descreve a arquitetura atual, rotas do App Router, estrutura de dados e principais componentes do sistema **Ilma Doces**.

---

## 1. Rotas e Páginas do App Router (Next.js)

### Área Pública / Loja (`app/(loja)`)
- **`/`** (`app/(loja)/page.tsx`): Página inicial da loja, vitrine do cardápio e carrinho de compras.
- **`/cardapio`** (`app/(loja)/cardapio/page.tsx`): Cardápio completo com filtros por categoria.

### Painel Administrativo (`app/admin`)
- **`/admin`** (`app/admin/page.tsx`): Dashboard principal com KPIs do dia, produção, atalho para **Venda Rápida (Balcão)**.
- **`/admin/pedidos`** (`app/admin/pedidos/page.tsx`): Gestão de pedidos, status, registro de sinal, criação de pedido manual e numeração sequencial (`#0001`, `#0002`...).
- **`/admin/agendamentos`** (`app/admin/agendamentos/page.tsx`): Calendário e visualização de agendamentos por data.
- **`/admin/clientes`** (`app/admin/clientes/page.tsx`): Gestão de clientes, histórico unificado de pedidos e fiados, seção **Fidelidade** (acumulado só dos itens das categorias permitidas dos pedidos concluídos, brindes disponíveis = `floor(saldo/meta)`, meta global editável, modal de resgate com baixa de estoque e despesa automática, edição manual de saldo com histórico de eventos e botão "Zerar saldo").
- **`/admin/produtos`** (`app/admin/produtos/page.tsx`): Gestão de itens do cardápio, upload/URLs de fotos, gerenciar marcas e gerenciar categorias.
- **`/admin/estoque`** (`app/admin/estoque/page.tsx`): Controle de lotes de insumos com Preço Médio Ponderado (PEPS).
- **`/admin/entradas`** (`app/admin/entradas/page.tsx`): Entrada de Mercadoria — compra de fornecedor à vista (Pix/Dinheiro/Cartão) ou prazo (Boleto 30/60/90 · Cartão · datas personalizadas) que grava em **um único `writeBatch`** a compra, as despesas parceladas (categoria `"Insumos"`, `data` = compra p/ DRE e `vencimento` = parcela p/ caixa; à vista nasce **Pago**, prazo nasce Pendente) e os lotes de estoque (frete rateado proporcional no custo do lote); estorno bloqueado se alguma parcela de prazo estiver paga.
- **`/admin/financeiro`** (`app/admin/financeiro/page.tsx`): Módulo financeiro, receitas, despesas e fluxo de caixa.
- **`/admin/credores`** (`app/admin/credores/page.tsx`): Gestão de credores e fiados, abates parciais, reabertura de dívidas (estorno) e cobrança via WhatsApp.
- **`/admin/precificacao`** (`app/admin/precificacao/page.tsx`): Fichas técnicas e precificação de produtos.
- **`/admin/vendas`** (`app/admin/vendas/page.tsx`): Histórico de vendas, relatórios mensais, **Top 5 Produtos Mais Vendidos** e **Distribuição de Vendas por Categoria (fechamento exato em 100.0%)**.
- **`/admin/configuracoes`** (`app/admin/configuracoes/page.tsx`): Configurações gerais da loja, dados de contato, seção **Fidelidade e Brindes** (meta em R$ + ativar/desativar programa) e seção **Mensagens WhatsApp** (templates editáveis por gatilho — `components/admin/MensagensWhatsappCard.tsx` — com tags dinâmicas, ativar/pausar, restaurar padrão e prévia; persistidos em `configuracoes/loja` via `lib/storeConfig.ts` e aplicados pelos helpers de `lib/whatsapp.ts`).

---

## 2. Estrutura de Dados (Coleções / Tabelas)

O sistema opera com sincronização em tempo real (Firebase Firestore / Zustand Local Persistence):

### `pedidos`
- `id`: string (identificador único)
- `orderNumber`: string (número sequencial amigável, ex: `"0005"`)
- `origem`: `"manual" | "site"` (indica se veio do balcão/admin ou do site)
- `customerName`: string
- `customerPhone`: string
- `items`: array de itens do carrinho (`product`, `quantity`, `notes`)
- `total`: number
- `deliveryType`: `"retirada"`
- `scheduledDate`: string (YYYY-MM-DD)
- `scheduledTime`: string (HH:mm)
- `paymentMethod`: `"pix" | "dinheiro" | "cartao_debito" | "cartao_credito"`
- `status`: `"pendente" | "confirmado" | "em_producao" | "pronto" | "saiu_entrega" | "concluido"`
- `createdAt`: string (ISO)
- `valorPagoSinal`: number (opcional)
- `formaPagamentoSinal`: string (opcional)
- `sinalExigido`: boolean (opcional — regra de 50% de entrada; derivada dos itens se ausente: exige se houver item que não é brinde nem do cardápio rápido)
- `valorSinal`: number (opcional — 50% do total arredondado em centavos)
- `sinalPago`: boolean (opcional — status manual da entrada no painel)
- `valorSinalPago`: number (opcional — valor efetivamente recebido da entrada, espelhado em `valorPagoSinal` para os cálculos legados; ver `sinalRecebidoDoPedido` em `lib/faturamento.ts`)
- `isFiado`: boolean (opcional)
- `dataPagamento`: string (YYYY-MM-DD, opcional — data em que o valor foi recebido; faturamento/gráficos usam essa data, não `createdAt`)

### `clientes`
- `id`: string
- `name`: string
- `phone`: string (usado como chave primária normalizada)
- `totalOrders`: number
- `totalSpent`: number
- `lastOrderDate`: string
- `status`: `"Ativa" | "Nova"`
- `fidelidadeOffset?`, `fidelidadeEditadoEm?`, `fidelidadeResgates?`, `fidelidadeUltimoResgate?`: campos de fidelidade (saldo derivado = soma dos itens das categorias permitidas dos pedidos concluídos − offset; filtro vem de `brindeTodasCategorias`/`brindeCategoriasPromo` via `subtotalParaBrinde`; meta global = `valorMinimoBrinde` em `storeConfig`, default R$ 100; brindes disponíveis = `brindesDisponiveis(saldo, meta)` em `lib/fidelidade.ts`; **cada resgate desconta 1 meta** via `saldoAposResgate(saldo, meta)` — só zerar o total pelo botão "Zerar saldo")
- `fidelidadeHistorico?`: array de `FidelidadeEvento` (`data` ISO, `tipo` `"resgate" | "ajuste" | "reset"`, `saldo`, `brindes` — máx. 50 eventos) gravado por `resgatarBrinde`/`setFidelidadeOffset` em `lib/store.ts`; lido só pelo painel (`clientes` exige sessão)

### `produtos`
- `id`: string
- `category_id`: string
- `name`: string
- `description`: string | null
- `price`: number
- `image_url`: string | null
- `is_available`: boolean (esgotado = false — gerido pelo estoque e pelo rádio "Esgotado" do admin)
- `ativo?`: boolean (false = Inativo, escondido do site inteiro; ausente/true = Ativo — helper `statusProduto`/`produtoVisivel`/`produtoEsgotado` em `lib/produtoStatus.ts`)
- `display_order`: number
- `brand`: string
- `isCustomWeight`: boolean (opcional)
- `cardapioRapido`: boolean (opcional — se true, o item aparece no modal ⚡ Venda Rápida / Balcão do dashboard)
- `precoCustoInicial?`: number (custo de produção — usado no resgate de fidelidade para lançar despesa "Custos de Brindes / Fidelidade")
- `estoque?`, `estoqueMinimo?`, `estoqueCritico?`, `controlarEstoque?`: controle de estoque (gelinhos)

### `categorias`
- `id`: string
- `name`: string
- `slug`: string
- `display_order`: number

### `marcas`
- `id`: string
- `nome`: string
- `status`: `"Ativa" | "Inativa"`

### `credores`
- `id`: string
- `clienteId`: string
- `nome`: string
- `whatsapp`: string
- `observacoes`: string
- `compras`: array de `CompraCredor` (`id`, `origem`, `referenciaId`, `descricao`, `valor`, `valorPendente`, `status`, `baixas`, `data`, `dataPrometida`, `pago`)
- `pagamentos`: array de `PagamentoCredor` (`id`, `valor`, `data`, `metodo`, `observacao`)

### `despesas`
- `id`, `descricao`, `categoria` (inclui `"Custos de Brindes / Fidelidade"`), `valor`, `data` (YYYY-MM-DD), `status` (`"Pago" | "Pendente" | "Em Atraso"`), `createdAt`
- `vencimento?`: string (YYYY-MM-DD — vencimento da parcela quando veio de uma Entrada de Mercadoria; o Financeiro usa essa data para calcular atraso)
- `entradaId?`: string (vincula a despesa à compra em `entradas-mercadoria`)
- Lançadas automaticamente a cada resgate de gelinho no painel (custo = `precoCustoInicial` do sabor)

### `entradas-mercadoria`
- `id`, `fornecedor`, `data` (YYYY-MM-DD da compra), `itens` (array de `EntradaItem`: `insumoId`, `nome`, `brandId`, `qtd`, `custoUnitario`), `subtotal`, `frete`, `total`, `formaPagamento`, `parcelas` (array de `EntradaParcela`: `numero`, `vencimento`, `valor`), `criadoEm`, `despesaIds`, `loteIds`
- Gravada junto de `despesas` e `lotes` em atomicidade total (`lib/entradasStore.ts`); estorno via `runTransaction` só libera se nenhuma despesa vinculada estiver `Pago`

### `fornecedores`
- `id` (slug do nome), `nome` — apenas autocomplete da tela de Entrada de Mercadoria

### `financeiro`
- `id`: string
- `tipo`: `"RECEITA" | "DESPESA"`
- `categoria`: string
- `valor`: number
- `formaPagamento`: string (rótulo normalizado por `paymentLabelOf` em `lib/utils.ts`: `"PIX" | "Dinheiro" | "Cartão Débito" | "Cartão Crédito" | "Fiado" | "Outros"`)
- `descricao`: string
- `data`: string (YYYY-MM-DD)
- `createdAt`: string (ISO)
- `pedidoId`: string (opcional — vincula o lançamento ao pedido; usado para localizar/estornar o lançamento do sinal via `localizarTransacaoSinal` em `lib/faturamento.ts`)

---

## 3. Principais Componentes do Painel Admin

- **`QuickSaleModal`** (`components/admin/QuickSaleModal.tsx`): Modal de Venda Rápida / Balcão para inserção simultânea de múltiplos produtos, seletor de cliente opcional (para fidelidade), cálculo de troco em dinheiro e baixa imediata no estoque e financeiro.
- **`LaunchDespesaModal`** (`components/admin/LaunchDespesaModal.tsx`): Modal para lançamento de despesas financeiras.
- **`OrderWizardModal`** (`components/cart/OrderWizardModal.tsx`): Assistente passo a passo para finalização de encomendas na loja.
- **`CartDrawer`** (`components/CartDrawer.tsx`): Gaveta lateral do carrinho de compras; no checkout exibe acumulado de fidelidade, brindes disponíveis e checkbox "Resgatar Brinde Disponível (desconta 1 brinde do saldo)" com seletor de sabor e desfazer (restaura o offset salvo).
- **Modais de Gestão de Marcas e Categorias**: Gerenciamento em tempo real de marcas e categorias diretamente na tela de produtos.
- **Sidebar & Header**: Navegação responsiva do painel administrativo.
