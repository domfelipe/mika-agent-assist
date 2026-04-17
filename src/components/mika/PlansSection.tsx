"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { EnterpriseLeadForm } from "./EnterpriseLeadForm";
import { cn } from "@/lib/utils";

// Fallback estático — na Etapa 2 será substituído por query Supabase à tabela `plans`.
const STATIC_PLANS = [
  {
    slug: "basic",
    name: "Basic",
    description: "Para começar a usar IA no dia a dia.",
    monthly: 69.9,
    yearly: 671.04,
    highlighted: false,
    is_enterprise: false,
    features: [
      "1 agente pessoal no Telegram",
      "Memória persistente básica",
      "Integração Google Workspace",
      "5 skills personalizadas",
      "Suporte por e-mail",
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    description: "Para quem usa IA todos os dias.",
    monthly: 199.9,
    yearly: 1919.04,
    highlighted: false,
    is_enterprise: false,
    features: [
      "Tudo do Basic",
      "Memória avançada e contextual",
      "Skills ilimitadas",
      "Agendamentos automáticos",
      "Suporte prioritário",
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    description: "Para profissionais e times pequenos.",
    monthly: 399.9,
    yearly: 3839.04,
    highlighted: true,
    is_enterprise: false,
    features: [
      "Tudo do Starter",
      "VPS dedicada de alta performance",
      "Modelos de IA premium",
      "Integrações personalizadas",
      "Onboarding 1:1",
      "Suporte em horário estendido",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Para empresas com necessidades específicas.",
    monthly: null,
    yearly: null,
    highlighted: false,
    is_enterprise: true,
    features: [
      "Tudo do Professional",
      "Múltiplos agentes",
      "SSO e gestão de equipe",
      "SLA contratual",
      "Treinamento da equipe",
      "Account manager dedicado",
    ],
  },
] as const;

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PlansSection() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="planos" className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Planos para cada estágio</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sem fidelidade. Cancele quando quiser. Reembolso integral nos primeiros 7 dias.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 bg-muted rounded-full px-4 py-2">
            <span className={cn("text-sm font-medium", !yearly && "text-foreground", yearly && "text-muted-foreground")}>
              Mensal
            </span>
            <Switch checked={yearly} onCheckedChange={setYearly} aria-label="Alternar entre mensal e anual" />
            <span className={cn("text-sm font-medium flex items-center gap-2", yearly && "text-foreground", !yearly && "text-muted-foreground")}>
              Anual
              <Badge className="bg-success/15 text-success hover:bg-success/15 border-0 font-semibold">20% off</Badge>
            </span>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {STATIC_PLANS.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const monthlyEquivalent = yearly && plan.yearly ? plan.yearly / 12 : null;
            return (
              <article
                key={plan.slug}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-card p-6 shadow-soft transition-all",
                  plan.highlighted
                    ? "border-2 border-primary shadow-glow lg:scale-[1.03]"
                    : "border-border hover:border-primary/30 hover:shadow-lg",
                )}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground hover:bg-accent border-0 font-semibold">
                    Mais popular
                  </Badge>
                )}

                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mt-6 min-h-[88px]">
                  {plan.is_enterprise ? (
                    <p className="text-3xl font-bold">Sob consulta</p>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-muted-foreground">R$</span>
                        <span className="text-4xl font-bold tracking-tight">
                          {fmtBRL(yearly && monthlyEquivalent ? monthlyEquivalent : (price as number))}
                        </span>
                        <span className="text-sm text-muted-foreground">/mês</span>
                      </div>
                      {yearly && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          R$ {fmtBRL(plan.yearly!)} cobrados anualmente
                        </p>
                      )}
                    </>
                  )}
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {plan.is_enterprise ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full rounded-lg">Falar com vendas</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Plano Enterprise</DialogTitle>
                          <DialogDescription>
                            Conte um pouco sobre sua empresa. Nosso time entra em contato em até 1 dia útil.
                          </DialogDescription>
                        </DialogHeader>
                        <EnterpriseLeadForm />
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Button
                      asChild
                      className={cn(
                        "w-full rounded-lg transition-all duration-150 active:scale-[0.98]",
                        plan.highlighted
                          ? "bg-primary hover:bg-primary-dark text-primary-foreground"
                          : "bg-foreground hover:bg-foreground/90 text-background",
                      )}
                    >
                      <Link to="/signup" search={{ plan: plan.slug, cycle: yearly ? "yearly" : "monthly" } as never}>
                        Assinar agora
                      </Link>
                    </Button>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground text-center">
                    Sujeito à política de uso justo. Veja termos.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
