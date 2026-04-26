"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/mika/Logo";
import { TelegramIcon } from "@/components/mika/telegram/TelegramIcon";
import { TelegramOnboardingWizard } from "@/components/mika/telegram/TelegramOnboardingWizard";
import { cn } from "@/lib/utils";

const WELCOME_DONE_KEY = "mika-welcome-done";

export const Route = createFileRoute("/bem-vindo")({
  component: WelcomePage,
});

function WelcomePage() {
  const { user, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const { data: agent } = useAgentInstance();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [agentName, setAgentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Managed bot state
  const [creatingBot, setCreatingBot] = useState(false);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [waitTimedOut, setWaitTimedOut] = useState(false);
  const [previewUsername, setPreviewUsername] = useState<string | null>(null);
  const waitStartedAt = useRef<number | null>(null);

  const fullName = (profile?.full_name || "").trim();
  const firstName = useMemo(
    () => (fullName.split(" ")[0] || "você").trim(),
    [fullName],
  );

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login", search: { redirect: "/bem-vindo" } });
    }
  }, [authLoading, user, navigate]);

  // Pré-preenche o input com o default
  useEffect(() => {
    if (agentName) return;
    if (agent?.agent_name) {
      setAgentName(agent.agent_name);
    } else if (firstName && firstName !== "você") {
      setAgentName(`Mika de ${firstName}`);
    }
  }, [agent?.agent_name, firstName, agentName]);

  // Etapa 1 → 2 automático em 3s
  useEffect(() => {
    if (step !== 1) return;
    const t = setTimeout(() => setStep(2), 3000);
    return () => clearTimeout(t);
  }, [step]);

  // Se já completou o onboarding, vai direto para /painel
  useEffect(() => {
    if (!agent) return;
    if (agent.onboarding_completed) {
      navigate({ to: "/painel", search: {} });
    }
  }, [agent, navigate]);

  async function handleSaveName() {
    const trimmed = agentName.trim();
    if (trimmed.length < 2) {
      toast.error("O nome precisa ter pelo menos 2 caracteres.");
      return;
    }
    if (!agent) {
      toast.error("Aguarde, ainda estamos preparando seu agente…");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("agent_instances")
      .update({ agent_name: trimmed })
      .eq("id", agent.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o nome. Tente novamente.");
      return;
    }
    if (user) {
      await queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
    }
    setStep(3);
  }

  async function markWelcomeDone() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WELCOME_DONE_KEY, "1");
    }
    if (agent) {
      await supabase
        .from("agent_instances")
        .update({ onboarding_completed: true })
        .eq("id", agent.id);
      if (user) {
        await queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
      }
    }
  }

  async function handleOpenManualWizard() {
    await markWelcomeDone();
    setWaitingConfirm(false);
    setWizardOpen(true);
  }

  async function handleSkip() {
    await markWelcomeDone();
    navigate({ to: "/painel", search: {} });
  }

  // Sugere username localmente (apenas preview visual antes do clique)
  useEffect(() => {
    if (step !== 3) return;
    if (agent?.managed_bot_suggested_username) {
      setPreviewUsername(agent.managed_bot_suggested_username);
      return;
    }
    const base = (agentName || "mika")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 28);
    const safe = base.length >= 3 ? base : `mika${base}`;
    setPreviewUsername(`${safe}bot`);
  }, [step, agentName, agent?.managed_bot_suggested_username]);

  async function handleCreateManagedBot() {
    if (!agent) {
      toast.error("Aguarde, ainda estamos preparando seu agente…");
      return;
    }
    setCreatingBot(true);
    setWaitTimedOut(false);
    try {
      const { data, error } = await supabase.functions.invoke<{
        url: string;
        suggested_username: string;
        manager_username: string;
      }>("create-managed-bot", {
        body: {
          agent_instance_id: agent.id,
          agent_name: agentName.trim(),
        },
      });
      if (error || !data?.url) {
        throw error ?? new Error("Resposta inválida");
      }
      setPreviewUsername(data.suggested_username);
      window.open(data.url, "_blank", "noopener,noreferrer");
      await markWelcomeDone();
      waitStartedAt.current = Date.now();
      setWaitingConfirm(true);
    } catch (err) {
      console.error(err);
      toast.error(
        "Não foi possível iniciar a criação do bot. Tente novamente ou use o modo manual.",
      );
    } finally {
      setCreatingBot(false);
    }
  }

  // Polling: enquanto aguardamos confirmação, useAgentInstance já refetch a cada 10s.
  // Aceleramos o refetch a cada 3s e detectamos sucesso.
  useEffect(() => {
    if (!waitingConfirm) return;
    if (!user) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
      if (waitStartedAt.current && Date.now() - waitStartedAt.current > 5 * 60_000) {
        setWaitingConfirm(false);
        setWaitTimedOut(true);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [waitingConfirm, user, queryClient]);

  // Detecta sucesso da confirmação via webhook
  useEffect(() => {
    if (!waitingConfirm) return;
    if (agent?.telegram_onboarding_completed && !agent.managed_bot_pending) {
      setWaitingConfirm(false);
      toast.success("🎉 Bot criado! Seu agente está sendo ativado.");
      navigate({ to: "/painel", search: {} });
    }
  }, [waitingConfirm, agent, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[oklch(0.21_0.04_265)]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.21 0.04 265) 0%, oklch(0.27 0.04 265) 100%)",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-center pt-8 pb-4 px-4">
        <Logo size="lg" className="text-white" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 && (
              <motion.section
                key="step-1"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="mx-auto mb-8 h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <Sparkles className="h-12 w-12 text-primary" />
                </motion.div>

                <h1 className="text-4xl font-bold text-white">
                  Bem-vindo à Mika! 🎉
                </h1>
                <p className="mt-4 text-lg text-white/70">
                  Seu assistente pessoal de IA está sendo preparado.
                </p>

                <ul className="mt-10 space-y-3 max-w-sm mx-auto text-left">
                  {[
                    { icon: "✅", text: "Pagamento confirmado" },
                    { icon: "✅", text: "Sua conta está ativa" },
                    { icon: "⏳", text: "Configurando seu agente..." },
                  ].map((item, i) => (
                    <motion.li
                      key={item.text}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.5, duration: 0.4 }}
                      className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white"
                    >
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-sm font-medium">{item.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.section>
            )}

            {step === 2 && (
              <motion.section
                key="step-2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-center"
              >
                <h2 className="text-3xl font-bold text-white">
                  Como você quer chamar seu assistente?
                </h2>
                <p className="mt-3 text-white/70">
                  Este será o nome que aparecerá nas conversas.
                </p>

                <div className="mt-8 mx-auto max-w-md space-y-3">
                  <Input
                    autoFocus
                    value={agentName}
                    maxLength={40}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Ex: Mika de João, Maya, Assistente..."
                    className="h-12 text-center text-lg bg-white/5 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-primary"
                  />
                  <div className="flex justify-between text-xs text-white/50 px-1">
                    <span>
                      {agentName.trim().length < 2
                        ? "Mínimo 2 caracteres"
                        : "\u00A0"}
                    </span>
                    <span>{agentName.length}/40</span>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                  {[
                    `Mika de ${firstName}`,
                    "Maya",
                    "Alex",
                    "Assistente",
                  ].map((sugg) => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => setAgentName(sugg.slice(0, 40))}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        agentName === sugg
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10",
                      )}
                    >
                      {sugg}
                    </button>
                  ))}
                </div>

                <Button
                  size="lg"
                  className="mt-8 min-w-56"
                  disabled={agentName.trim().length < 2 || saving}
                  onClick={handleSaveName}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Continuar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.section>
            )}

            {step === 3 && (
              <motion.section
                key="step-3"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-center"
              >
                <h2 className="text-3xl font-bold text-white">
                  Quase lá! Conecte seu Telegram.
                </h2>
                <p className="mt-3 text-white/70 max-w-lg mx-auto">
                  Para conversar com{" "}
                  <span className="font-semibold text-white">
                    {agentName || "seu agente"}
                  </span>
                  , você precisa conectar seu Telegram. Leva menos de 2 minutos.
                </p>

                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="mx-auto mt-8 mb-8 h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <TelegramIcon className="h-12 w-12 text-primary" />
                </motion.div>

                <ol className="space-y-3 max-w-md mx-auto text-left">
                  <StepRow
                    number={1}
                    title="Abra o BotFather no Telegram"
                    extra={
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="mt-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      >
                        <a
                          href="https://t.me/BotFather?start"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir BotFather <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    }
                  />
                  <StepRow
                    number={2}
                    title="Digite /newbot e siga as instruções"
                    hint={`Use "${agentName || "Mika"}Bot" como username sugerido`}
                  />
                  <StepRow
                    number={3}
                    title="Cole o token aqui na próxima tela"
                  />
                </ol>

                <div className="mt-10 flex flex-col items-center gap-3">
                  <Button
                    size="lg"
                    className="min-w-64"
                    onClick={handleConnectTelegram}
                  >
                    Conectar meu Telegram <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-sm text-white/60 hover:text-white underline-offset-4 hover:underline"
                  >
                    Fazer isso depois
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>

      <TelegramOnboardingWizard
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            // Se o token foi salvo (vault_id presente), considera sucesso
            if (agent?.telegram_bot_token_vault_id) {
              toast.success(
                "Perfeito! Seu agente está sendo ativado. Você receberá uma mensagem no Telegram quando estiver pronto! 🎉",
              );
            }
            navigate({ to: "/painel", search: {} });
          }
        }}
      />
    </div>
  );
}

function StepRow({
  number,
  title,
  hint,
  extra,
}: {
  number: number;
  title: string;
  hint?: string;
  extra?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
      <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
        {number}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{title}</p>
        {hint && <p className="mt-1 text-xs text-white/60">{hint}</p>}
        {extra}
      </div>
    </li>
  );
}

// Marker no componente para cumprir contrato de "marcar como visitada"
// (também usado pelo redirect do /painel)
export function isWelcomeDone(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WELCOME_DONE_KEY) === "1";
}
