"use client";

import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/sucesso")({
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Invalida queries de assinatura para refletir o novo estado quando o webhook chegar
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    const t = setTimeout(() => {
      navigate({ to: "/painel", search: {} });
    }, 6000);
    return () => clearTimeout(t);
  }, [navigate, queryClient]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-success" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Assinatura confirmada!</h1>
          <p className="text-muted-foreground">
            Estamos provisionando seu acesso. Em alguns segundos seu plano estará ativo.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground">
            <Link to="/painel" search={{}}>Ir para o painel</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-lg">
            <Link to="/painel/faturamento">Ver faturamento</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Você será redirecionado em instantes…</p>
      </div>
    </div>
  );
}
