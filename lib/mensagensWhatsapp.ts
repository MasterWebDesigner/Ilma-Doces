export type GatilhoMensagem =
  | "novo_pedido"
  | "confirmacao"
  | "em_producao"
  | "pronto"
  | "saiu_entrega"
  | "concluido"
  | "recusa"
  | "cancelamento"
  | "lembrete_agendamento"
  | "boas_vindas"
  | "chave_pix"
  | "cobranca_vencimento"
  | "cobranca_atraso"
  | "agradecimento_pagamento";

export interface MensagemTemplate {
  id: string;
  gatilho: GatilhoMensagem;
  ativo: boolean;
  titulo: string;
  texto: string;
}

export interface GatilhoInfo {
  gatilho: GatilhoMensagem;
  grupo: string;
  titulo: string;
  descricao: string;
  tags: string[];
}

export type VariaveisMensagem = Record<string, string | number>;

export const TAGS_OBRIGATORIAS = [
  "{nome_cliente}",
  "{numero_pedido}",
  "{valor_total}",
  "{horario_agendamento}",
  "{itens_pedido}",
  "{chave_pix}",
  "{link_pagamento}",
];

export const GATILHOS: GatilhoInfo[] = [
  {
    gatilho: "novo_pedido",
    grupo: "Fluxo do Pedido",
    titulo: "Novo Pedido (Recebido)",
    descricao: "Resumo do pedido aberto no WhatsApp da loja quando o cliente finaliza a compra no site (aguardando confirmação).",
    tags: ["{telefone_cliente}", "{tipo_entrega}", "{data_pedido}", "{endereco}", "{observacoes}", "{subtotal}", "{taxa_entrega}", "{forma_pagamento}", "{troco}", "{entrada_50}", "{loja}"],
  },
  {
    gatilho: "confirmacao",
    grupo: "Fluxo do Pedido",
    titulo: "Pedido Confirmado",
    descricao: "Enviada ao cliente quando o pedido é aceito, o sinal é registrado ou o peso real é confirmado.",
    tags: ["{data_pedido}", "{endereco}"],
  },
  {
    gatilho: "em_producao",
    grupo: "Fluxo do Pedido",
    titulo: "Em Produção",
    descricao: "Aviso ao cliente de que a produção do pedido começou (ao clicar em \"Iniciar Produção\").",
    tags: ["{data_pedido}"],
  },
  {
    gatilho: "pronto",
    grupo: "Fluxo do Pedido",
    titulo: "Pedido Pronto",
    descricao: "Aviso de que o pedido está pronto para retirada ou pronto para sair para entrega.",
    tags: ["{tipo_destino}"],
  },
  {
    gatilho: "saiu_entrega",
    grupo: "Fluxo do Pedido",
    titulo: "Saiu para Entrega",
    descricao: "Aviso de que o pedido saiu para entrega e está a caminho do cliente.",
    tags: ["{endereco}"],
  },
  {
    gatilho: "concluido",
    grupo: "Fluxo do Pedido",
    titulo: "Pedido Concluído",
    descricao: "Mensagem de encerramento enviada ao finalizar o pedido (entrega/retirada concluída).",
    tags: [],
  },
  {
    gatilho: "recusa",
    grupo: "Fluxo do Pedido",
    titulo: "Pedido Recusado",
    descricao: "Enviada ao cliente quando a loja não poderá atender ao pedido (já com prévia no modal de recusa).",
    tags: ["{motivo}"],
  },
  {
    gatilho: "cancelamento",
    grupo: "Fluxo do Pedido",
    titulo: "Pedido Cancelado",
    descricao: "Enviada ao cliente quando o pedido é cancelado pela loja ou pelo cliente.",
    tags: [],
  },
  {
    gatilho: "lembrete_agendamento",
    grupo: "Agendamento e Cliente",
    titulo: "Lembrete de Agendamento",
    descricao: "Lembrete do agendamento. Use o botão \"Enviar Lembrete\" na tela de agendamentos/detalhes do pedido.",
    tags: ["{data_agendamento}"],
  },
  {
    gatilho: "boas_vindas",
    grupo: "Agendamento e Cliente",
    titulo: "Boas-Vindas",
    descricao: "Mensagem de boas-vindas para novos clientes. Use \"Testar\" para abrir e enviar pelo WhatsApp da loja.",
    tags: ["{loja}", "{whatsapp_loja}"],
  },
  {
    gatilho: "chave_pix",
    grupo: "Agendamento e Cliente",
    titulo: "Chave Pix para Pagamento",
    descricao: "Mensagem para enviar a chave Pix/link de pagamento do pedido. Use \"Testar\" para abrir no WhatsApp.",
    tags: ["{loja}"],
  },
  {
    gatilho: "cobranca_vencimento",
    grupo: "Cobranças",
    titulo: "Cobrança no Vencimento",
    descricao: "Lembrete de cobrança no dia do vencimento (usado na tela de credores).",
    tags: ["{data_compra}", "{whatsapp_loja}"],
  },
  {
    gatilho: "cobranca_atraso",
    grupo: "Cobranças",
    titulo: "Cobrança em Atraso",
    descricao: "Cobrança de fiado em atraso, com quantidade de dias (usado na tela de credores).",
    tags: ["{data_combinada}", "{dias_atraso}", "{rotulo_dias}", "{whatsapp_loja}"],
  },
  {
    gatilho: "agradecimento_pagamento",
    grupo: "Cobranças",
    titulo: "Pagamento Recebido",
    descricao: "Agradecimento enviado após a confirmação do pagamento.",
    tags: [],
  },
];

