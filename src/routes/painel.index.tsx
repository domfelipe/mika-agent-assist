"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/use-profile";
import { useProfile } from "@/hooks/use-profile";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubscriptionBanner } from "@/components/mika/SubscriptionBanner";
import { SkillsDashboardWidget } from "@/components/mika/SkillsDashboardWidget";
import { CronjobsDashboardWidget } from "@/components/mika/cronjobs/CronjobsDashboardWidget";
import { IntegrationsDashboardWidget } from "@/components/mika/integrations/IntegrationsDashboardWidget";
import { AutoPausedBanner } from "@/components/mika/cronjobs/AutoPausedBanner";
import { TelegramOnboardingWizard } from "@/components/mika/telegram/TelegramOnboardingWizard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DashboardSearch = { status?: string };

export const Route = createFileRoute("/painel/")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: subscription, isLoading } = useSubscription();
  const { data: profile } = useProfile();
  const { data: agent } = useAgentInstance();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const previousStatusRef = useRef<string | null>(null);

  // Redireciona para /bem-vindo se cliente acabou de pagar e ainda não completou onboarding
  // OU se ainda não conectou o Telegram (para usar o novo fluxo de Managed Bot)
  useEffect(() => {
    if (search.status !== "success" || !agent) return;
    if (agent.status === "suspended" || agent.status === "error") {
      navigate({ search: { status: undefined }, replace: true });
      return;
    }
    if (!agent.onboarding_completed || !agent.telegram_bot_token_vault_id) {
      navigate({ to: "/bem-vindo", replace: true });
      return;
    }
    navigate({ search: { status: undefined }, replace: true });
  }, [search.status, agent, navigate]);

  useEffect(() => {
    if (search.status === "success" && !agent && !isLoading) {
      toast.info("Seu agente ainda não está pronto. Aguarde o provisionamento.");
    }
  }, [search.status, agent, isLoading]);

  // Toast quando agente sair de provisioning → active (uma única vez)
  useEffect(() => {
    if (!agent) return;
    const prev = previousStatusRef.current;
    if (prev === "provisioning" && agent.status === "active") {
      toast.success("Sua Mika está pronta! 🎉", {
        description: "Abra o Telegram e mande uma mensagem para começar.",
      });
    }
    previousStatusRef.current = agent.status;
  }, [agent]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const firstName = (profile?.full_name || "").split(" ")[0] || "por aqui";
  const agentName = agent?.agent_name?.trim() || "Mika";
  const statusLabel =
    agent?.status === "active"
      ? "ativo"
      : agent?.status === "provisioning"
        ? "sendo preparado"
        : agent?.status === "suspended"
          ? "pausado"
          : agent?.status === "error"
            ? "com erro"
            : "aguardando configuração";

  return (
    <div className="space-y-6">
      <SubscriptionBanner subscription={subscription ?? null} />

      <header>
        <h1 className="text-3xl font-bold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="mt-1 text-muted-foreground">
          {subscription
            ? agent
              ? <>Seu agente <span className="font-semibold text-foreground">{agentName}</span> está {statusLabel}.</>
              : "Acompanhe abaixo o status do seu agente."
            : "Vamos colocar seu agente Mika no ar."}
        </p>
      </header>

      {!subscription && <NoSubscriptionCard />}

      {subscription &&
        (subscription.status === "incomplete" || subscription.status === "active") &&
        agent?.status === "provisioning" && (
          <ProvisioningCard
            telegramConnected={!!agent.telegram_bot_username}
            railwayServiceCreated={false /* não temos campo direto; mostramos como "em andamento" */}
          />
        )}

      {subscription && subscription.status === "active" && agent?.status === "active" && (
        <>
          {agent.telegram_bot_username && <ActiveSuccessCard botUsername={agent.telegram_bot_username} />}
          <AutoPausedBanner />
          <div className="grid gap-6 lg:grid-cols-2">
            <SkillsDashboardWidget />
            <CronjobsDashboardWidget />
          </div>
          <IntegrationsDashboardWidget />
        </>
      )}

      <TelegramOnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

function NoSubscriptionCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 sm:p-12 text-center shadow-soft">
      <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Escolha um plano para começar</h2>
      <p className="mt-2 text-muted-foreground max-w-md mx-auto">
        Em poucos minutos seu agente Mika estará disponível no Telegram, com memória persistente e
        skills personalizadas.
      </p>
      <Button
        asChild
        size="lg"
        className="mt-6 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
      >
        <Link to="/" hash="planos">
          Ver planos <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

type StepState = "done" | "active" | "pending";

function ProvisioningCard({
  telegramConnected,
  railwayServiceCreated: _railwayServiceCreated,
}: {
  telegramConnected: boolean;
  railwayServiceCreated?: boolean;
}) {
  // Etapas dinâmicas — sabemos: pagamento confirmado (sempre done aqui),
  // Telegram conectado (vem do agent.telegram_bot_username), e o resto
  // está em andamento até o railway-webhook chegar como SUCCESS.
  const steps: { label: string; state: StepState }[] = [
    { label: "Pagamento confirmado", state: "done" },
    {
      label: telegramConnected ? "Telegram conectado" : "Conecte seu Telegram",
      state: telegramConnected ? "done" : "active",
    },
    {
      label: "Provisionando container",
      state: telegramConnected ? "active" : "pending",
    },
    {
      label: "Mika quase pronta!",
      state: "pending",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-soft">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Estamos preparando seu agente Mika</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Geralmente leva de 3 a 5 minutos. Esta página atualiza sozinha quando ficar pronta.
          </p>
        </div>
      </div>

      <ol className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((step, i) => (
          <li key={step.label} className="relative">
            <div className="flex flex-col items-start gap-3">
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                  step.state === "done"
                    ? "bg-success/15 text-success"
                    : step.state === "active"
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {step.state === "done" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : step.state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "pending" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActiveSuccessCard({ botUsername }: { botUsername: string }) {
  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-6 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Sua Mika está no ar 🎉</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra o Telegram e converse com{" "}
              <span className="font-mono text-foreground">@{botUsername}</span> para começar.
            </p>
          </div>
        </div>
        <Button
          asChild
          className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
        >
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Falar com seu Assistente Pessoal - IA agora
          </a>
        </Button>
      </div>
    </div>
  );
}
