"use client";

import { Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NoSubscriptionState() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 sm:p-12 text-center shadow-soft">
      <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h2 className="mt-6 text-2xl font-bold">
        Você precisa de uma assinatura ativa para criar skills
      </h2>
      <p className="mt-2 text-muted-foreground max-w-md mx-auto">
        Escolha um plano para liberar o Skill Studio e começar a personalizar
        seu agente Mika com automações próprias.
      </p>
      <Button
        asChild
        size="lg"
        className="mt-6 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
      >
        <Link to="/" hash="planos">
          Ver planos
        </Link>
      </Button>
    </div>
  );
}
