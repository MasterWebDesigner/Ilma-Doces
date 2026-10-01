"use client";

import { useRef, useState } from "react";
import {
  GATILHOS,
  DEFAULT_MENSAGENS,
  mensagemPadrao,
  resolverTexto,
  tagsDoGatilho,
  type GatilhoMensagem,
  type MensagemTemplate,
  type VariaveisMensagem,
} from "@/lib/mensagensWhatsapp";
import { urlWaMe } from "@/lib/whatsapp";
import { getStoreConfig } from "@/lib/storeConfig";

const VARS_EXEMPLO: VariaveisMensagem = {
  nome_cliente: "Maria Silva",
  numero_pedido: "1042",
  valor_total: "R$ 128,90",
  itens_pedido: "1. Bolo de chocolate x2\n2. Torta de frango x1",
  horario_agendamento: "14:30",
  data_pedido: "25/09/2026",
  data_agendamento: "25/09/2026",
  data_compra: "25/09/2026",
  data_combinada: "25/09/2026",
  dias_atraso: 3,
  rotulo_dias: "dias",
  motivo: " Motivo: data indisponível.",
  endereco: "Rua das Flores, 123 - Centro",
  tipo_entrega: "Entrega",
  tipo_destino: "retirada na loja",
  telefone_cliente: "(11) 93065-7871",
  forma_pagamento: "PIX",
  subtotal: "R$ 120,90",
  taxa_entrega: "R$ 8,00",
  troco: "R$ 150,00",
  observacoes: "Sem açúcar, por favor",
  chave_pix: "chave@ilmadoces.com.br",
  link_pagamento: "https://pay.example.com/pix123",
  loja: "Ilma Doces",
  whatsapp_loja: "(11) 93065-7871",
};

interface MensagensWhatsappCardProps {
  mensagens: MensagemTemplate[];
  onChange: (mensagens: MensagemTemplate[]) => void;
  onSave: () => void;
}

export function MensagensWhatsappCard({ mensagens, onChange, onSave }: MensagensWhatsappCardProps) {
  const [salvo, setSalvo] = useState(false);
  const [previaAberta, setPreviaAberta] = useState<GatilhoMensagem | null>(null);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lista = mensagens || [];

  function buscar(gatilho: GatilhoMensagem): MensagemTemplate {
    return (
      lista.find((m) => m.gatilho === gatilho) ||
      DEFAULT_MENSAGENS.find((m) => m.gatilho === gatilho) ||
      DEFAULT_MENSAGENS[0]
    );
  }

  function atualizar(gatilho: GatilhoMensagem, patch: Partial<MensagemTemplate>) {
    const existe = lista.some((m) => m.gatilho === gatilho);
    if (!existe) {
      const base = DEFAULT_MENSAGENS.find((m) => m.gatilho === gatilho) || DEFAULT_MENSAGENS[0];
      onChange([...lista, { ...base, ...patch }]);
      return;
    }
    onChange(lista.map((m) => (m.gatilho === gatilho ? { ...m, ...patch } : m)));
  }

  function restaurar(gatilho: GatilhoMensagem) {
    atualizar(gatilho, { texto: mensagemPadrao(gatilho) });
  }

  function restaurarTodas() {
    if (!confirm("Restaurar o texto padrão de todas as mensagens? As personalizações serão perdidas.")) return;
    onChange(DEFAULT_MENSAGENS.map((m) => ({ ...m })));
  }

  function inserirTag(gatilho: GatilhoMensagem, tag: string) {
    const ta = refs.current[gatilho];
    const atual = buscar(gatilho).texto;
    if (!ta) {
      atualizar(gatilho, { texto: `${atual}${tag}` });
      return;
    }
    const ini = ta.selectionStart ?? atual.length;
    const fim = ta.selectionEnd ?? ini;
    const novo = `${atual.slice(0, ini)}${tag}${atual.slice(fim)}`;
    atualizar(gatilho, { texto: novo });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ini + tag.length, ini + tag.length);
    });
  }

  function testar(gatilho: GatilhoMensagem) {
    const texto = resolverTexto(lista, gatilho, VARS_EXEMPLO);
    window.open(urlWaMe(getStoreConfig().storePhone, texto), "_blank");
  }

  function salvarMensagens() {
    onSave();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 3000);
  }

  const grupos = [...new Set(GATILHOS.map((g) => g.grupo))];

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-300">
          <span aria-hidden>💬</span>
          Mensagens WhatsApp
        </h2>
        <div className="flex gap-2">
          <button
            onClick={restaurarTodas}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            Restaurar Padrão (todas)
          </button>
          <button
            onClick={salvarMensagens}
            className="rounded-lg bg-[#8B1D22] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#72171B]"
          >
            {salvo ? "Salvo!" : "Salvar Mensagens"}
          </button>
        </div>
      </div>
      <p className="mb-5 text-xs text-neutral-500">
        Personalize o texto de cada aviso automático do fluxo de pedidos. Clique em uma tag para inseri-la no texto — as tags são preenchidas com os dados do pedido no momento do envio. O botão &quot;Testar&quot; abre o WhatsApp da loja com um exemplo.
      </p>

      {grupos.map((grupo) => (
        <div key={grupo} className="mb-6 last:mb-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{grupo}</p>
          <div className="space-y-3">
            {GATILHOS.filter((g) => g.grupo === grupo).map((info) => {
              const tpl = buscar(info.gatilho);
              const previa = resolverTexto(lista, info.gatilho, VARS_EXEMPLO);
              return (
                <div key={info.gatilho} className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-white">
                      <input
                        type="checkbox"
                        checked={tpl.ativo}
                        onChange={(e) => atualizar(info.gatilho, { ativo: e.target.checked })}
                        className="h-4 w-4 accent-wine-500"
                      />
                      {info.titulo}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          tpl.ativo ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-800 text-neutral-500"
                        }`}
                      >
                        {tpl.ativo ? "Ativa" : "Pausada"}
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => restaurar(info.gatilho)}
                        className="rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] font-semibold text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                      >
                        Restaurar Padrão
                      </button>
                      <button
                        onClick={() => setPreviaAberta(previaAberta === info.gatilho ? null : info.gatilho)}
                        className="rounded-md border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/10"
                      >
                        {previaAberta === info.gatilho ? "Ocultar Prévia" : "Prévia"}
                      </button>
                      <button
                        onClick={() => testar(info.gatilho)}
                        className="rounded-md border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/10"
                      >
                        Testar
                      </button>
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-neutral-500">{info.descricao}</p>
                  <textarea
                    ref={(el) => {
                      refs.current[info.gatilho] = el;
                    }}
                    value={tpl.texto}
                    onChange={(e) => atualizar(info.gatilho, { texto: e.target.value })}
                    rows={5}
                    spellCheck={false}
                    className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 font-mono text-xs text-white outline-none focus:border-wine-500"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Tags:</span>
                    {tagsDoGatilho(info.gatilho).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => inserirTag(info.gatilho, tag)}
                        className="rounded-full border border-[#8B1D22]/30 bg-[#8B1D22]/10 px-2 py-0.5 font-mono text-[10px] text-[#e8b4b8] transition-colors hover:bg-[#8B1D22]/20"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {previaAberta === info.gatilho && (
                    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Prévia (dados de exemplo)</p>
                      <p className="mt-1 whitespace-pre-line text-xs text-neutral-300">{previa}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
