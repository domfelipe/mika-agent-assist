"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { StepWelcome } from "./StepWelcome";
import { StepCreateBot } from "./StepCreateBot";
import { StepToken, type ValidatedBot } from "./StepToken";

const STORAGE_KEY = "mika-onboarding-last-step";
const TOTAL_STEPS = 3;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Step inicial (1-4). Se omitido, lê do localStorage ou começa em 1. */
  initialStep?: number;
}

export function TelegramOnboardingWizard({ open, onOpenChange, initialStep }: Props) {
  const { data: agent } = useAgentInstance();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [validated, setValidated] = useState<ValidatedBot | null>(null);

  // Deriva o passo inicial do estado real do agente.
  function deriveStepFromAgent(): number {
    if (!agent) return 1;
    const hasToken = !!agent.telegram_bot_token_vault_id;
    const hasUsername = !!agent.telegram_bot_username;
    if (hasToken && hasUsername) return 3;
    return 1;
  }

  // Inicializa step ao abrir
  useEffect(() => {
    if (!open) return;
    if (initialStep) {
      setStep(Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
      return;
    }
    const derived = deriveStepFromAgent();
    if (derived === 1 && typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      setStep(1);
      return;
    }
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? Number(stored) : NaN;
      // Usa o maior entre o derivado e o salvo, limitado ao derivado
      // (nunca avança além do que o estado real permite)
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= derived) {
        setStep(parsed);
        return;
      }
    }
    setStep(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStep, agent?.telegram_bot_token_vault_id, agent?.telegram_webhook_configured, agent?.telegram_first_message_received_at]);

  // Persiste step ao mudar
  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(step));
    }
  }, [step, open]);

  function handleClose() {
    onOpenChange(false);
  }


  // Após validar token, recarrega agent_instance, marca onboarding como completo,
  // mostra toast de sucesso e fecha o wizard automaticamente.
  async function handleValidated(bot: ValidatedBot) {
    setValidated(bot);
    if (user) {
      await queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
    }
    if (agent) {
      await supabase
        .from("agent_instances")
        .update({ telegram_onboarding_completed: true })
        .eq("id", agent.id);
      if (user) {
        await queryClient.invalidateQueries({ queryKey: ["agent-instance", user.id] });
      }
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    toast.success("Token salvo! Seu agente será ativado em alguns minutos.");
    onOpenChange(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 bg-background shadow-2xl",
            "inset-0 sm:inset-auto",
            "sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
            "sm:w-full sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh] sm:overflow-y-auto",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Conectar Telegram ao Mika
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Wizard guiado para conectar seu agente Mika ao Telegram em 4 passos.
          </DialogPrimitive.Description>

          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                Passo {step} de {TOTAL_STEPS}
              </span>
              <button
                onClick={handleClose}
                aria-label="Fechar"
                className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1 w-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {step === 1 && <StepWelcome onNext={() => setStep(2)} />}
                {step === 2 && <StepCreateBot onNext={() => setStep(3)} />}
                {step === 3 && (
                  <StepToken
                    validated={validated}
                    onValidated={handleValidated}
                    onNext={() => { /* fechamento é feito em handleValidated */ }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