const PADROES: Record<GatilhoMensagem, string> = {
  novo_pedido: `*🍽️ Novo Pedido — Ilma Doces*

*👤 Cliente:* {nome_cliente}
*📱 WhatsApp:* {telefone_cliente}

*📦 Tipo:* {tipo_entrega}
*📅 Data:* {data_pedido}
*⏰ Horário:* {horario_agendamento}
*📍 Endereço:* {endereco}

*🍰 Itens do Pedido:*
{itens_pedido}

*📝 Observações Gerais:* {observacoes}

*💰 Subtotal:* {subtotal}
*🚚 Taxa de Entrega:* {taxa_entrega}
*💵 *Total:* {valor_total}

*💳 Pagamento:* {forma_pagamento}
*💵 Troco para:* {troco}
*⚠️ Entrada de 50%:* {entrada_50}

Aguardamos confirmação!`,

  confirmacao: `*✅ Pedido Confirmado — Ilma Doces*

Ola {nome_cliente}!

Seu pedido foi *aceito e confirmado* pela Ilma Doces! 🎉

*📅 Data:* {data_pedido}
*⏰ Horario:* {horario_agendamento}
*📍 Endereco:* {endereco}

*🍰 Itens:*
{itens_pedido}

*💰 Total:* {valor_total}

Estamos preparando seu pedido com carinho! 💛
Qualquer duvida, estamos a disposicao.`,

  em_producao: `*🧁 Pedido em produção — Ilma Doces*

Oi {nome_cliente}! Seu pedido nº {numero_pedido} já está sendo preparado com carinho.

*📅 Data:* {data_pedido}
*⏰ Horário:* {horario_agendamento}

*🍰 Itens:*
{itens_pedido}

*💰 Total:* {valor_total}

Qualquer dúvida, estamos à disposição! 💛`,

  pronto: `*✅ Pedido pronto — Ilma Doces*

Oi {nome_cliente}! Seu pedido nº {numero_pedido} está pronto para {tipo_destino}.

*⏰ Horário:* {horario_agendamento}

*🍰 Itens:*
{itens_pedido}

*💰 Total:* {valor_total}

Aguardamos você! Qualquer dúvida, estamos à disposição. 💛`,

  saiu_entrega: `*🚚 Saiu para entrega — Ilma Doces*

Oi {nome_cliente}! Seu pedido nº {numero_pedido} saiu para entrega e está a caminho.

*📍 Endereço:* {endereco}

*💰 Total:* {valor_total}

Qualquer dúvida, é só responder por aqui! 💛`,

  concluido: `*✅ Pedido concluído — Ilma Doces*

Muito obrigado, {nome_cliente}! Seu pedido nº {numero_pedido} foi concluído. Esperamos que aproveite! 💛🧁

*🍰 Itens:*
{itens_pedido}

*💰 Total:* {valor_total}

A gente se vê no próximo pedido!`,

  recusa: `Olá, {nome_cliente}! Infelizmente não conseguiremos atender ao seu pedido nº {numero_pedido} referente a: {itens_pedido}.{motivo} Agradecemos a compreensão e ficamos à disposição!`,

  cancelamento: `Olá, {nome_cliente}! Seu pedido nº {numero_pedido} ({itens_pedido}) foi cancelado. Se tiver alguma dúvida ou precisar de ajuda com o estorno/reagendamento, entre em contato conosco por aqui.`,

  lembrete_agendamento: `Oi {nome_cliente}! Passando para lembrar do seu pedido nº {numero_pedido}.

*📅 Agendado para:* {data_agendamento}
*⏰ Horário:* {horario_agendamento}

*🍰 Itens:*
{itens_pedido}

Se precisar alterar algo, é só responder por aqui! 💛`,

  boas_vindas: `Oi {nome_cliente}! Seja muito bem-vindo(a) à {loja}! 🧁

Aqui você acompanha seus pedidos e recebe as novidades da semana. Já ficamos no aguardo!

Qualquer dúvida, é só chamar por aqui. 💛`,

  chave_pix: `Olá {nome_cliente}! Para pagar o pedido nº {numero_pedido} (valor {valor_total}), use a nossa chave PIX:

🔑 {chave_pix}

{link_pagamento}

Assim que pagar, mande o comprovante por aqui que já damos baixa. Obrigada! 💛`,

  cobranca_vencimento: `Olá, {nome_cliente}! Tudo bem? Passando para lembrar do seu pedido do dia {data_compra}:
🛒 Itens: {itens_pedido}
💰 Valor: {valor_total}
Hoje é a data combinada para o pagamento! Segue a nossa chave PIX: {chave_pix}. Qualquer dúvida estou por aqui, muito obrigada!
---
🤖 Esta é uma mensagem automática de cobrança, favor não responder a este envio.
📞 Em caso de dúvidas, entre em contato diretamente com a Ilma Doces pelo telefone: {whatsapp_loja}.`,

  cobranca_atraso: `Olá, {nome_cliente}! Tudo bem? Notamos que o pagamento do seu pedido está em aberto:
🛒 Itens: {itens_pedido}
💰 Valor: {valor_total}
📅 Data combinada: {data_combinada} ({dias_atraso} {rotulo_dias} em atraso)
Consegue dar uma olhadinha para a gente? Segue a chave PIX para quitação: {chave_pix}.
---
🤖 Esta é uma mensagem automática de cobrança, favor não responder a este envio.
📞 Em caso de dúvidas, entre em contato diretamente com a Ilma Doces pelo telefone: {whatsapp_loja}.`,

  agradecimento_pagamento: `Olá, {nome_cliente}! Recebemos o seu pagamento de {valor_total} referente ao pedido ({itens_pedido}).
Muito obrigado pela preferência e pela parceria de sempre! Tenha um ótimo dia! 🧁✨`,
};

