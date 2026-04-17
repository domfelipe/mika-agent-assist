"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  'Clique em "Abrir BotFather" acima',
  "Envie /newbot",
  "Siga as instruções do BotFather",
];

export function StepCreateBot({ onNext }: { onNext: () => void }) {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight">Crie seu bot no BotFather</h2>
      <p className="mt-2 text-muted-foreground">
        O BotFather é o bot oficial do Telegram para criar outros bots. É gratuito e leva 1 minuto.
      </p>

      <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
        <a href="https://t.me/BotFather?start" target="_blank" rel="noopener noreferrer">
          Abrir BotFather <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>

      <ol className="mt-8 space-y-3">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
              {i + 1}
            </span>
            <span className="text-sm pt-1">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex justify-end">
        <Button variant="secondary" onClick={onNext}>
          Já criei meu bot
        </Button>
      </div>
    </div>
  );
}
