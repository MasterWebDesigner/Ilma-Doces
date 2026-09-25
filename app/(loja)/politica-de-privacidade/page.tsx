import type { Metadata } from "next";
import Link from "next/link";
import StoreFooter from "@/components/StoreFooter";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de privacidade da Ilma Doces — Confeitaria Artesanal.",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <main className="min-h-screen bg-white text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:pb-20 sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
          Ilma Doces — Confeitaria Artesanal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900 dark:text-white">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Última atualização: janeiro de 2026
        </p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              1. Informações que coletamos
            </h2>
            <p className="mt-2">
              Ao realizar um pedido, coletamos apenas os dados necessários para o atendimento: nome
              completo, telefone/WhatsApp, e, quando aplicável, endereço de retirada ou observações do
              pedido. Não solicitamos dados de cartão de crédito pelo site — pagamentos são acertados
              diretamente com a loja (PIX, dinheiro ou cartão).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              2. Como usamos seus dados
            </h2>
            <p className="mt-2">
              Seus dados são utilizados para confirmar e preparar o pedido, entrar em contato sobre o
              status da produção, emitir comprovantes e, caso você autorize, enviar lembretes de
              comandas em aberto. Não usamos seus dados para publicidade de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              3. Compartilhamento
            </h2>
            <p className="mt-2">
              O contato acontece principalmente por WhatsApp. Compartilhamos suas informações apenas
              quando necessário para concluir o atendimento (por exemplo, com a transportadora em
              entregas) ou quando exigido por lei.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              4. Cookies e armazenamento local
            </h2>
            <p className="mt-2">
              O site utiliza armazenamento local do navegador para manter seu carrinho, preferências
              de tema e configurações da loja. Você pode limpar esses dados a qualquer momento nas
              configurações do seu navegador.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              5. Segurança e retenção
            </h2>
            <p className="mt-2">
              Adotamos medidas razoáveis para proteger suas informações. Os dados são mantidos apenas
              pelo tempo necessário para atender os pedidos e obrigações legais.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              6. Seus direitos (LGPD)
            </h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais a qualquer
              momento, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">7. Contato</h2>
            <p className="mt-2">
              Dúvidas sobre esta política podem ser enviadas pelo WhatsApp da loja, disponível no
              rodapé e na página inicial.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <Link
            href="/"
            className="text-xs font-semibold text-[#8B1D22] underline transition-colors hover:text-[#6d161b] dark:text-red-400 dark:hover:text-red-300"
          >
            ← Voltar para a loja
          </Link>
        </div>
      </div>

      <footer className="bg-[#8B1D22] text-xs text-white/70">
        <StoreFooter />
      </footer>
    </main>
  );
}
