"use client";

import { useState } from "react";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { TelegramIcon } from "./TelegramIcon";
import { TelegramOnboardingWizard } from "./TelegramOnboardingWizard";
import { DisconnectTelegramDialog } from "./DisconnectTelegramDialog";

function formatPtBR(date: string | null): string | null {
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return null;
  }
}

export function TelegramStatusCard() {
  const { data: agent } = useAgentInstance();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const connected = !!agent?.telegram_bot_username;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-3 mb-4">
        <TelegramIcon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Telegram</h3>
        {connected && (
          <Badge variant="success" className="ml-auto">
            Conectado
          </Badge>
        )}
      </div>

      {!connected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <TelegramIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Telegram não conectado</p>
              <p className="text-sm text-muted-foreground">
                Conecte seu bot para começar a conversar com o Mika.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            disabled={agent?.status === "suspended" || agent?.status === "error"}
          >
            Conectar agora
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-mono text-sm">@{agent!.telegram_bot_username}</p>
            {agent!.telegram_connected_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                Conectado em {formatPtBR(agent!.telegram_connected_at)}
              </p>
            )}
          </div>

          {agent!.telegram_token_invalid && (
            <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-destructive-foreground">
                Token revogado — desconecte e reconecte.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://t.me/${agent!.telegram_bot_username}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir bot <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDisconnectOpen(true)}>
              Desconectar
            </Button>
          </div>
        </div>
      )}

      <TelegramOnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <DisconnectTelegramDialog open={disconnectOpen} onOpenChange={setDisconnectOpen} />
    </div>
  );
}
