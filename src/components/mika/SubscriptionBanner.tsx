"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubscriptionRow } from "@/hooks/use-profile";

export function SubscriptionBanner({ subscription }: { subscription: SubscriptionRow | null }) {
  if (!subscription) return null;

  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const periodEndPassed = periodEnd && periodEnd.getTime() < Date.now();

  // Pagamento pendente
  if (subscription.status === "past_due") {
    return (
      <Banner
        tone="destructive"
        icon={AlertCircle}
        title="Pagamento pendente."
        description="Atualize seu método de pagamento para não perder acesso."
        action={
          <Button
            disabled
            variant="outline"
            className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            Atualizar pagamento
          </Button>
        }
      />
    );
  }

  // Cancelamento agendado
  if (subscription.cancel_at_period_end && periodEnd && !periodEndPassed) {
    return (
      <Banner
        tone="warning"
        icon={AlertTriangle}
        title={`Sua assinatura será encerrada em ${format(periodEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}.`}
        description="Você ainda tem acesso completo até essa data."
        action={
          <Button disabled variant="outline" className="rounded-lg">
            Reativar assinatura
          </Button>
        }
      />
    );
  }

  // Cancelada e período já passou
  if (subscription.status === "canceled" && periodEndPassed) {
    return (
      <Banner
        tone="muted"
        icon={Info}
        title="Sua assinatura foi encerrada."
        description="Para voltar a usar o Mika, escolha um novo plano."
        action={
          <Button asChild className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground">
            <Link to="/" hash="planos">Assinar novamente</Link>
          </Button>
        }
      />
    );
  }

  return null;
}

function Banner({
  tone,
  icon: Icon,
  title,
  description,
  action,
}: {
  tone: "destructive" | "warning" | "muted";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  const tones = {
    destructive: "bg-destructive/10 border-destructive/30 text-destructive",
    warning: "bg-warning/10 border-warning/30 text-warning",
    muted: "bg-muted border-border text-foreground",
  };
  return (
    <div
      className={cn(
        "rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4",
        tones[tone],
      )}
    >
      <div className="flex items-start gap-3 flex-1">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className={cn("text-sm mt-0.5", tone === "muted" ? "text-muted-foreground" : "opacity-90")}>
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:ml-4">{action}</div>
    </div>
  );
}
