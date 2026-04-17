import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "O que é o Mika?",
    a: "Mika é uma plataforma brasileira que entrega para você um agente de IA pessoal hospedado em VPS gerenciada, acessível direto pelo Telegram. Ele aprende com você, lembra de contexto e executa tarefas com integrações reais.",
  },
  {
    q: "Como funciona o Telegram?",
    a: "Após assinar, você recebe um QR code para conectar seu agente Mika ao seu Telegram. A partir daí, basta conversar com ele como faria com um assistente humano — ele responde direto no chat.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, a qualquer momento, sem multa. O acesso continua até o fim do período já pago e não há cobranças adicionais depois disso.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Seu agente roda em uma VPS gerenciada exclusivamente para você, com criptografia em trânsito e em repouso. Nunca usamos seus dados para treinar modelos. Estamos em conformidade com a LGPD.",
  },
  {
    q: "Qual a diferença entre os planos?",
    a: "Os planos diferem em capacidade de memória, número de skills, performance da VPS, modelos de IA disponíveis e nível de suporte. O Professional inclui VPS dedicada e modelos premium; o Enterprise inclui múltiplos agentes, SSO e SLA.",
  },
  {
    q: "Como funciona o Skill Studio?",
    a: "É onde você cria automações personalizadas em linguagem natural — basta descrever o que quer e o Mika gera a skill. Sem código.",
  },
  {
    q: "O Mika funciona em grupo do Telegram?",
    a: "Sim. Você pode adicionar o Mika a grupos e mencioná-lo para receber respostas, mantendo a privacidade das outras conversas.",
  },
  {
    q: "Tem trial grátis?",
    a: "Não oferecemos trial, mas garantimos reembolso integral nos primeiros 7 dias caso o produto não atenda suas expectativas.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="py-20 sm:py-28 bg-muted/40">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Perguntas frequentes</h2>
          <p className="mt-4 text-lg text-muted-foreground">As dúvidas mais comuns sobre o Mika.</p>
        </div>

        <Accordion type="single" collapsible className="mt-12 bg-card rounded-xl border border-border shadow-soft px-2">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-border last:border-b-0">
              <AccordionTrigger className="px-4 text-left font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="px-4 text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
