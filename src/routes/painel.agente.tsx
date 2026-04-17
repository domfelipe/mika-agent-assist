"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Cpu, MessageSquare, Sparkles, BarChart3, Loader2 } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { useUserSkillLimits } from "@/hooks/use-user-skill-limits";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/painel/agente")({
  component: AgentePage,
});

const STATUS_MAP: Record<string, { label: string; variant: "warning" | "success" | "destructive"; pulse?: boolean }> = {
  provisioning: { label: "Provisionando", variant: "warning", pulse: true },
  active: { label: "Online", variant: "success" },
  suspended: { label: "Suspenso", variant: "destructive" },
  error: { label: "Erro", variant: "destructive" },
};

function AgentePage() {
  const { data: profile } = useProfile();
  const agent = useAgentInstance();
  const limits = useUserSkillLimits();
  const { user } = useAuth();

  const lastTestRun = useQuery({
    queryKey: ["last-test-run", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_test_runs")
        .select("created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.created_at ?? null;
    },
  });

  const loading = agent.isLoading;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const firstName = (profile?.full_name || "").split(" ")[0] || "Você";
  const agentName = `Mika de ${firstName}`;
  const status = agent.data?.status ?? "provisioning";
  const statusInfo = STATUS_MAP[status] ?? STATUS_MAP.provisioning;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Meu Agente</h1>
        <p className="mt-1 text-muted-foreground">
          Gerencie seu agente pessoal de IA
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Seu agente — full width */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-4">
            <div className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center shrink-0",
              status === "active" ? "bg-emerald-500/10" : "bg-primary/10",
            )}>
              <Bot className={cn("h-7 w-7", status === "active" ? "text-emerald-500" : "text-primary")} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold">{agentName}</h2>
                <Badge
                  variant="outline"
                  className={cn(statusInfo.color, statusInfo.pulse && "animate-pulse")}
                >
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {status === "provisioning"
                  ? "Estamos preparando sua instância. Geralmente leva até 10 minutos."
                  : status === "active"
                    ? "Seu agente está online e pronto para receber skills."
                    : "Houve um problema com sua instância. Entre em contato com o suporte."}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Modelo de IA */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3 mb-3">
            <Cpu className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Modelo de IA</h3>
          </div>
          <p className="text-lg font-bold">Opencode Zen</p>
          <Badge variant="outline" className="mt-2 text-xs">
            Padrão do plano
          </Badge>
        </div>

        {/* Card 3: Canais conectados */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3 mb-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Canais conectados</h3>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Telegram</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled>
                  Conectar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disponível em breve</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Card 4: Estatísticas */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Estatísticas</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatItem label="Interações hoje" value="0" />
            <StatItem
              label="Skills ativas"
              value={limits.isLoading ? "..." : String(limits.data?.current_skills_count ?? 0)}
            />
            <StatItem
              label="Último teste"
              value={
                lastTestRun.data
                  ? formatDistanceToNow(new Date(lastTestRun.data), { addSuffix: true, locale: ptBR })
                  : "—"
              }
            />
            <StatItem label="Uptime" value="—" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
