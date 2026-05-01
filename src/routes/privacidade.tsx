import { createFileRoute } from "@tanstack/react-router";
import { LandingHeader } from "@/components/mika/LandingHeader";
import { LandingFooter } from "@/components/mika/LandingFooter";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Mika por Dom Tech" },
      {
        name: "description",
        content:
          "Saiba como a Dom Tech coleta, usa, compartilha e protege seus dados pessoais ao usar a Mika, em conformidade com a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — Mika por Dom Tech" },
      {
        property: "og:description",
        content:
          "Como a Dom Tech trata seus dados na Mika, em conformidade com a LGPD.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: 1 de maio de 2026
          </p>

          <h2 className="mt-10 text-2xl font-semibold">1. Controlador</h2>
          <p>
            <strong>Dom Tech</strong> ("Dom Tech", "nós") é a controladora dos dados
            pessoais tratados no contexto da Mika ("Serviço"), nos termos da Lei
            Geral de Proteção de Dados (Lei nº 13.709/2018 — "LGPD") e do GDPR,
            quando aplicável. Contato do encarregado (DPO):{" "}
            <a href="mailto:dpo@domco.ai" className="underline">dpo@domco.ai</a>.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">2. Dados que coletamos</h2>
          <ul>
            <li>
              <strong>Cadastro:</strong> nome, e-mail, telefone, senha (em hash),
              foto e dados de perfil que você fornecer.
            </li>
            <li>
              <strong>Identificadores do Telegram:</strong> chat ID, username e o
              token do bot que você nos confia, para entregar mensagens.
            </li>
            <li>
              <strong>Conteúdo de uso:</strong> mensagens trocadas com a Mika,
              skills criadas, cronjobs e configurações.
            </li>
            <li>
              <strong>Integrações de terceiros:</strong> tokens de acesso (OAuth) a
              serviços que você conecta (e-mail, calendário, etc.), armazenados de
              forma criptografada.
            </li>
            <li>
              <strong>Dados de pagamento:</strong> tratados diretamente pela Paddle
              (Merchant of Record). Recebemos apenas metadados como ID de assinatura,
              status, plano e os últimos 4 dígitos do cartão.
            </li>
            <li>
              <strong>Dados técnicos:</strong> endereço IP, identificadores de
              dispositivo, logs de acesso, telemetria de uso e diagnóstico.
            </li>
            <li>
              <strong>Cookies:</strong> essenciais (sessão e segurança) e analíticos
              opcionais (mediante consentimento, quando aplicável).
            </li>
          </ul>

          <h2 className="mt-8 text-2xl font-semibold">3. Finalidades e base legal</h2>
          <ul>
            <li>
              <strong>Execução do contrato (art. 7º, V, LGPD):</strong> criar e
              manter sua conta, prestar o Serviço, executar skills, integrações e
              cobrança.
            </li>
            <li>
              <strong>Legítimo interesse (art. 7º, IX):</strong> segurança,
              prevenção a fraudes, melhoria do produto e métricas agregadas.
            </li>
            <li>
              <strong>Consentimento (art. 7º, I):</strong> comunicações de marketing,
              cookies não essenciais e processamento de categorias sensíveis (se houver).
            </li>
            <li>
              <strong>Cumprimento de obrigação legal/regulatória (art. 7º, II):</strong>{" "}
              guarda de logs, obrigações fiscais e atendimento a autoridades.
            </li>
          </ul>

          <h2 className="mt-8 text-2xl font-semibold">4. Com quem compartilhamos</h2>
          <ul>
            <li>
              <strong>Operadores e subprocessadores:</strong> infraestrutura em nuvem,
              banco de dados, observabilidade, suporte e provedores de modelos de IA
              utilizados para gerar respostas.
            </li>
            <li>
              <strong>Paddle.com:</strong> Merchant of Record que processa pagamentos,
              assinaturas, faturamento, impostos e devoluções.
            </li>
            <li>
              <strong>Telegram:</strong> a entrega das mensagens depende da
              infraestrutura do Telegram, sujeita à política dele.
            </li>
            <li>
              <strong>Assessores profissionais</strong> (jurídico, contábil) e{" "}
              <strong>autoridades</strong>, quando exigido por lei.
            </li>
          </ul>
          <p>
            Não vendemos seus dados pessoais. Não usamos seu conteúdo privado para
            treinar modelos de IA de terceiros sem seu consentimento explícito.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">5. Transferências internacionais</h2>
          <p>
            Alguns provedores podem processar dados fora do Brasil (ex.: EUA, União
            Europeia). Adotamos salvaguardas como cláusulas contratuais padrão e
            verificação de adequação, conforme art. 33 da LGPD.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">6. Retenção</h2>
          <p>
            Mantemos os dados enquanto sua conta estiver ativa e pelo prazo necessário
            para cumprir as finalidades descritas e obrigações legais (em geral, até
            5 anos após o encerramento). Após esse período, os dados são excluídos
            ou anonimizados.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">7. Seus direitos (LGPD)</h2>
          <p>Você pode, a qualquer momento, solicitar:</p>
          <ul>
            <li>Confirmação da existência de tratamento e acesso aos dados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
            <li>Portabilidade a outro fornecedor;</li>
            <li>Eliminação dos dados tratados com seu consentimento;</li>
            <li>Informação sobre compartilhamentos;</li>
            <li>Revogação do consentimento;</li>
            <li>
              Reclamação à <abbr title="Autoridade Nacional de Proteção de Dados">ANPD</abbr>.
            </li>
          </ul>
          <p>
            Para exercer seus direitos, escreva para{" "}
            <a href="mailto:dpo@domco.ai" className="underline">dpo@domco.ai</a>.
            Responderemos em até 15 dias.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">8. Segurança</h2>
          <p>
            Aplicamos medidas técnicas e organizacionais adequadas, incluindo
            criptografia em trânsito (TLS) e em repouso para credenciais sensíveis,
            controles de acesso por papéis (RLS), registro de auditoria e revisões
            periódicas. Nenhum sistema é 100% seguro; em caso de incidente relevante,
            comunicaremos você e a ANPD conforme exigido.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">9. Cookies</h2>
          <p>
            Utilizamos cookies essenciais para login e segurança e podemos utilizar
            cookies analíticos para entender o uso do produto. Você pode gerenciar
            preferências no seu navegador.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">10. Crianças</h2>
          <p>
            O Serviço não se destina a menores de 18 anos. Não coletamos
            intencionalmente dados de crianças e adolescentes.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">11. Alterações</h2>
          <p>
            Esta Política pode ser atualizada. Mudanças relevantes serão comunicadas
            por e-mail ou pelo painel.
          </p>

          <h2 className="mt-8 text-2xl font-semibold">12. Contato</h2>
          <p>
            Dúvidas sobre privacidade ou LGPD:{" "}
            <a href="mailto:dpo@domco.ai" className="underline">dpo@domco.ai</a>.
          </p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
