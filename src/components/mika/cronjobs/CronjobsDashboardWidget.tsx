"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Plus, AlertTriangle } from "lucide-react";
import { useCronjobs, useUserJobsLimits } from "@/hooks/use-cronjobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function CronjobsDashboardWidget() {
  const { data: jobs, isLoading } = useCronjobs();
  const { data: limits } = useUserJobsLimits();

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  const list = jobs ?? [];
  const activeCount = list.filter((j) => j.status === "active").length;
  const autoPausedCount = list.filter((j) => j.status === "auto_paused").length;
  const recent = list.slice(0, 3);
  const planAllows = (limits?.max_jobs ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Suas automações</h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} ativa{activeCount === 1 ? "" : "s"}
              {limits?.max_jobs ? ` de ${limits.max_jobs} disponíveis` : ""}
              {autoPausedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-destructive font-medium">
                    {autoPausedCount} auto-pausada{autoPausedCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link to="/painel/cronjobs">
            Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {!planAllows ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Seu plano atual não inclui automações.{" "}
            <Link to="/painel/faturamento" className="text-primary underline">
              Fazer upgrade
            </Link>
          </p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Crie sua primeira automação descrevendo em português.
          </p>
          <Button asChild size="sm" className="rounded-lg">
            <Link to="/painel/cronjobs/nova">
              <Plus className="h-4 w-4 mr-1.5" /> Nova automação
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((job) => (
            <li key={job.id}>
              <Link
                to="/painel/cronjobs/$id"
                params={{ id: job.id }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{job.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{job.human_readable}</p>
                </div>
                {job.status === "active" && <Badge variant="success" className="shrink-0">Ativa</Badge>}
                {job.status === "paused" && <Badge variant="secondary" className="shrink-0">Pausada</Badge>}
                {job.status === "auto_paused" && (
                  <Badge variant="destructive" className="shrink-0 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Auto
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
