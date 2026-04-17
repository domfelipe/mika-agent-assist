"use client";

import { Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function EmptySkillsState({ disabled }: { disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="h-10 w-10 text-primary/40" />
      </div>
      <h2 className="mt-6 text-xl font-bold">Você ainda não tem skills personalizadas</h2>
      <p className="mt-2 text-muted-foreground max-w-md mx-auto">
        Crie sua primeira skill em 2 minutos e ensine seu agente Mika a fazer
        exatamente o que você precisa.
      </p>
      <Button
        asChild
        size="lg"
        disabled={disabled}
        className="mt-6 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
      >
        <Link to="/painel/skills/nova">Criar primeira skill</Link>
      </Button>
    </div>
  );
}
