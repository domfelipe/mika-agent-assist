import { createFileRoute } from "@tanstack/react-router";
import { LandingHeader } from "@/components/mika/LandingHeader";
import { LandingFooter } from "@/components/mika/LandingFooter";

export const Route = createFileRoute("/reembolso")({
  head: () => ({
    meta: [
      { title: "Política de Reembolso — Mika por Dom Tech" },
      {
        name: "description",
        content:
          "Garantia de 30 dias da Mika. Saiba como solicitar reembolso integral em assinaturas processadas pela Paddle.",
      },
      { property: "og:title", content: "Política de Reembolso — Mika por Dom Tech" },
      {
        property: "og:description",
        content: "Garantia de 30 dias para reembolso integral da assinatura da Mika.",
      },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Política de Reembolso
          </h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: 1 de maio de 2026
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Garantia de 30 dias</h2>
          <p>
            A <strong>Dom Tech</strong> oferece <strong>garantia de 30 dias</strong> para
            assinaturas da Mika. Se você não estiver satisfeito com o Serviço, pode
            solicitar o reembolso integral do valor pago no ciclo vigente em até{" "}
            <strong>30 dias corridos</strong> a contar da data da cobrança.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">Como solicitar</h2>
          <p>
            Os pagamentos da Mika são processados pela{" "}
            <strong>Paddle.com</strong>, nosso revendedor oficial e Merchant of Record.
            Para solicitar reembolso:
          </p>
          <ol>
            <li>
              Acesse{" "}
              <a
                href="https://paddle.net"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                paddle.net
              </a>{" "}
              e localize sua compra pelo e-mail usado no checkout, ou
            </li>
            <li>
              Envie um e-mail para{" "}
              <a href="mailto:suporte@domco.ai" className="underline">
                suporte@domco.ai
              </a>{" "}
              com o assunto "Reembolso Mika" e o e-mail da assinatura. Encaminharemos
              o pedido à Paddle.
            </li>
          </ol>

          <h2 className="mt-8 text-2xl font-semibold">Prazo de processamento</h2>
          <p>
            Reembolsos aprovados são processados pela Paddle e geralmente aparecem
            no método de pagamento original em <strong>5 a 10 dias úteis</strong>,
            podendo variar conforme o emissor do cartão ou banco.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">Renovações e cancelamento</h2>
          <p>
            Você pode cancelar sua assinatura a qualquer momento pelo painel ou pelo
            portal da Paddle. O cancelamento interrompe renovações futuras; o acesso
            permanece ativo até o fim do ciclo já pago.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">Contato</h2>
          <p>
            Dúvidas sobre cobranças ou reembolsos:{" "}
            <a href="mailto:suporte@domco.ai" className="underline">
              suporte@domco.ai
            </a>
            .
          </p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
