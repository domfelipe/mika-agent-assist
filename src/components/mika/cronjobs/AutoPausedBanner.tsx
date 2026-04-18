"use client";

import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useCronjobs } from "@/hooks/use-cronjobs";
import { Button } from "@/components/ui/button";

export function AutoPausedBanner() {
  const { data: jobs } = useCronjobs();
  const autoPaused = (jobs ?? []).filter((j) => j.status === "auto_paused");

  if (autoPaused.length === 0) return null;

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-destructive">
          {autoPaused.length === 1
            ? "1 automação foi pausada automaticamente"
            : `${autoPaused.length} automações foram pausadas automaticamente`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Geralmente isso acontece quando uma integração necessária foi desconectada ou expirou.
          Reconecte a integração ou revise a automação para reativá-la.
        </p>
        <ul className="mt-2 text-xs space-y-0.5">
          {autoPaused.slice(0, 3).map((j) => (
            <li key={j.id} className="truncate">
              <Link to="/painel/cronjobs/$id" params={{ id: j.id }} className="text-primary underline">
                {j.name}
              </Link>
              {j.auto_paused_reason && (
                <span className="text-muted-foreground"> — {j.auto_paused_reason}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link to="/painel/cronjobs">Ver todas</Link>
      </Button>
    </div>
  );
}
