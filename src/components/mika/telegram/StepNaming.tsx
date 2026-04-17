"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  suggestedName: string;
  suggestedUsername: string;
  onNext: () => void;
}

export function StepNaming({ suggestedName, suggestedUsername, onNext }: Props) {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight">Escolha os nomes</h2>
      <p className="mt-2 text-muted-foreground">
        O BotFather vai pedir dois nomes. Use nossas sugestões se quiser.
      </p>

      <div className="mt-6 space-y-4">
        <CopyField
          label="Nome do bot"
          value={suggestedName}
          help="Esse é o nome que aparece no topo da conversa."
        />
        <CopyField
          label="Username (termina em bot)"
          value={suggestedUsername}
          help="Se o username já estiver em uso, tente adicionar um número no final."
        />
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={onNext}>Próximo: colar o token</Button>
      </div>
    </div>
  );
}

function CopyField({ label, value, help }: { label: string; value: string; help?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado para a área de transferência");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <Input value={value} readOnly className="font-mono text-sm" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copiar">
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      {help && <p className="mt-2 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
