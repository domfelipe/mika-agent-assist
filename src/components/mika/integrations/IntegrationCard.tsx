"use client";

import { Link } from "@tanstack/react-router";
import { Lock, AlertCircle, CheckCircle2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { IntegrationCardState } from "@/hooks/use-integrations";
import { toast } from "sonner";
import { useState } from "react";
import { invokeFunction } from "@/lib/invoke-function";

interface Props {
  state: IntegrationCardState;
  agentReady: boolean;
}

export function IntegrationCard({ state, agentReady }: Props) {
  const { mcp } = state;
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    if (!agentReady) {
      toast.error("Seu agente ainda está sendo provisionado.");
      return;
    }
    setConnecting(true);
    const { data, error } = await invokeFunction<{ authorize_url: string }>(
      "oauth-start",
      { mcp_slug: mcp.slug },
    );
    setConnecting(false);
    if (error || !data?.authorize_url) {
      toast.error(error?.message ?? "Não foi possível iniciar a conexão.");
      return;
    }
    window.location.href = data.authorize_url;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <img
          src={mcp.icon_url}
          alt=""
          className="h-10 w-10 rounded-md object-contain bg-muted/40 p-1"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{mcp.name}</h3>
            {state.kind === "connected" && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Conectado
              </Badge>
            )}
            {state.kind === "error" && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {state.integration.status === "expired"
                  ? "Expirado"
                  : state.integration.status === "revoked"
                  ? "Revogado"
                  : "Erro"}
              </Badge>
            )}
            {state.kind === "locked" && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Bloqueado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {mcp.description}
          </p>
        </div>
      </div>

      {state.kind === "connected" && state.integration.connected_account_email && (
        <p className="text-xs text-muted-foreground truncate">
          Conta: <span className="font-mono">{state.integration.connected_account_email}</span>
        </p>
      )}

      {state.kind === "error" && state.integration.error_message && (
        <p className="text-xs text-destructive line-clamp-2">
          {state.integration.error_message}
        </p>
      )}

      {state.kind === "locked" && (
        <p className="text-xs text-muted-foreground">
          Disponível nos planos: {state.mcp.available_in_plans.join(", ") || "—"}
        </p>
      )}

      <div className="flex gap-2 mt-auto">
        {state.kind === "available" && (
          <Button onClick={handleConnect} disabled={connecting || !agentReady} className="flex-1">
            <Plug className="h-4 w-4 mr-2" />
            {connecting ? "Conectando..." : "Conectar"}
          </Button>
        )}
        {state.kind === "locked" && (
          <Button asChild variant="outline" className="flex-1">
            <Link to="/painel/faturamento">Fazer upgrade</Link>
          </Button>
        )}
        {(state.kind === "connected" || state.kind === "error") && (
          <Button asChild variant="outline" className="flex-1">
            <Link to="/painel/integracoes/$slug" params={{ slug: mcp.slug }}>
              Gerenciar
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
