"use client";

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Unplug,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAvailableMcps,
  useUserIntegrations,
  useDependentJobsForMcp,
} from "@/hooks/use-integrations";
import { invokeFunction } from "@/lib/invoke-function";
import { DisconnectMCPDialog } from "@/components/mika/integrations/DisconnectMCPDialog";

export const Route = createFileRoute("/painel/integracoes/$slug")({
  component: IntegrationDetailPage,
});

function formatPtBR(date: string | null): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

function IntegrationDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: mcps = [], isLoading: mcpsLoading } = useAvailableMcps();
  const { data: integs = [], isLoading: integsLoading } = useUserIntegrations();
  const { data: dependentJobs = [] } = useDependentJobsForMcp(slug);

  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const mcp = mcps.find((m) => m.slug === slug);
  const integration = mcp ? integs.find((i) => i.mcp_id === mcp.id) : null;

  if (mcpsLoading || integsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!mcp) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/painel/integracoes" search={{}}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Link>
        </Button>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Integração não encontrada.</p>
        </div>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/painel/integracoes" search={{}}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Link>
        </Button>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Você ainda não conectou {mcp.name}.</p>
          <Button asChild className="mt-4">
            <Link to="/painel/integracoes" search={{}}>
              Conectar
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  async function handleTest() {
    setTesting(true);
    const { data, error } = await invokeFunction<{
      ok?: boolean;
      success?: boolean;
      account?: string;
      account_info?: unknown;
    }>(
      "test-integration",
      { integration_id: integration!.id },
    );
    setTesting(false);
    if (error) {
      toast.error(error.message);
    } else if (data?.ok || data?.success) {
      toast.success("Conexão funcionando perfeitamente.");
    } else {
      toast.warning("Conexão respondeu, mas com aviso. Verifique status.");
    }
    queryClient.invalidateQueries({ queryKey: ["user-integrations"] });
  }


  async function handleRefresh() {
    setRefreshing(true);
    const { data, error } = await invokeFunction<{
      success: boolean;
      expires_at: string | null;
      runtime_sync_warning?: string | null;
    }>("refresh-integration-token", {
      integration_id: integration!.id,
    });
    setRefreshing(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Token renovado.");
      if (data?.runtime_sync_warning) {
        toast.warning("Token renovado, mas o runtime do agente não sincronizou.");
      }
    }
    queryClient.invalidateQueries({ queryKey: ["user-integrations"] });
  }

  const status = integration.status;
  const statusBadge =
    status === "active" ? (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Ativo
      </Badge>
    ) : status === "expired" ? (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> Expirado
      </Badge>
    ) : status === "revoked" ? (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Revogado
      </Badge>
    ) : (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Erro
      </Badge>
    );

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/painel/integracoes" search={{}}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Link>
      </Button>

      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <img
            src={mcp.icon_url}
            alt=""
            className="h-14 w-14 rounded-lg object-contain bg-muted/40 p-2"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{mcp.name}</h1>
              {statusBadge}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{mcp.description}</p>
          </div>
        </div>

        {integration.error_message && (
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {integration.error_message}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
          <h2 className="font-semibold">Conta conectada</h2>
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono">{integration.connected_account_email ?? "—"}</dd>
            </div>
            {integration.connected_account_name && (
              <div>
                <dt className="text-muted-foreground">Nome</dt>
                <dd>{integration.connected_account_name}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Conectado em</dt>
              <dd>{formatPtBR(integration.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Última renovação</dt>
              <dd>{formatPtBR(integration.last_refreshed_at)}</dd>
            </div>
            {integration.token_expires_at && (
              <div>
                <dt className="text-muted-foreground">Token expira em</dt>
                <dd>{formatPtBR(integration.token_expires_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
          <h2 className="font-semibold">Permissões concedidas</h2>
          {integration.granted_scopes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum escopo registrado.</p>
          ) : (
            <ul className="text-xs font-mono space-y-1 max-h-48 overflow-auto">
              {integration.granted_scopes.map((s) => (
                <li key={s} className="text-muted-foreground break-all">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {dependentJobs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4" /> Automações que usam esta integração
          </h2>
          <ul className="space-y-2">
            {dependentJobs.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
              >
                <span>{j.name}</span>
                <Badge variant={j.status === "active" ? "success" : "secondary"}>{j.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleTest} disabled={testing} variant="outline">
          <Activity className="h-4 w-4 mr-2" />
          {testing ? "Testando..." : "Testar conexão"}
        </Button>
        {mcp.supports_refresh_token && (
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {refreshing ? "Renovando..." : "Renovar token"}
          </Button>
        )}
        {(status === "expired" || status === "revoked" || status === "error") && (
          <Button
            onClick={async () => {
              const { data, error } = await invokeFunction<{ auth_url: string }>("oauth-start", {
                mcp_slug: mcp.slug,
              });
              if (error || !data?.auth_url) {
                toast.error(error?.message ?? "Falha ao iniciar reconexão.");
                return;
              }
              window.location.href = data.auth_url;
            }}
          >
            Reconectar
          </Button>
        )}
        <Button variant="destructive" onClick={() => setDisconnectOpen(true)} className="ml-auto">
          <Unplug className="h-4 w-4 mr-2" /> Desconectar
        </Button>
      </div>

      <DisconnectMCPDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        onDisconnected={() => navigate({ to: "/painel/integracoes", search: {} })}
        integrationId={integration.id}
        mcpSlug={mcp.slug}
        mcpName={mcp.name}
      />

    </div>
  );
}
