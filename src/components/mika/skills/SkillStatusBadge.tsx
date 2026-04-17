"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  testing: "Em teste",
  active: "Ativa",
  disabled: "Desativada",
  archived: "Arquivada",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  testing: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  disabled: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  archived: "bg-slate-500/10 text-slate-500/70 border-slate-500/20",
};

export function SkillStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md font-medium",
        STATUS_CLASSES[status] ?? STATUS_CLASSES.draft,
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
