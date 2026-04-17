"use client";

import { Sparkles, Shield, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TelegramIcon } from "./TelegramIcon";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <TelegramIcon className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
        Vamos conectar seu Telegram em 30 segundos
      </h2>
      <p className="mt-3 text-muted-foreground max-w-md">
        Seu agente Mika ficará disponível diretamente no Telegram — onde você já passa seu dia.
      </p>

      <ul className="mt-8 space-y-3 text-left max-w-sm w-full">
        <Bullet icon={<Sparkles className="h-4 w-4" />}>
          Criação gratuita via BotFather
        </Bullet>
        <Bullet icon={<Shield className="h-4 w-4" />}>
          Nenhum dado sensível compartilhado conosco
        </Bullet>
        <Bullet icon={<Smartphone className="h-4 w-4" />}>
          Funciona no celular, desktop e web
        </Bullet>
      </ul>

      <Button size="lg" className="mt-8 min-w-48" onClick={onNext}>
        Vamos começar
      </Button>
    </div>
  );
}

function Bullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </li>
  );
}
