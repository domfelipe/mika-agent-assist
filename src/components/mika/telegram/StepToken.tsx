"use client";

import { useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invokeFunction } from "@/lib/invoke-function";
import { cn } from "@/lib/utils";

export interface ValidatedBot {
  bot_username: string;
  bot_name: string;
  bot_id: number;
}

interface Props {
  onValidated: (bot: ValidatedBot) => void;
  onNext: () => void;
  validated: ValidatedBot | null;
}

type State = "idle" | "validating" | "success" | "error";

export function StepToken({ onValidated, onNext, validated }: Props) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>(validated ? "success" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleValidate() {
    setState("validating");
    setErrorMsg(null);
    const { data, error } = await invokeFunction<ValidatedBot>("validate-telegram-bot", {
      token: token.trim(),
    });
    if (error || !data?.bot_username) {
      setState("error");
      setErrorMsg(error?.message ?? "Não foi possível validar o token.");
      return;
    }
    onValidated(data);
    setState("success");
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight">Cole o token do seu bot</h2>
      <p className="mt-2 text-muted-foreground">
        No final da conversa, o BotFather te enviou um token parecido com{" "}
        <span className="font-mono text-xs">8234567890:ABC-DEF...</span>. Cole ele abaixo.
      </p>

      <div
        className={cn(
          "mt-6 rounded-lg border bg-card p-4 transition-colors",
          state === "success" && "border-success bg-success/5",
          state === "error" && "border-destructive bg-destructive/5",
        )}
      >
        <Input
          type="text"
          placeholder="123456789:ABC-DEF..."
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            if (state === "error") setState("idle");
          }}
          disabled={state === "validating" || state === "success"}
          className="font-mono text-sm"
        />

        <Button
          className="mt-3 w-full"
          onClick={handleValidate}
          disabled={!token.trim() || state === "validating" || state === "success"}
        >
          {state === "validating" && (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validando...
            </>
          )}
          {state === "success" && (
            <>
              <Check className="mr-2 h-4 w-4" /> Bot validado!
            </>
          )}
          {(state === "idle" || state === "error") && "Validar conexão"}
        </Button>

        {state === "error" && errorMsg && (
          <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {state === "success" && validated && (
          <div className="mt-4 rounded-md bg-success/10 border border-success/30 p-3">
            <p className="text-sm font-semibold text-success-foreground">{validated.bot_name}</p>
            <p className="text-xs text-muted-foreground">@{validated.bot_username}</p>
          </div>
        )}
      </div>

      {state !== "success" && (
        <div className="mt-6 flex justify-end">
          <Button onClick={onNext} disabled>
            Próximo
          </Button>
        </div>
      )}
    </div>
  );
}
