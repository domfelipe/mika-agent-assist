"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useSkills } from "@/hooks/use-skills";
import { useUserSkillLimits } from "@/hooks/use-user-skill-limits";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { NoSubscriptionState } from "@/components/mika/skills/NoSubscriptionState";
import { AgentProvisioningState } from "@/components/mika/skills/AgentProvisioningState";
import { EmptySkillsState } from "@/components/mika/skills/EmptySkillsState";
import { SkillCard } from "@/components/mika/skills/SkillCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/painel/skills/")({
  component: SkillsPage,
});

function SkillsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const limits = useUserSkillLimits();
  const agent = useAgentInstance();
  const skills = useSkills(showArchived);

  const loading = limits.isLoading || agent.isLoading || skills.isLoading;
  const noSub = !limits.isLoading && (limits.data?.max_skills == null);
  const agentNotReady =
    !agent.isLoading &&
    (!agent.data || agent.data.status === "provisioning");
  const atLimit =
    limits.data != null &&
    limits.data.max_skills != null &&
    limits.data.current_skills_count >= limits.data.max_skills;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
          <p className="mt-1 text-muted-foreground">
            Crie automações personalizadas para seu agente Mika
          </p>
        </div>

        {!noSub && (
          <div className="flex items-center gap-3 flex-wrap">
            {limits.data && limits.data.max_skills != null && (
              <span className="text-sm text-muted-foreground px-3 py-1.5 rounded-lg bg-muted">
                {limits.data.current_skills_count} de {limits.data.max_skills} skills
              </span>
            )}

            <div className="flex items-center gap-2">
              <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="archived" className="text-sm text-muted-foreground cursor-pointer">
                Arquivadas
              </Label>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={atLimit || agentNotReady ? 0 : -1}>
                  <Button
                    asChild={!atLimit && !agentNotReady}
                    disabled={atLimit || agentNotReady}
                    className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
                  >
                    {atLimit || agentNotReady ? (
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Nova skill
                      </span>
                    ) : (
                      <Link to="/painel/skills/nova">
                        <Plus className="h-4 w-4 mr-1" /> Nova skill
                      </Link>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {(atLimit || agentNotReady) && (
                <TooltipContent>
                  {agentNotReady
                    ? "Aguarde o provisionamento do agente terminar"
                    : `Limite de ${limits.data?.max_skills} skills do plano ${limits.data?.plan_slug ?? ""}. Faça upgrade ou arquive uma skill.`}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        )}
      </header>

      {noSub ? (
        <NoSubscriptionState />
      ) : agentNotReady ? (
        <AgentProvisioningState />
      ) : skills.data && skills.data.length === 0 ? (
        <EmptySkillsState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.data?.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}
