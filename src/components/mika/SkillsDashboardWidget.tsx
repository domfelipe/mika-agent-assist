"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Plus } from "lucide-react";
import { useSkills } from "@/hooks/use-skills";
import { useUserSkillLimits } from "@/hooks/use-user-skill-limits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkillStatusBadge } from "@/components/mika/skills/SkillStatusBadge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SkillsDashboardWidget() {
  const { data: skills, isLoading } = useSkills(false);
  const { data: limits } = useUserSkillLimits();

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  const list = skills ?? [];
  const activeCount = list.filter((s) => s.status === "active").length;
  const recent = list.slice(0, 3);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Suas skills</h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} ativa{activeCount === 1 ? "" : "s"}
              {limits?.max_skills ? ` de ${limits.max_skills} disponíveis` : ""}
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
          <Link to="/painel/skills">
            Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Você ainda não criou skills personalizadas para o Mika.
          </p>
          <Button asChild size="sm" className="rounded-lg">
            <Link to="/painel/skills/nova">
              <Plus className="h-4 w-4 mr-1.5" /> Criar primeira skill
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((skill) => (
            <li key={skill.id}>
              <Link
                to="/painel/skills/$id"
                params={{ id: skill.id }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{skill.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizada {formatDistanceToNow(new Date(skill.updated_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <SkillStatusBadge status={skill.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
