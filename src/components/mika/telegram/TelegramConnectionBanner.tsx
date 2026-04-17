"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { TelegramOnboardingWizard } from "./TelegramOnboardingWizard";

/**
 * Banner sticky no topo do painel.
 * - Suspended/error → vermelho com link p/ faturamento
 * - token revogado → vermelho com link p/ Meu Agente
 * - bot ainda não conectado → amber com CTA para abrir o wizard
 */
export function TelegramConnectionBanner() {
  const { data: agent } = useAgentInstance();
  const [open, setOpen] = useState(false);

  if (!agent) return null;

  if (agent.status === "suspended" || agent.status === "error") {
    return (
      <div className="sticky top-16 z-30 -mx-4 sm:mx-0 sm:rounded-lg border-y sm:border border-destructive bg-destructive/10 px-4 py-3 text-sm">
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="flex-1 text-destructive-foreground">
            Seu agente está suspenso. Regularize sua assinatura em Faturamento.
          </span>
          <Button asChild size="sm" variant="destructive">
            <Link to="/painel/faturamento">Ir para Faturamento</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (agent.telegram_token_invalid) {
    return (
      <div className="sticky top-16 z-30 -mx-4 sm:mx-0 sm:rounded-lg border-y sm:border border-destructive bg-destructive/10 px-4 py-3 text-sm">
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="flex-1 text-destructive-foreground">
            Seu token Telegram foi revogado. Desconecte e reconecte o bot.
          </span>
          <Button asChild size="sm" variant="destructive">
            <Link to="/painel/agente">Ir para Meu Agente</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Onboarding iniciado mas não finalizado (usuário fechou o wizard antes do fim)
  if (agent.telegram_bot_username && !agent.telegram_onboarding_completed) {
    return (
      <>
        <div className="sticky top-16 z-30 -mx-4 sm:mx-0 sm:rounded-lg border-y sm:border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <div className="flex items-start sm:items-center gap-3 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1">
              Você começou a configurar o Telegram. Termine os últimos passos para conversar com o Mika.
            </span>
            <Button size="sm" onClick={() => setOpen(true)}>
              Continuar configuração
            </Button>
          </div>
        </div>
        <TelegramOnboardingWizard open={open} onOpenChange={setOpen} />
      </>
    );
  }

  if (agent.telegram_bot_username) return null;

  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 sm:mx-0 sm:rounded-lg border-y sm:border border-warning bg-warning/10 px-4 py-3 text-sm">
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="flex-1">
            Conecte seu Telegram para começar a conversar com o Mika.
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>
            Conectar agora
          </Button>
        </div>
      </div>

      <TelegramOnboardingWizard open={open} onOpenChange={setOpen} />
    </>
  );
}
