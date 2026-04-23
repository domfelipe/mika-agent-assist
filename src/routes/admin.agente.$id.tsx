"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Rocket,
  Save,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { invokeFunction } from "@/lib/invoke-function";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/agente/$id")({
  component: AgentDetailPage,
});

const MODEL_OPTIONS = [
  {
    value: "openrouter/google/gemma-4-27b-a4b-it",
    label: "Gemma 4 27B — Rápido e gratuito (Basic/Starter)",
    plans: ["basic", "starter"],
  },
  {
    value: "openrouter/google/gemma-4-31b-it",
    label: "Gemma 4 31B — Mais capaz (Professional)",
    plans: ["professional", "enterprise"],
  },
];

interface AgentDetail {
  id: string;
  user_id: string;
  uuid_tenant: string;
  status: string;
  telegram_bot_username: string | null;
  telegram_user_chat_id: number | null;
  railway_service_id: string | null;
  vps_pool_id: string | null;
  provisioned_at: string | null;
  created_at: string;
  model_config: Record<string, unknown> | null;
  vps_pool: {
    railway_project_id: string | null;
    railway_environment_id: string | null;
  } | null;
  profile: {
    full_name: string | null;
    phone: string | null;
    onboarding_completed: boolean;
  } | null;
  user_email: string | null;
  subscription: { plans: { slug: string; name: string } | null } | null;
}

function AgentDetailPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent-detail", id],
    enabled: !!isAdmin,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_instances")
        .select(
          `id, user_id, uuid_tenant, status, telegram_bot_username, telegram_user_chat_id,
           railway_service_id, vps_pool_id, provisioned_at, created_at, model_config,
           vps_pool:vps_pool_id(railway_project_id, railway_environment_id),
           profile:profiles!agent_instances_user_id_fkey(full_name, phone, onboarding_completed),
           subscription:subscriptions!subscriptions_user_id_fkey(plans(slug, name))`,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // Normalizar arrays vindos do PostgREST
      // deno-lint-ignore no-explicit-any
      const d = data as any;
      const profile = Array.isArray(d.profile) ? d.profile[0] ?? null : d.profile;
      const subscription = Array.isArray(d.subscription)
        ? d.subscription.find((s: { plans: unknown }) => s.plans) ?? d.subscription[0] ?? null
        : d.subscription;

      // Email não é acessível via client (RLS) — admin pode ver no Railway/Telegram
      const userEmail: string | null = null;

      return { ...d, profile, subscription, user_email: userEmail } as AgentDetail;
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["provisioning-jobs", id],
    enabled: !!isAdmin,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provisioning_jobs")
        .select("id, status, created_at, error_message, attempt")
        .eq("agent_instance_id", id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // ===== Estado do formulário =====
  const fullName = agent?.profile?.full_name?.trim() || "Usuário";
  const firstName = fullName.split(" ")[0] || "Usuário";
  const planSlug = agent?.subscription?.plans?.slug ?? "basic";
  const isPro = ["professional", "enterprise"].includes(planSlug);
  const defaultModel = isPro
    ? "openrouter/google/gemma-4-31b-it"
    : "openrouter/google/gemma-4-27b-a4b-it";

  const cfg = (agent?.model_config ?? {}) as Record<string, string | undefined>;
  const defaultAgentName = cfg.agent_name || `Mika de ${firstName}`;
  const defaultSoul = useMemo(
    () =>
      `Você se chama ${defaultAgentName}. Você é um assistente pessoal de IA criado pela DOMCO para ${fullName}. Você é proativo, direto e fala sempre em português brasileiro. Você ajuda ${firstName} a ser mais produtivo — gerenciando emails, agenda, tarefas e automatizando o que puder. Seja conciso nas respostas via Telegram. Nunca se identifique como Hermes ou como produto da Nous Research — você é Mika.`,
    [defaultAgentName, fullName, firstName],
  );

  const [agentName, setAgentName] = useState("");
  const [soul, setSoul] = useState("");
  const [model, setModel] = useState("");
  const [stt, setStt] = useState("local");
  const [tts, setTts] = useState("disabled");
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!agent || initialized) return;
    setAgentName(defaultAgentName);
    setSoul(defaultSoul);
    setModel(cfg.provider || defaultModel);
    setStt(cfg.stt || "local");
    setTts(cfg.tts || "disabled");
    setInitialized(true);
  }, [agent, initialized, defaultAgentName, defaultSoul, cfg.provider, cfg.stt, cfg.tts, defaultModel]);

  // ===== Auth guard =====
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", search: { redirect: `/admin/agente/${id}` } });
    }
  }, [authLoading, user, navigate, id]);

  useEffect(() => {
    if (!roleLoading && isAdmin === false) {
      navigate({ to: "/painel" });
    }
  }, [roleLoading, isAdmin, navigate]);

  if (authLoading || roleLoading || agentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Acesso negado</h1>
          <Button asChild variant="outline">
            <Link to="/painel">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao painel
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Agente não encontrado</h1>
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao admin
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const needsProvision = !agent.railway_service_id && agent.status !== "active";

  async function handleProvision() {
    if (soul.length < 100) {
      toast.error("A personalidade precisa ter pelo menos 100 caracteres.");
      return;
    }
    setBusy(true);
    const { data, error } = await invokeFunction<{ success?: boolean; error?: string }>(
      "provision-agent",
      {
        agent_instance_id: id,
        agent_name: agentName,
        soul_content: soul,
        model,
        stt_provider: stt,
        tts_provider: tts,
      },
    );
    setBusy(false);
    if (error || data?.error) {
      toast.error(`Falha ao provisionar: ${error?.message || data?.error}`);
      return;
    }
    toast.success("Agente provisionado com sucesso! O cliente será notificado.");
    queryClient.invalidateQueries({ queryKey: ["agent-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["agents-admin"] });
    queryClient.invalidateQueries({ queryKey: ["provisioning-jobs", id] });
  }

  async function handleUpdate() {
    if (soul.length < 100) {
      toast.error("A personalidade precisa ter pelo menos 100 caracteres.");
      return;
    }
    setBusy(true);
    const { data, error } = await invokeFunction<{ success?: boolean; error?: string }>(
      "update-agent-config",
      {
        agent_instance_id: id,
        agent_name: agentName,
        soul_content: soul,
        model,
        stt_provider: stt,
        tts_provider: tts,
      },
    );
    setBusy(false);
    if (error || data?.error) {
      toast.error(`Falha ao atualizar: ${error?.message || data?.error}`);
      return;
    }
    toast.success("Configuração atualizada! Redeploy disparado no Railway.");
    queryClient.invalidateQueries({ queryKey: ["agent-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["agents-admin"] });
  }

  return (
    <div className="min-h-screen bg-background px-4 sm:px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" /> Configurar agente
            </h1>
            <p className="mt-1 text-sm text-muted-foreground font-mono">
              {agent.uuid_tenant.slice(0, 8)} · {agent.profile?.full_name || "Sem nome"}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao admin
            </Link>
          </Button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* ===== Coluna esquerda — Formulário ===== */}
          <div className="space-y-6">
            {/* Cliente */}
            <section className="rounded-xl border border-border bg-card p-6 shadow-soft space-y-3">
              <h2 className="font-semibold text-lg">Informações do cliente</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Nome" value={agent.profile?.full_name || "—"} />
                <Field label="Email" value={agent.user_email || "—"} />
                <Field label="Telefone" value={agent.profile?.phone || "—"} />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Plano</dt>
                  <dd>
                    <PlanBadge slug={agent.subscription?.plans?.slug ?? null} />
                  </dd>
                </div>
                <Field
                  label="Cadastro"
                  value={new Date(agent.created_at).toLocaleDateString("pt-BR")}
                />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bot Telegram</dt>
                  <dd>
                    {agent.telegram_bot_username ? (
                      <a
                        href={`https://t.me/${agent.telegram_bot_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 font-mono text-sm"
                      >
                        @{agent.telegram_bot_username}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">Não conectado</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Configuração */}
            <section className="rounded-xl border border-border bg-card p-6 shadow-soft space-y-4">
              <h2 className="font-semibold text-lg">Configuração do agente</h2>

              <div className="space-y-2">
                <Label htmlFor="agent-name">Nome do agente</Label>
                <Input
                  id="agent-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value.slice(0, 50))}
                  maxLength={50}
                  placeholder={`Mika de ${firstName}`}
                />
                <p className="text-xs text-muted-foreground">{agentName.length}/50</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="soul">Personalidade (SOUL.md)</Label>
                <Textarea
                  id="soul"
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className={`text-xs ${soul.length < 100 ? "text-destructive" : "text-muted-foreground"}`}>
                  {soul.length} caracteres (mínimo 100)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Modelo de IA</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stt">STT (transcrição de áudio)</Label>
                  <Select value={stt} onValueChange={setStt}>
                    <SelectTrigger id="stt">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local — Gratuito (faster-whisper)</SelectItem>
                      <SelectItem value="disabled">Desativado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tts">TTS (resposta em áudio)</Label>
                  <Select value={tts} onValueChange={setTts}>
                    <SelectTrigger id="tts">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">Desativado</SelectItem>
                      <SelectItem value="edge">Edge TTS — Gratuito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Ações */}
            <section className="rounded-xl border border-border bg-card p-6 shadow-soft space-y-3">
              <h2 className="font-semibold text-lg">Ações</h2>
              {needsProvision ? (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={handleProvision}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-5 w-5 mr-2" />
                  )}
                  Provisionar agente
                </Button>
              ) : (
                <Button size="lg" className="w-full" disabled={busy} onClick={handleUpdate}>
                  {busy ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-5 w-5 mr-2" />
                  )}
                  Salvar e atualizar agente
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/admin">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao admin
                </Link>
              </Button>
            </section>
          </div>

          {/* ===== Coluna direita — Status ===== */}
          <aside className="space-y-4">
            <StatusCard agent={agent} />
            <TelegramCard agent={agent} />
            <RailwayCard agent={agent} />
            <HistoryCard jobs={jobs ?? []} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ============== Subcomponents ==============

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Ativo</Badge>;
  if (status === "provisioning") return <Badge variant="secondary">Provisionando</Badge>;
  if (status === "suspended") return <Badge variant="destructive">Suspenso</Badge>;
  if (status === "error") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function PlanBadge({ slug }: { slug: string | null }) {
  if (!slug) return <Badge variant="outline">Sem plano</Badge>;
  if (slug === "professional" || slug === "enterprise")
    return <Badge variant="success" className="capitalize">{slug}</Badge>;
  if (slug === "starter") return <Badge variant="secondary" className="capitalize">{slug}</Badge>;
  return <Badge variant="outline" className="capitalize">{slug}</Badge>;
}

function StatusCard({ agent }: { agent: AgentDetail }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status</h3>
      <StatusBadge status={agent.status} />
      <p className="text-xs text-muted-foreground">
        Atualiza automaticamente a cada 10s
      </p>
    </div>
  );
}

function TelegramCard({ agent }: { agent: AgentDetail }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Telegram</h3>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Bot:</span>{" "}
          <span className="font-mono">@{agent.telegram_bot_username || "—"}</span>
        </p>
        {agent.telegram_user_chat_id && (
          <p>
            <span className="text-muted-foreground">Chat ID:</span>{" "}
            <span className="font-mono">{agent.telegram_user_chat_id}</span>
          </p>
        )}
      </div>
      {agent.telegram_bot_username && (
        <Button asChild variant="outline" size="sm" className="w-full">
          <a
            href={`https://t.me/${agent.telegram_bot_username}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Testar bot <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

function RailwayCard({ agent }: { agent: AgentDetail }) {
  const projectId = agent.vps_pool?.railway_project_id;
  const serviceId = agent.railway_service_id;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Railway</h3>
      {serviceId ? (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">Service ID:</span>{" "}
            <span className="font-mono">{serviceId.slice(0, 8)}…</span>
          </p>
          {agent.provisioned_at && (
            <p className="text-sm">
              <span className="text-muted-foreground">Último deploy:</span>{" "}
              {new Date(agent.provisioned_at).toLocaleString("pt-BR")}
            </p>
          )}
          {projectId && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <a
                href={`https://railway.com/project/${projectId}/service/${serviceId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir no Railway <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Não provisionado</p>
      )}
    </div>
  );
}

function HistoryCard({
  jobs,
}: {
  jobs: Array<{ id: string; status: string; created_at: string; error_message: string | null; attempt: number }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico</h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem jobs ainda</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="text-xs space-y-0.5 border-l-2 border-border pl-2">
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant={
                    j.status === "completed"
                      ? "success"
                      : j.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-[10px]"
                >
                  {j.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {j.error_message && (
                <p className="text-destructive truncate" title={j.error_message}>
                  {j.error_message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
