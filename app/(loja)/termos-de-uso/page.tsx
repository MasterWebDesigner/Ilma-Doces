import type { Metadata } from "next";
import Link from "next/link";
import StoreFooter from "@/components/StoreFooter";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de uso da Ilma Doces — Confeitaria Artesanal.",
};

export default function TermosDeUsoPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:pb-20 sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1D22] dark:text-red-400">
          Ilma Doces — Confeitaria Artesanal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900 dark:text-white">Termos de Uso</h1>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Última atualização: janeiro de 2026
        </p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              1. Aceitação dos termos
            </h2>
            <p className="mt-2">
              Ao navegar neste site e/ou realizar um pedido, você concorda com estes Termos de Uso.
              Caso não concorde, pedimos que não utilize o site.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              2. Produtos e preços
            </h2>
            <p className="mt-2">
              Os preços e a disponibilidade dos produtos podem ser alterados sem aviso prévio, em
              especial itens artesanais e sazonais. As fotos são ilustrativas; embalagens e
              decorações podem variar levemente conforme a produção do dia.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              3. Pedidos e confirmação
            </h2>
            <p className="mt-2">
              O pedido fica registrado no site e é confirmado pela loja — normalmente por WhatsApp —
              quanto ao horário de produção e retirada. Pedidos sem confirmação não estão garantidos.
              Produtos marcados como &quot;Esgotado&quot; não podem ser adicionados ao carrinho.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              4. Pagamento e retirada
            </h2>
            <p className="mt-2">
              O pagamento é acertado diretamente com a loja (PIX, dinheiro ou cartão), no momento da
              retirada ou conforme combinado. No momento, os pedidos são feitos para retirada na loja;
              o serviço de delivery pode ser reativado a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              5. Cancelamentos e alterações
            </h2>
            <p className="mt-2">
              Cancelamentos e alterações devem ser solicitados o quanto antes, pelo WhatsApp. Pedidos
              artesanais já em produção podem não ser canceláveis. Produtos perecíveis não são
              aceitos de volta após a retirada.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              6. Conteúdo e propriedade intelectual
            </h2>
            <p className="mt-2">
              Textos, fotos, marca e layout deste site pertencem à loja ou são usados com autorização.
              É proibido reproduzir conteúdo sem consentimento prévio.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              7. Links externos
            </h2>
            <p className="mt-2">
              O site pode conter links para serviços de terceiros (mapas, WhatsApp, redes sociais).
              Não nos responsabilizamos pelo conteúdo ou pelas práticas desses terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">8. Contato</h2>
            <p className="mt-2">
              Fale conosco pelo WhatsApp da loja para dúvidas sobre pedidos, produtos ou estes termos.
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
