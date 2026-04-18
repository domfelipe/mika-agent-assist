"use client";

import { Link } from "@tanstack/react-router";
import { Pause, Play, Trash2, Clock, AlertTriangle } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type ScheduledJob,
  useDeleteCronjob,
  useUpdateCronjobStatus,
} from "@/hooks/use-cronjobs";
import { useAvailableMcps, useUserIntegrations } from "@/hooks/use-integrations";

interface Props {
  job: ScheduledJob;
}

export function CronjobCard({ job }: Props) {
  const updateMut = useUpdateCronjobStatus();
  const deleteMut = useDeleteCronjob();
  const { data: mcps = [] } = useAvailableMcps();
  const { data: integrations = [] } = useUserIntegrations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const connectedMcpIds = new Set(
    integrations.filter((i) => i.status === "active").map((i) => i.mcp_id),
  );
  const requiredMcps = job.required_mcp_slugs
    .map((slug) => mcps.find((m) => m.slug === slug))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const missingMcps = requiredMcps.filter((m) => !connectedMcpIds.has(m.id));

  const isActive = job.status === "active";
  const isAutoPaused = job.status === "auto_paused";

  async function toggle() {
    try {
      await updateMut.mutateAsync({
        id: job.id,
        status: isActive ? "paused" : "active",
      });
      toast.success(isActive ? "Automação pausada." : "Automação ativada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar.");
    }
  }

  async function remove() {
    try {
      await deleteMut.mutateAsync(job.id);
      toast.success("Automação excluída.");
      setConfirmDelete(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{job.name}</h3>
            {isActive && <Badge variant="success">Ativa</Badge>}
            {job.status === "paused" && <Badge variant="secondary">Pausada</Badge>}
            {isAutoPaused && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Auto-pausada
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {job.human_readable}
          </p>
        </div>
      </div>

      {isAutoPaused && job.auto_paused_reason && (
        <p className="text-xs text-destructive">{job.auto_paused_reason}</p>
      )}

      {missingMcps.length > 0 && isActive && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            Integrações faltando:{" "}
          </span>
          {missingMcps.map((m) => m.name).join(", ")}
        </div>
      )}

      {requiredMcps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {requiredMcps.map((m) => {
            const ok = connectedMcpIds.has(m.id);
            return (
              <Badge key={m.id} variant={ok ? "outline" : "destructive"} className="text-xs">
                {m.name}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">{job.cron_expression}</span>
        {job.next_run_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(job.next_run_at).toLocaleString("pt-BR", {
              timeZone: job.timezone,
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <Button asChild variant="ghost" size="sm">
          <Link to="/painel/cronjobs/$id" params={{ id: job.id }}>
            Detalhes
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={updateMut.isPending}
          >
            {isActive ? (
              <>
                <Pause className="h-3 w-3 mr-1" /> Pausar
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" /> Ativar
              </>
            )}
          </Button>

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente a automação “{job.name}”.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMut.isPending}>
                  Cancelar
                </AlertDialogCancel>
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
      </div>
    </div>
  );
}
