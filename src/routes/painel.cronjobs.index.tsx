"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCronjobs, useUserJobsLimits } from "@/hooks/use-cronjobs";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { CronjobCard } from "@/components/mika/cronjobs/CronjobCard";

export const Route = createFileRoute("/painel/cronjobs/")({
  component: CronjobsPage,
});

function CronjobsPage() {
  const { data: jobs = [], isLoading, error } = useCronjobs();
  const { data: limits } = useUserJobsLimits();
  const { data: agent } = useAgentInstance();
  const navigate = useNavigate();

  const agentReady = agent?.status === "active" || agent?.status === "ready";
  const planAllows = (limits?.max_jobs ?? 0) > 0;
  const limitReached =
    !!limits && limits.max_jobs !== null
      ? (limits.current_jobs_count ?? 0) >= (limits.max_jobs ?? 0)
      : false;
  const canCreate = agentReady && planAllows && !limitReached;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" /> Automações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie cronjobs em linguagem natural — a IA traduz para você.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {limits && limits.max_jobs !== null && (
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {limits.current_jobs_count ?? 0}
              </span>
              {" / "}
              {limits.max_jobs} automações
            </div>
          )}
          <Button
            onClick={() => navigate({ to: "/painel/cronjobs/nova" })}
            disabled={!canCreate}
          >
            <Plus className="h-4 w-4 mr-2" /> Nova automação
          </Button>
        </div>
      </div>

      {!agentReady && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          Seu agente ainda está sendo provisionado. As automações serão liberadas em seguida.
        </div>
      )}

      {agentReady && !planAllows && (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <span>
              Seu plano <strong>{limits?.plan_slug ?? "atual"}</strong> não inclui automações.
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/painel/faturamento">Fazer upgrade</Link>
          </Button>
        </div>
      )}

      {agentReady && planAllows && limitReached && (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          Você atingiu o limite de {limits?.max_jobs} automações do plano{" "}
          <strong>{limits?.plan_slug}</strong>. Pause ou exclua para criar novas, ou faça upgrade.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar automações: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <CalendarClock className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">Nenhuma automação ainda</p>
            <p className="text-sm text-muted-foreground">
              Comece descrevendo o que você quer automatizar em português.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => navigate({ to: "/painel/cronjobs/nova" })}>
              <Plus className="h-4 w-4 mr-2" /> Criar primeira automação
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {jobs.map((j) => (
            <CronjobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
