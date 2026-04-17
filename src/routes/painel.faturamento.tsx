"use client";

import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, ExternalLink } from "lucide-react";
import { useSubscription, useProfile } from "@/hooks/use-profile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/painel/faturamento")({
  component: BillingPage,
});

function BillingPage() {
  const { data: subscription, isLoading } = useSubscription();
  const { data: profile } = useProfile();

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
              <Field label="Status" value={statusLabel(subscription.status)} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Você ainda não possui uma assinatura ativa.
            </p>
          )}
          <Button
            disabled={!profile?.stripe_customer_id}
            className="mt-6 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
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
