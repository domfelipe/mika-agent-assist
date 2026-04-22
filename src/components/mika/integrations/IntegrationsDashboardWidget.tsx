"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight, Plug, AlertCircle } from "lucide-react";
import { useIntegrationCards } from "@/hooks/use-integrations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function IntegrationsDashboardWidget() {
  const { cards, isLoading, limit } = useIntegrationCards();

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  const connected = cards.filter((c) => c.kind === "connected");
  const errored = cards.filter((c) => c.kind === "error");
  const recent = [...errored, ...connected].slice(0, 3);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Suas integrações</h3>
            <p className="text-xs text-muted-foreground">
              {connected.length} conectada{connected.length === 1 ? "" : "s"}
              {limit?.max_integrations ? ` de ${limit.max_integrations} disponíveis` : ""}
              {errored.length > 0 && (
                <>
                  {" · "}
                  <span className="text-destructive font-medium">
                    {errored.length} com erro
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link to="/painel/integracoes" search={{}}>
            Gerenciar <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Conecte serviços como Gmail, Notion e Cal.com para ampliar seu Mika.
          </p>
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link to="/painel/integracoes" search={{}}>Explorar integrações</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((card) => {
            const mcp = card.mcp;
            return (
              <li key={mcp.id}>
                <Link
                  to="/painel/integracoes/$slug"
                  params={{ slug: mcp.slug }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img src={mcp.icon_url} alt="" className="h-6 w-6 rounded shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{mcp.name}</p>
                      {card.kind === "connected" && card.integration.connected_account_email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {card.integration.connected_account_email}
                        </p>
                      )}
                    </div>
                  </div>
                  {card.kind === "connected" && (
                    <Badge variant="success" className="shrink-0">Ativa</Badge>
                  )}
                  {card.kind === "error" && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <AlertCircle className="h-3 w-3" /> Erro
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
