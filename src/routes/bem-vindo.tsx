"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/mika/Logo";
import { BotFatherWizard } from "@/components/mika/telegram/BotFatherWizard";
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

  // Se já completou o onboarding E já conectou o Telegram, vai direto para /painel.
  // Se ainda não conectou o Telegram mas já tem nome do agente, pula direto para a etapa 3.
  const jumpedToStep3 = useRef(false);
  useEffect(() => {
    if (!agent) return;
    if (agent.onboarding_completed && agent.telegram_bot_token_vault_id) {
      navigate({ to: "/painel", search: {} });
      return;
    }
    if (
      !jumpedToStep3.current &&
      agent.onboarding_completed &&
      !agent.telegram_bot_token_vault_id &&
      agent.agent_name
    ) {
      jumpedToStep3.current = true;
      setStep(3);
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

  async function handleSkip() {
    await markWelcomeDone();
    navigate({ to: "/painel", search: {} });
  }

  async function handleActivated() {
    await markWelcomeDone();
    if (agent) {
      await supabase
        .from("agent_instances")
        .update({ telegram_onboarding_completed: true })
        .eq("id", agent.id);
    }
    if (user) {
      await queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
    }
    toast.success(
      "🎉 Perfeito! Seu agente está sendo ativado. Em alguns minutos você receberá uma mensagem no Telegram!",
    );
    navigate({ to: "/painel", search: {} });
  }

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
        <div className={cn("w-full", step === 3 ? "max-w-5xl" : "max-w-2xl")}>
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
              >
                <div className="text-center mb-8">
                  <h1 className="text-3xl sm:text-4xl font-bold text-white">
                    Conecte seu Telegram
                  </h1>
                  <p className="mt-2 text-white/70">
                    Falta pouco! Vamos colocar a {agentName || "Mika"} para conversar com você.
                  </p>
                </div>

                <BotFatherWizard
                  agentName={agentName}
                  fullName={fullName}
                  onActivated={handleActivated}
                  onSkip={handleSkip}
                />
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// Marker no componente para cumprir contrato de "marcar como visitada"
// (também usado pelo redirect do /painel)
export function isWelcomeDone(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WELCOME_DONE_KEY) === "1";
}
