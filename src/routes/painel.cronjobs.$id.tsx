"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, AlertTriangle, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type ScheduledJob,
  useCronjob,
  useDeleteCronjob,
  useUpdateCronjobStatus,
} from "@/hooks/use-cronjobs";
import { useAvailableMcps, useUserIntegrations } from "@/hooks/use-integrations";
import { syncAgentRuntime } from "@/lib/sync-agent-runtime";

export const Route = createFileRoute("/painel/cronjobs/$id")({
  component: CronjobDetailPage,
});

function CronjobDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: job, isLoading, error } = useCronjob(id);
  const { data: mcps = [] } = useAvailableMcps();
  const { data: integrations = [] } = useUserIntegrations();
  const updateMut = useUpdateCronjobStatus();
  const deleteMut = useDeleteCronjob();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />;
  }
  if (error || !job) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/painel/cronjobs">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Link>
        </Button>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Automação não encontrada.
        </div>
      </div>
    );
  }

  const connectedMcpIds = new Set(
    integrations.filter((i) => i.status === "active").map((i) => i.mcp_id),
  );
  const requiredMcps = job.required_mcp_slugs
    .map((slug) => mcps.find((m) => m.slug === slug))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const missingMcps = requiredMcps.filter((m) => !connectedMcpIds.has(m.id));

  const isActive = job.status === "active";
  const isAutoPaused = job.status === "auto_paused";
  const hasRuntimeError = job.runtime_state === "error" || job.runtime_last_status === "error";

  async function toggle() {
    try {
      await updateMut.mutateAsync({
        id: job!.id,
        status: isActive ? "paused" : "active",
      });
      toast.success(isActive ? "Pausada." : "Ativada.");

      const { error: syncError } = await syncAgentRuntime(job!.agent_instance_id, "cronjobs");
      if (syncError) {
        toast.warning("Status salvo, mas o runtime do agente não sincronizou.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove() {
    try {
      await deleteMut.mutateAsync(job!.id);
      toast.success("Excluída.");

      const { error: syncError } = await syncAgentRuntime(job!.agent_instance_id, "cronjobs");
      if (syncError) {
        toast.warning("Automação removida, mas o runtime do agente não sincronizou.");
      }

      navigate({ to: "/painel/cronjobs" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/painel/cronjobs">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para automações
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            {isActive && <Badge variant="success">Ativa</Badge>}
            {job.status === "paused" && <Badge variant="secondary">Pausada</Badge>}
            {job.status === "error" && <Badge variant="destructive">Erro</Badge>}
            {isAutoPaused && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Auto-pausada
              </Badge>
            )}
            {hasRuntimeError && !isAutoPaused && (
              <Badge variant="destructive">Runtime com erro</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={toggle} disabled={updateMut.isPending}>
            {isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" /> Pausar
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" /> Ativar
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Excluir
          </Button>
        </div>
      </div>

      {isAutoPaused && job.auto_paused_reason && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Auto-pausada</p>
          <p className="text-muted-foreground mt-1">{job.auto_paused_reason}</p>
        </div>
      )}

      {hasRuntimeError && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Falha reportada pelo runtime</p>
          <p className="text-muted-foreground mt-1">
            {job.runtime_last_error ?? "O runtime marcou a última execução como erro."}
          </p>
        </div>
      )}

      {job.runtime_last_delivery_error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">Falha na entrega do resultado</p>
          <p className="text-muted-foreground mt-1">{job.runtime_last_delivery_error}</p>
        </div>
      )}

      {missingMcps.length > 0 && isActive && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Integrações necessárias não conectadas:
          </p>
          <ul className="list-disc list-inside mt-1 text-muted-foreground">
            {missingMcps.map((m) => (
              <li key={m.id}>{m.name}</li>
            ))}
          </ul>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/painel/integracoes" search={{}}>Conectar agora</Link>
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <Section label="Quando vai rodar" value={job.human_readable} />
        <Section label="Expressão cron" value={job.cron_expression} mono />
        <Section
          label="Próxima execução"
          value={
            job.next_run_at
              ? new Date(job.next_run_at).toLocaleString("pt-BR", {
                  timeZone: job.timezone,
                  dateStyle: "full",
                  timeStyle: "short",
                })
              : "—"
          }
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <Section
          label="Última execução"
          value={
            job.last_run_at
              ? new Date(job.last_run_at).toLocaleString("pt-BR", {
                  timeZone: job.timezone,
                  dateStyle: "full",
                  timeStyle: "short",
                })
              : "Nunca"
          }
        />
        <Section label="Estado no runtime" value={formatRuntimeState(job.runtime_state)} />
        <Section
          label="Último resultado do runtime"
          value={formatRuntimeLastStatus(job.runtime_last_status)}
        />
        <Section
          label="Última sincronização do runtime"
          value={
            job.runtime_synced_at
              ? new Date(job.runtime_synced_at).toLocaleString("pt-BR", {
                  timeZone: job.timezone,
                  dateStyle: "full",
                  timeStyle: "short",
                })
              : "Ainda não sincronizado"
          }
        />
        <Section label="Fuso horário" value={job.timezone} />
        <Section label="Descrição original (NL)" value={job.natural_language_input} />
        {job.description && <Section label="Notas" value={job.description} />}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ação enviada ao agente
          </p>
          <pre className="mt-1 rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            {job.action_prompt}
          </pre>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Integrações necessárias
          </p>
          {requiredMcps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {requiredMcps.map((m) => {
                const ok = connectedMcpIds.has(m.id);
                return (
                  <Badge key={m.id} variant={ok ? "success" : "destructive"}>
                    {m.name} {ok ? "✓" : "(não conectado)"}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove permanentemente “{job.name}”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm flex items-center gap-2 ${mono ? "font-mono" : ""}`}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}

function formatRuntimeState(state: ScheduledJob["runtime_state"]): string {
  switch (state) {
    case "scheduled":
      return "Agendado";
    case "paused":
      return "Pausado";
    case "completed":
      return "Concluído";
    case "error":
      return "Erro";
    default:
      return "Desconhecido";
  }
}

function formatRuntimeLastStatus(status: ScheduledJob["runtime_last_status"]): string {
  switch (status) {
    case "ok":
      return "Sucesso";
    case "error":
      return "Erro";
    default:
      return "Ainda sem execução";
  }
}
