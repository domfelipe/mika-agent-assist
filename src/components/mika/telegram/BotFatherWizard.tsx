"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  AlertCircle,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invokeFunction } from "@/lib/invoke-function";
import { cn } from "@/lib/utils";
import {
  sanitizeForUsername,
  suggestBotUsername,
} from "@/lib/telegram-username";

const TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]{35}$/;

interface Props {
  agentName: string;
  fullName: string;
  onActivated: (bot: { bot_username: string; bot_name: string; bot_id: number }) => void;
  onSkip: () => void;
}

type Phase = "configure" | "awaiting_start" | "captured";

export function BotFatherWizard({ agentName, fullName, onActivated, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>("configure");
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [step3Done, setStep3Done] = useState(false);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validatedBot, setValidatedBot] = useState<{
    bot_username: string;
    bot_name: string;
    bot_id: number;
  } | null>(null);
  const pollRef = useRef<number | null>(null);

  const suggestedUsername = useMemo(() => {
    const base = sanitizeForUsername(agentName).replace(/^mikade/, "mika");
    if (base.length >= 5) {
      const trimmed = base.slice(0, 28);
      return trimmed.endsWith("bot") ? trimmed : `${trimmed}bot`;
    }
    return suggestBotUsername(fullName);
  }, [agentName, fullName]);

  const tokenValid = TOKEN_REGEX.test(token.trim());

  function handleOpenBotFather() {
    window.open("https://t.me/BotFather", "_blank", "noopener,noreferrer");
    setStep1Done(true);
  }

  async function handleActivate() {
    if (!tokenValid) return;
    setSubmitting(true);
    setErrorMsg(null);
    const { data, error } = await invokeFunction<{
      bot_username: string;
      bot_name: string;
      bot_id: number;
    }>("validate-telegram-bot", { token: token.trim() });

    if (error || !data?.bot_username) {
      setSubmitting(false);
      setErrorMsg(
        error?.message ?? "Token inválido. Verifique e tente novamente.",
      );
      return;
    }
    setSubmitting(false);
    setValidatedBot(data);
    setPhase("awaiting_start");
  }

  function handleOpenMyBot() {
    if (!validatedBot?.bot_username) return;
    window.open(
      `https://t.me/${validatedBot.bot_username}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  // Polling: enquanto phase === awaiting_start, chama capture-telegram-owner a cada 2.5s
  useEffect(() => {
    if (phase !== "awaiting_start") return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const { data, error } = await invokeFunction<{
        found: boolean;
        chat_id?: number;
        first_name?: string;
        bot_username?: string;
      }>("capture-telegram-owner", {});
      if (cancelled) return;
      if (error) {
        console.warn("capture-telegram-owner error", error);
        return;
      }
      if (data?.found && validatedBot) {
        setPhase("captured");
        setTimeout(() => onActivated(validatedBot), 1400);
      }
    }

    tick();
    pollRef.current = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, validatedBot]);

  if (phase === "awaiting_start" || phase === "captured") {
    return (
      <AwaitingStartPanel
        botUsername={validatedBot?.bot_username ?? ""}
        botName={validatedBot?.bot_name ?? agentName}
        captured={phase === "captured"}
        onOpenBot={handleOpenMyBot}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 items-start">
      {/* COLUNA ESQUERDA — passos */}
      <div className="text-left">
        <h2 className="text-2xl font-bold text-white">
          Crie seu bot em 2 minutos
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Siga os passos abaixo. Cada um leva alguns segundos.
        </p>

        <ol className="mt-6 space-y-4">
          <Step
            number={1}
            emoji="📱"
            title="Abra o BotFather"
            description="O BotFather é o bot oficial do Telegram para criar bots."
            done={step1Done}
            highlight={!step1Done}
          >
            <Button
              size="sm"
              onClick={handleOpenBotFather}
              className="mt-3"
            >
              Abrir BotFather
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-3 text-xs text-white/60">Depois envie este comando:</p>
            <CopyChip value="/newbot" onCopied={() => {}} />
          </Step>

          <Step
            number={2}
            emoji="🤖"
            title="Escolha um nome"
            description="Quando o BotFather perguntar o nome, use:"
            done={step2Done}
            highlight={step1Done && !step2Done}
          >
            <CopyChip
              value={agentName || "Mika"}
              onCopied={() => setStep2Done(true)}
            />
          </Step>

          <Step
            number={3}
            emoji="@"
            title="Escolha um username"
            description="Quando pedir o username (deve terminar em 'bot'), use:"
            done={step3Done}
            highlight={step2Done && !step3Done}
          >
            <CopyChip
              value={suggestedUsername}
              onCopied={() => setStep3Done(true)}
            />
          </Step>

          <Step
            number={4}
            emoji="🔑"
            title="Cole o token aqui"
            description="O BotFather vai te enviar um token. Cole ele abaixo:"
            done={tokenValid}
            highlight={step3Done && !tokenValid}
          >
            <div className="mt-3 space-y-2">
              <Input
                type="text"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className={cn(
                  "h-11 font-mono text-sm bg-white/5 border-white/20 text-white placeholder:text-white/30",
                  tokenValid &&
                    "border-emerald-400/60 focus-visible:ring-emerald-400/40",
                )}
                disabled={submitting}
              />
              {tokenValid && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Token válido!
                </p>
              )}
              {errorMsg && (
                <p className="flex items-start gap-1.5 text-xs text-red-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {errorMsg}
                </p>
              )}
            </div>
          </Step>
        </ol>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            size="lg"
            className="w-full sm:min-w-64 sm:w-auto"
            disabled={!tokenValid || submitting}
            onClick={handleActivate}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Ativar meu agente
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-white/50 hover:text-white/80 underline-offset-4 hover:underline"
          >
            Fazer isso depois
          </button>
        </div>
      </div>

      {/* COLUNA DIREITA — preview animado (apenas desktop) */}
      <aside className="hidden lg:block">
        <ChatPreview agentName={agentName} firstName={fullName.split(" ")[0] || "você"} />
        <ul className="mt-6 space-y-2 text-sm text-white/80">
          {[
            "Responder perguntas e pesquisar",
            "Gerenciar sua agenda e lembretes",
            "Resumir emails importantes",
            "Criar automações personalizadas",
            "Memória persistente entre conversas",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">✅</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Step({
  number,
  emoji,
  title,
  description,
  done,
  highlight,
  children,
}: {
  number: number;
  emoji: string;
  title: string;
  description: string;
  done: boolean;
  highlight: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-4 transition-all",
        done
          ? "border-emerald-500/30 bg-emerald-500/5"
          : highlight
            ? "border-primary/50 bg-primary/5"
            : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-8 w-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm",
            done
              ? "bg-emerald-500 text-white"
              : "bg-primary text-primary-foreground",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            <span className="mr-1.5">{emoji}</span>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-white/60">{description}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

function CopyChip({
  value,
  onCopied,
}: {
  value: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado!");
      onCopied();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "mt-3 group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      <span className="font-mono text-sm text-white truncate">{value}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium shrink-0",
          copied ? "text-emerald-400" : "text-white/60 group-hover:text-white",
        )}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" /> Copiado
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </>
        )}
      </span>
    </button>
  );
}

function ChatPreview({
  agentName,
  firstName,
}: {
  agentName: string;
  firstName: string;
}) {
  const safeName = (agentName || "Mika").trim();
  const safeFirst = (firstName || "você").trim();
  const reply = `Olá, ${safeFirst}! 👋 Sou a Mika, sua assistente pessoal. Como posso ajudar você hoje?`;

  // Cycle: 0 = só "Oi!", 1 = typing, 2 = resposta digitando, 3 = completa, depois reseta
  const [cycle, setCycle] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (cycle === 0) {
      const t = setTimeout(() => setCycle(1), 900);
      return () => clearTimeout(t);
    }
    if (cycle === 1) {
      const t = setTimeout(() => setCycle(2), 1100);
      return () => clearTimeout(t);
    }
    if (cycle === 2) {
      // typewriter
      let i = 0;
      setTyped("");
      const interval = setInterval(() => {
        i += 1;
        setTyped(reply.slice(0, i));
        if (i >= reply.length) {
          clearInterval(interval);
          setTimeout(() => setCycle(3), 1500);
        }
      }, 25);
      return () => clearInterval(interval);
    }
    if (cycle === 3) {
      const t = setTimeout(() => {
        setTyped("");
        setCycle(0);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [cycle, reply]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[oklch(0.18_0.03_265)] p-5 shadow-2xl">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">
        Prévia do seu bot
      </p>

      <div className="mt-3 flex items-center gap-3 border-b border-white/10 pb-3">
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
          🤖
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{safeName}</p>
          <p className="text-xs text-emerald-400">online</p>
        </div>
      </div>

      <div className="mt-4 space-y-2 min-h-[180px]">
        {/* Mensagem do usuário */}
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">
            Oi!
          </div>
        </div>

        {/* Typing indicator */}
        <AnimatePresence>
          {cycle === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-white/60"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resposta do bot */}
        {(cycle === 2 || cycle === 3) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-sm text-white">
              {cycle === 2 ? typed : reply}
              {cycle === 2 && (
                <span className="ml-0.5 inline-block h-3.5 w-px bg-white/80 align-middle animate-pulse" />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
