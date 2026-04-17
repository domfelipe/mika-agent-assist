"use client";

import { Hourglass } from "lucide-react";

export function AgentProvisioningState() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 sm:p-12 text-center shadow-soft">
      <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
        <Hourglass className="h-8 w-8 text-amber-500 animate-pulse" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">Aguardando seu agente ficar pronto</h2>
      <p className="mt-2 text-muted-foreground max-w-md mx-auto">
        Estamos provisionando sua instância do Mika. Você poderá criar skills assim
        que o provisionamento terminar — geralmente em até 10 minutos.
      </p>
    </div>
  );
}
