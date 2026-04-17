"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  testing: "Em teste",
  active: "Ativa",
  disabled: "Desativada",
  archived: "Arquivada",
};

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "warning",
  testing: "info",
  active: "success",
  disabled: "muted",
  archived: "muted",
};

export function SkillStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status] ?? "warning"}
      className={cn(
        "rounded-md font-medium",
        status === "archived" && "opacity-70",
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
