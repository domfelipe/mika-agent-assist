"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
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
import { useDependentJobsForMcp } from "@/hooks/use-integrations";
import { invokeFunction } from "@/lib/invoke-function";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected?: () => void;
  integrationId: string;
  mcpSlug: string;
  mcpName: string;
}

export function DisconnectMCPDialog({
  open,
  onOpenChange,
  onDisconnected,
  integrationId,
  mcpSlug,
  mcpName,
}: Props) {
  const { data: dependentJobs = [], isLoading } = useDependentJobsForMcp(
    open ? mcpSlug : undefined,
  );
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const activeJobs = dependentJobs.filter((j) => j.status === "active");
  const hasActiveJobs = activeJobs.length > 0;

  async function handleDisconnect() {
    setSubmitting(true);
    const { data, error } = await invokeFunction<{
      success: boolean;
      paused_jobs_count: number;
      runtime_sync_warning?: string | null;
    }>("disconnect-integration", {
      integration_id: integrationId,
      force_pause_jobs: dependentJobs.length > 0,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${mcpName} desconectado.`);
    if ((data?.paused_jobs_count ?? 0) > 0) {
      toast.info(`${data!.paused_jobs_count} automação(ões) pausada(s).`);
    }
    if (data?.runtime_sync_warning) {
      toast.warning("Integração removida, mas o runtime do agente não sincronizou.");
    }
    queryClient.invalidateQueries({ queryKey: ["user-integrations"] });
    queryClient.invalidateQueries({ queryKey: ["user-integration-limits"] });
    onOpenChange(false);
    onDisconnected?.();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar {mcpName}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                A conexão será removida e os tokens serão revogados. Você pode reconectar
                a qualquer momento.
              </p>

              {isLoading && (
                <p className="text-sm text-muted-foreground">
                  Verificando automações dependentes...
                </p>
              )}

              {!isLoading && hasActiveJobs && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">
                        {activeJobs.length}{" "}
                        {activeJobs.length === 1 ? "automação ativa" : "automações ativas"}{" "}
                        depende{activeJobs.length === 1 ? "" : "m"} desta integração:
                      </p>
                      <ul className="list-disc list-inside mt-1">
                        {activeJobs.slice(0, 5).map((j) => (
                          <li key={j.id}>{j.name}</li>
                        ))}
                        {activeJobs.length > 5 && (
                          <li>e mais {activeJobs.length - 5}...</li>
                        )}
                      </ul>
                      <p className="mt-2 text-xs">
                        Elas serão pausadas automaticamente ao desconectar.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDisconnect();
            }}
            disabled={submitting || isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Desconectando..." : "Desconectar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
