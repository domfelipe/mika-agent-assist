"use client";

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EnterpriseLeadForm } from "./EnterpriseLeadForm";
import { useAuth } from "@/hooks/use-auth";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { cn } from "@/lib/utils";

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_brl: number | null;
  price_yearly_brl: number | null;
  features: string[];
  highlighted: boolean;
  is_enterprise: boolean;
  display_order: number;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((p) => ({
        ...p,
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
      })) as PlanRow[];
    },
  });
}

export function PlansSection() {
  const [yearly, setYearly] = useState(false);
  const { data: plans, isLoading } = usePlans();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const handleSubscribe = async (slug: string) => {
    const cycle = yearly ? "yearly" : "monthly";
    if (!user) {
      navigate({ to: "/signup", search: { plan: slug, cycle } });
      return;
    }
    const priceId = `${slug}_${cycle}`;
    setPendingSlug(slug);
    await openCheckout({
      priceId,
      userId: user.id,
      customerEmail: user.email || undefined,
    });
    setPendingSlug(null);
  };

  return (
    <section id="planos" className="py-20 sm:py-28 bg-background scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Planos para cada estágio</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sem fidelidade. Cancele quando quiser. Garantia de 30 dias para reembolso integral.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 bg-muted rounded-full px-4 py-2">
            <span
              className={cn(
                "text-sm font-medium",
                !yearly ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Mensal
            </span>
            <Switch
              checked={yearly}
              onCheckedChange={setYearly}
              aria-label="Alternar entre mensal e anual"
            />
            <span
              className={cn(
                "text-sm font-medium flex items-center gap-2",
                yearly ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Anual
              <Badge className="bg-success/15 text-success hover:bg-success/15 border-0 font-semibold">
                20% off
              </Badge>
            </span>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[480px] rounded-xl" />
              ))
            : (plans || []).map((plan) => {
                const monthly = plan.price_monthly_brl ?? 0;
                const yearlyPrice = plan.price_yearly_brl ?? 0;
                const monthlyEquivalent = yearly && yearlyPrice ? yearlyPrice / 12 : monthly;
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
                              {fmtBRL(monthlyEquivalent)}
                            </span>
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                          {yearly && yearlyPrice > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              R$ {fmtBRL(yearlyPrice)} cobrados anualmente
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <ul className="mt-6 space-y-3 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check
                            className="h-4 w-4 text-success mt-0.5 flex-shrink-0"
                            aria-hidden
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6">
                      {plan.is_enterprise ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="w-full rounded-lg">
                              Falar com vendas
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Plano Enterprise</DialogTitle>
                              <DialogDescription>
                                Conte um pouco sobre sua empresa. Nosso time entra em contato em até
                                1 dia útil.
                              </DialogDescription>
                            </DialogHeader>
                            <EnterpriseLeadForm />
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <Button
                          onClick={() => handleSubscribe(plan.slug)}
                          disabled={checkoutLoading && pendingSlug === plan.slug}
                          className={cn(
                            "w-full rounded-lg transition-all duration-150 active:scale-[0.98]",
                            plan.highlighted
                              ? "bg-primary hover:bg-primary-dark text-primary-foreground"
                              : "bg-foreground hover:bg-foreground/90 text-background",
                          )}
                        >
                          {checkoutLoading && pendingSlug === plan.slug ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Abrindo checkout…
                            </>
                          ) : (
                            "Assinar agora"
                          )}
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
