import { createFileRoute } from "@tanstack/react-router";
import { LandingHeader } from "@/components/mika/LandingHeader";
import { LandingFooter } from "@/components/mika/LandingFooter";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Mika por Dom Tech" },
      {
        name: "description",
        content:
          "Termos de Uso da Mika, assistente de IA pessoal operada pela Dom Tech. Saiba os direitos, deveres e condições de uso do serviço.",
      },
      { property: "og:title", content: "Termos de Uso — Mika por Dom Tech" },
      {
        property: "og:description",
        content:
          "Termos de Uso da Mika, assistente de IA pessoal operada pela Dom Tech.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: 1 de maio de 2026
          </p>

          <h2 className="mt-10 text-2xl font-semibold">1. Quem somos</h2>
          <p>
            Estes Termos de Uso ("Termos") regulam o acesso e uso da Mika ("Serviço"),
            uma assistente pessoal de inteligência artificial fornecida via Telegram e
            painel web, operada por <strong>Dom Tech</strong> ("Dom Tech", "nós").
            Ao criar uma conta ou usar o Serviço, você ("Usuário") concorda integralmente
            com estes Termos.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">2. Aceitação</h2>
          <p>
            O uso continuado do Serviço constitui aceitação destes Termos. Se você não
            concorda, não utilize o Serviço. Você declara ter ao menos 18 anos ou capacidade
            legal para celebrar este contrato e, se aceitar em nome de uma organização,
            ter poderes para vinculá-la.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">3. Descrição do Serviço</h2>
          <p>
            A Mika é uma assistente conversacional baseada em modelos de linguagem que
            executa tarefas como agendamentos, lembretes, integrações com aplicativos
            de terceiros (e-mail, calendário, etc.) e automações personalizadas
            ("skills"), conforme o plano contratado.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">4. Conta e credenciais</h2>
          <p>
            Você é responsável por manter a confidencialidade de suas credenciais e
            por toda atividade realizada em sua conta. Deve fornecer informações verdadeiras
            e mantê-las atualizadas. Notifique-nos imediatamente em caso de uso não
            autorizado.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">5. Uso aceitável</h2>
          <p>Você concorda em não usar o Serviço para:</p>
          <ul>
            <li>Atividades ilegais, fraude, spam ou phishing;</li>
            <li>Violar direitos de propriedade intelectual de terceiros;</li>
            <li>
              Tentar comprometer a segurança do Serviço (malware, varreduras, scraping
              não autorizado, engenharia reversa);
            </li>
            <li>
              Gerar conteúdo ilegal, ofensivo, discriminatório, deepfakes não consentidos,
              material de abuso infantil, instruções para atos violentos ou armas, ou
              tentar burlar filtros de segurança ("jailbreak");
            </li>
            <li>Revender, redistribuir ou sublicenciar o Serviço sem autorização.</li>
          </ul>

          <h2 className="mt-8 text-2xl font-semibold">6. Conteúdo gerado por IA</h2>
          <p>
            Você é responsável pelos prompts que envia, pelo uso que faz dos resultados
            e por verificar a precisão antes de tomar decisões com base neles. As
            saídas da Mika podem conter erros, imprecisões ou informações desatualizadas
            e <strong>não substituem aconselhamento profissional</strong> jurídico,
            médico, financeiro, contábil ou de qualquer outra natureza regulada.
            Você declara possuir os direitos sobre todo conteúdo que insere no Serviço.
          </p>
          <p>
            Reservamo-nos o direito de moderar, filtrar ou remover conteúdos e suspender
            contas envolvidas em uso indevido. Titulares de direitos podem solicitar
            remoção via contato@domco.ai; reincidentes terão a conta encerrada.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">7. Propriedade intelectual</h2>
          <p>
            O Serviço, incluindo software, marca, design, documentação e conteúdo,
            é de propriedade da Dom Tech e protegido por lei. Concedemos a você uma
            licença limitada, não exclusiva, intransferível e revogável para uso pessoal
            ou interno conforme o plano contratado. Você mantém a titularidade do
            seu conteúdo e nos concede uma licença limitada para hospedá-lo e processá-lo
            apenas com a finalidade de prestar o Serviço.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">8. Pagamentos, planos e cancelamento</h2>
          <p>
            Os preços, ciclos de cobrança (mensal/anual) e condições de cada plano são
            apresentados na página de Planos. <strong>
              Nosso processo de pedido é conduzido pelo nosso revendedor online
              Paddle.com. A Paddle.com é o Merchant of Record (Comerciante Registrado)
              de todos os nossos pedidos. A Paddle fornece todo o atendimento ao
              cliente relacionado a pagamentos e processa as devoluções.
            </strong>{" "}
            Para detalhes sobre cobrança, impostos, renovação automática, faturas e
            cancelamento, consulte os{" "}
            <a
              href="https://www.paddle.com/legal/checkout-buyer-terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Termos do Comprador da Paddle
            </a>
            . Você pode cancelar sua assinatura a qualquer momento pelo painel; o acesso
            permanece até o fim do ciclo já pago.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">9. Reembolsos</h2>
          <p>
            Oferecemos garantia de 30 dias para devolução. Veja nossa{" "}
            <a href="/reembolso" className="underline">
              Política de Reembolso
            </a>
            .
          </p>

          <h2 className="mt-8 text-2xl font-semibold">10. Suspensão e encerramento</h2>
          <p>
            Podemos suspender ou encerrar seu acesso, com ou sem aviso prévio, em caso
            de: (i) violação destes Termos; (ii) inadimplência; (iii) risco de fraude
            ou segurança; (iv) violações repetidas ou graves de políticas. Você pode
            encerrar sua conta a qualquer momento.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">11. Garantias e responsabilidade</h2>
          <p>
            O Serviço é fornecido "no estado em que se encontra". Não garantimos
            funcionamento ininterrupto ou livre de erros. Na máxima extensão permitida
            por lei, ficam excluídas garantias implícitas de adequação a um fim específico
            ou comerciabilidade. Nossa responsabilidade agregada limita-se ao valor pago
            por você nos 12 meses anteriores ao evento. Não respondemos por danos
            indiretos, lucros cessantes, perda de dados ou de oportunidade. Não se
            excluem responsabilidades por dolo, fraude ou aquelas que a lei não permita
            limitar.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">12. Indenização</h2>
          <p>
            Você indeniza a Dom Tech por reclamações de terceiros decorrentes do seu
            conteúdo, uso indevido do Serviço ou violação destes Termos.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">13. Lei aplicável e foro</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil.
            Fica eleito o foro da comarca da sede da Dom Tech, salvo disposição legal
            em contrário aplicável a consumidores.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">14. Alterações</h2>
          <p>
            Podemos atualizar estes Termos a qualquer momento. Mudanças relevantes
            serão comunicadas pelo painel ou e-mail com antecedência razoável.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">15. Contato</h2>
          <p>
            Dúvidas sobre estes Termos: <a href="mailto:contato@domco.ai" className="underline">contato@domco.ai</a>.
          </p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
