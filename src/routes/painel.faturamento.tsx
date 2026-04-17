"use client";

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/use-profile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/painel/faturamento")({
  component: BillingPage,
});

function BillingPage() {
  const { data: subscription, isLoading } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ["plan", subscription?.plan_id],
    enabled: !!subscription?.plan_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("id", subscription!.plan_id!)
        .maybeSingle();
      return data;
    },
  });

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session");
      if (error || !data?.url) {
        toast.error("Não foi possível abrir o portal. Tente novamente.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Faturamento</h1>
        <p className="mt-1 text-muted-foreground">
          Gerencie sua assinatura, método de pagamento e histórico.
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Plano atual</h2>
          {subscription && plan ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plano" value={plan.name} />
              <Field
                label="Valor"
                value={`R$ ${(subscription.billing_cycle === "yearly"
                  ? plan.price_yearly_brl
                  : plan.price_monthly_brl
                )?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / ${
                  subscription.billing_cycle === "yearly" ? "ano" : "mês"
                }`}
              />
              <Field
                label="Próxima cobrança"
                value={
                  subscription.current_period_end
                    ? format(new Date(subscription.current_period_end), "d 'de' MMMM 'de' yyyy", {
                        locale: ptBR,
                      })
                    : "—"
                }
              />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-medium">{statusLabel(subscription.status)}</p>
                  {subscription.cancel_at_period_end &&
                    (subscription.status === "active" || subscription.status === "trialing") && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        <CalendarClock className="h-3 w-3" />
                        {subscription.current_period_end
                          ? `Cancelamento em ${format(new Date(subscription.current_period_end), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
                          : "Cancelamento agendado"}
                      </span>
                    )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Você ainda não possui uma assinatura ativa.
            </p>
          )}
          <Button
            disabled={!subscription?.paddle_subscription_id || portalLoading}
            onClick={openPortal}
            className="mt-6 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Gerenciar assinatura
          </Button>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-semibold">Histórico de pagamentos</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Seu histórico aparecerá aqui após a primeira cobrança.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-semibold">Método de pagamento</h2>
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <CreditCard className="h-5 w-5" />
          <span>Nenhum método cadastrado</span>
        </div>
        <Button disabled variant="outline" className="mt-4 rounded-lg">
          Trocar método
        </Button>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function statusLabel(s: string): string {
  return {
    active: "Ativa",
    trialing: "Em período de teste",
    past_due: "Pagamento pendente",
    canceled: "Cancelada",
    incomplete: "Em provisionamento",
    incomplete_expired: "Expirada",
    unpaid: "Não paga",
  }[s] || s;
}
