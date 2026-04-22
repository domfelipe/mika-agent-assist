"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useIntegrationCards } from "@/hooks/use-integrations";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { IntegrationCard } from "@/components/mika/integrations/IntegrationCard";

type IntegracoesSearch = { status?: string; error?: string; mcp?: string };

export const Route = createFileRoute("/painel/integracoes/")({
  validateSearch: (search: Record<string, unknown>): IntegracoesSearch => ({
    status: typeof search.status === "string" ? search.status : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    mcp: typeof search.mcp === "string" ? search.mcp : undefined,
  }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  const { cards, isLoading, error, limit } = useIntegrationCards();
  const { data: agent } = useAgentInstance();
  const agentReady = agent?.status === "active" || agent?.status === "ready";
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (search.status === "success" && search.mcp) {
      toast.success(`${search.mcp} conectado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["user-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["user-integration-limits"] });
      navigate({ to: "/painel/integracoes", search: { status: undefined, error: undefined, mcp: undefined }, replace: true });
    } else if (search.error) {
      toast.error(`Erro ao conectar: ${search.error}`);
      navigate({ to: "/painel/integracoes", search: { status: undefined, error: undefined, mcp: undefined }, replace: true });
    }
  }, [search.status, search.error, search.mcp, navigate, queryClient]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6 text-primary" /> Integrações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte ferramentas externas ao seu agente Mika.
          </p>
        </div>
        {limit && limit.max_integrations !== null && (
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {limit.current_integrations_count ?? 0}
            </span>
            {" / "}
            {limit.max_integrations} integrações
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar integrações: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">Nenhuma integração disponível no momento.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <IntegrationCard key={card.mcp.id} state={card} agentReady={!!agentReady} />
          ))}
        </div>
      )}
    </div>
  );
}