export function mensagemPadrao(gatilho: GatilhoMensagem): string {
  return PADROES[gatilho];
}

export function makeMensagemTemplate(
  gatilho: GatilhoMensagem,
  titulo: string,
  partial?: Partial<MensagemTemplate>
): MensagemTemplate {
  return {
    id: `msg_${gatilho}`,
    gatilho,
    ativo: true,
    titulo,
    texto: mensagemPadrao(gatilho),
    ...partial,
  };
}

export const DEFAULT_MENSAGENS: MensagemTemplate[] = GATILHOS.map((g) =>
  makeMensagemTemplate(g.gatilho, g.titulo)
);

export function tagsDoGatilho(gatilho: GatilhoMensagem): string[] {
  const info = GATILHOS.find((g) => g.gatilho === gatilho);
  return [...new Set([...TAGS_OBRIGATORIAS, ...(info?.tags || [])])];
}

export function normalizarMensagensWhatsapp(value: unknown): MensagemTemplate[] {
  const entradas: Partial<MensagemTemplate>[] = Array.isArray(value)
    ? value.filter((v): v is Partial<MensagemTemplate> => Boolean(v) && typeof v === "object")
    : [];
  const porGatilho = new Map<string, Partial<MensagemTemplate>>();
  for (const item of entradas) {
    if (typeof item.gatilho === "string") porGatilho.set(item.gatilho, item);
  }
  return GATILHOS.map(({ gatilho, titulo }) => {
    const existente = porGatilho.get(gatilho);
    if (!existente) return makeMensagemTemplate(gatilho, titulo);
    return {
      id: typeof existente.id === "string" && existente.id ? existente.id : `msg_${gatilho}`,
      gatilho,
      ativo: existente.ativo !== false,
      titulo,
      texto:
        typeof existente.texto === "string" && existente.texto.trim()
          ? existente.texto
          : mensagemPadrao(gatilho),
    };
  });
}

export function renderMensagem(texto: string, vars: VariaveisMensagem): string {
  const linhas = texto.split("\n");
  let houveDrope = false;
  const resultado: string[] = [];

  for (const linha of linhas) {
    const encontradas = linha.match(/\{([a-z][a-z0-9_]*)\}/g);
    if (!encontradas) {
      resultado.push(linha);
      continue;
    }
    let s = linha;
    let substituiu = false;
    let ultimaTag = "";
    for (const tag of encontradas) {
      const chave = tag.slice(1, -1);
      if (chave in vars) {
        s = s.split(tag).join(String(vars[chave]));
        substituiu = true;
        ultimaTag = tag;
      }
    }
    if (!substituiu) {
      resultado.push(linha);
      continue;
    }
    const pos = linha.lastIndexOf(ultimaTag);
    const depoisDaTag = linha.slice(pos + ultimaTag.length);
    const tagNoFim = /^[\s*]*$/.test(depoisDaTag);
    const limpo = s.replace(/\*/g, "").trim();
    if (limpo === "" || (tagNoFim && limpo.endsWith(":"))) {
      houveDrope = true;
      continue;
    }
    resultado.push(s);
  }

  if (houveDrope) {
    const semDuplicadas: string[] = [];
    for (const linha of resultado) {
      if (linha === "" && semDuplicadas[semDuplicadas.length - 1] === "") continue;
      semDuplicadas.push(linha);
    }
    return semDuplicadas.join("\n");
  }
  return resultado.join("\n");
}

export function resolverTexto(
  templates: MensagemTemplate[] | undefined,
  gatilho: GatilhoMensagem,
  vars: VariaveisMensagem
): string {
  const custom = templates?.find((t) => t.gatilho === gatilho);
  const texto = custom && custom.texto.trim() ? custom.texto : mensagemPadrao(gatilho);
  return renderMensagem(texto, vars);
}
