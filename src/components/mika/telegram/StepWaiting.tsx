"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelegramFirstMessage } from "@/hooks/use-telegram-first-message";

interface Props {
  agentInstanceId: string;
  botUsername: string;
  connectedAt: string | null;
  onFinish: () => void;
}

const EMOJIS = ["🎉", "✨", "⭐", "🚀", "🎉", "✨", "⭐", "🚀", "🎉", "✨", "⭐", "🚀"];

export function StepWaiting({ agentInstanceId, botUsername, connectedAt, onFinish }: Props) {
  const { received } = useTelegramFirstMessage({
    agentInstanceId,
    since: connectedAt,
    enabled: true,
  });

  const positions = useMemo(
    () =>
      EMOJIS.map(() => ({
        x: (Math.random() - 0.5) * 320,
        y: (Math.random() - 0.5) * 240,
        rotate: (Math.random() - 0.5) * 80,
      })),
    [],
  );

  return (
    <div className="px-6 py-8 max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {!received ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <h2 className="text-2xl font-bold tracking-tight">
              Mande qualquer mensagem para seu Mika agora
            </h2>
            <p className="mt-2 text-muted-foreground">
              Estou aguardando sua primeira mensagem. Pode ser "oi". 😊
            </p>

            <div className="mt-8 rounded-2xl border-2 border-primary bg-primary/5 p-8 animate-pulse">
              <MessageCircle className="mx-auto h-12 w-12 text-primary" />
              <p className="mt-4 text-sm font-medium">Aguardando sua primeira mensagem...</p>
            </div>

            <Button asChild size="lg" className="mt-6">
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir meu bot no Telegram <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative text-center"
          >
            {/* emojis flutuantes */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {EMOJIS.map((emoji, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.4, x: 0, y: 0, rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0.4, 1.2, 0.8],
                    x: positions[i].x,
                    y: positions[i].y,
                    rotate: positions[i].rotate,
                  }}
                  transition={{
                    duration: 1.5,
                    delay: i * 0.05,
                    ease: "easeOut",
                  }}
                  className="absolute text-3xl"
                >
                  {emoji}
                </motion.span>
              ))}
            </div>

            <div className="relative">
              <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-9 w-9 text-success" />
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">🎉 Mika conectado!</h2>
              <p className="mt-2 text-muted-foreground">
                Você recebeu a primeira resposta do seu agente. Ele ainda está em modo de teste,
                mas em breve vai responder de verdade.
              </p>

              <Button size="lg" className="mt-8 min-w-56" onClick={onFinish}>
                Finalizar onboarding
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
