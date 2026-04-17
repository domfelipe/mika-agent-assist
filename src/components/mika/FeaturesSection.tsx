import { Brain, Sparkles, Cable, Clock, MessageCircleHeart, ShieldCheck, type LucideIcon } from "lucide-react";

type Feature = { icon: LucideIcon; title: string; description: string };

const features: Feature[] = [
  { icon: Brain, title: "Memória Persistente", description: "O agente lembra tudo sobre você entre sessões — preferências, contatos e contexto contínuo." },
  { icon: Sparkles, title: "Skills Personalizadas", description: "Crie automações em linguagem natural no Skill Studio. Sem código." },
  { icon: Cable, title: "Integração Google Workspace", description: "Gmail, Calendar e Drive conectados em 1 clique e prontos para usar." },
  { icon: Clock, title: "Agendamentos Automáticos", description: "Cron em linguagem natural — ex: \"toda segunda às 9h me envie resumo da semana\"." },
  { icon: MessageCircleHeart, title: "Suporte em Português", description: "Time brasileiro respondendo em horário comercial. Sem tradutor automático." },
  { icon: ShieldCheck, title: "Privacidade Total", description: "Seu agente roda na sua VPS. Sem treinamento com seus dados." },
];

export function FeaturesSection() {
  return (
    <section id="recursos" className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Tudo que um assistente pessoal deveria ter
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Recursos pensados para profissionais brasileiros que querem produtividade sem complicação.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="group rounded-xl border border-border bg-card p-6 shadow-soft hover:shadow-lg hover:border-primary/30 transition-all duration-200"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center text-primary">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
