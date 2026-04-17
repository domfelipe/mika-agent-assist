"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeFunction } from "@/lib/invoke-function";

interface Props {
  onConfigured: () => void;
  onSkip: () => void;
}

export function StepConfiguring({ onConfigured, onSkip }: Props) {
  const [state, setState] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setError(null);

    (async () => {
      const { error: err } = await invokeFunction("configure-telegram-webhook");
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setState("error");
        return;
      }
      window.setTimeout(() => {
        if (!cancelled) onConfigured();
      }, 800);
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, onConfigured]);

  return (
    <div className="px-6 py-12 flex flex-col items-center justify-center min-h-[320px]">
      {state === "loading" && (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="mt-4 text-sm text-muted-foreground">
            Configurando recebimento de mensagens...
          </p>
        </>
      )}

      {state === "error" && (
        <div className="w-full max-w-md rounded-lg border border-destructive bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <h3 className="mt-3 font-semibold">Falha ao configurar webhook</h3>
          {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => setAttempt((a) => a + 1)}>Tentar novamente</Button>
            <Button variant="ghost" onClick={onSkip}>
              Pular (configurar depois)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
