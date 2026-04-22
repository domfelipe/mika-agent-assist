"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  PlayCircle,
  PauseCircle,
  RotateCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { invokeFunction } from "@/lib/invoke-function";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface AgentRow {
  id: string;
  user_id: string;
  status: string;
  uuid_tenant: string;
  telegram_bot_username: string | null;
  railway_service_id: string | null;
  vps_pool_id: string | null;
  created_at: string;
  provisioned_at: string | null;
}

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["admin-agents"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_instances")
        .select(
          "id, user_id, status, uuid_tenant, telegram_bot_username, railway_service_id, vps_pool_id, created_at, provisioned_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AgentRow[];
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", search: { redirect: "/admin" } });
    }
  }, [authLoading, user, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso negado</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é restrita a administradores do Mika.
          </p>
          <Button asChild variant="outline">
            <Link to="/painel">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao painel
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  async function action(
    fn: "provision-agent" | "suspend-agent" | "resume-agent",
    agentId: string,
  ) {
    setBusy(agentId + fn);
    const { data, error } = await invokeFunction<{ ok?: boolean; error?: string }>(fn, {
      agent_instance_id: agentId,
    });
    setBusy(null);
    if (error) {
      toast.error(`${fn} falhou: ${error.message}`);
    } else if (data?.error) {
      toast.error(`${fn}: ${data.error}`);
    } else {
      toast.success(`${fn} executado com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 sm:px-8 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Server className="h-7 w-7 text-primary" /> Admin · Mika
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie agentes provisionados, suspenda e reative containers Railway.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/painel">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao painel
            </Link>
          </Button>
        </header>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-soft">
          <h2 className="font-semibold mb-4">Agentes ({agents?.length ?? 0})</h2>
          {agentsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !agents?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum agente cadastrado ainda.
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Bot</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Railway</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">
                        {a.uuid_tenant.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.telegram_bot_username ? `@${a.telegram_bot_username}` : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.railway_service_id?.slice(0, 8) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {a.status === "provisioning" && !a.railway_service_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === a.id + "provision-agent"}
                            onClick={() => action("provision-agent", a.id)}
                          >
                            {busy === a.id + "provision-agent" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCw className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1.5">Provisionar</span>
                          </Button>
                        )}
                        {a.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === a.id + "suspend-agent"}
                            onClick={() => action("suspend-agent", a.id)}
                          >
                            {busy === a.id + "suspend-agent" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PauseCircle className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1.5">Suspender</span>
                          </Button>
                        )}
                        {a.status === "suspended" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === a.id + "resume-agent"}
                            onClick={() => action("resume-agent", a.id)}
                          >
                            {busy === a.id + "resume-agent" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1.5">Reativar</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Ativo</Badge>;
  if (status === "provisioning") return <Badge variant="secondary">Provisionando</Badge>;
  if (status === "suspended") return <Badge variant="outline">Suspenso</Badge>;
  if (status === "error") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
