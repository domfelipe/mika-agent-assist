"use client";

import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const messages = [
  { who: "user", text: "Resuma meus e-mails de hoje" },
  {
    who: "bot",
    text: "Você tem 3 e-mails importantes:",
    bullets: [
      "📅 Carla — confirmar reunião de quinta às 15h",
      "💰 Financeiro — fatura do servidor vence amanhã",
      "📝 Time — feedback no documento do Q2",
    ],
  },
  { who: "user", text: "Marca a reunião com a Carla" },
  { who: "bot", text: "Pronto ✅ — agendado para quinta, 15h. Calendário atualizado." },
];

export function HeroSection() {
  return (
    <section className="relative min-h-[85vh] pt-32 pb-16 overflow-hidden bg-gradient-hero">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: copy */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium"
            >
              🇧🇷 Feito no Brasil · Suporte em português
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 text-4xl sm:text-5xl lg:text-[3rem] xl:text-[3.5rem] leading-[1.1] font-bold tracking-tight text-balance"
            >
              Seu assistente pessoal de IA, sempre disponível na{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">palma de sua mão.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 text-balance"
            >
              O Mika entrega um agente de IA próprio que aprende com você, gerencia sua agenda,
              seus e-mails e suas tarefas — tudo em português e conversando direto no Telegram.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
            >
              <Button asChild size="lg" className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98] shadow-glow">
                <Link to="/signup">
                  Começar agora <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-lg">
                <a href="#planos">Ver planos</a>
              </Button>
            </motion.div>
          </div>

          {/* Right: Telegram mockup */}
          <TelegramMockup />
        </div>
      </div>
    </section>
  );
}

function TelegramMockup() {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.3, delayChildren: 0.4 } },
      }}
      className="relative mx-auto w-full max-w-md"
      aria-label="Demonstração de conversa no Telegram com o agente Mika"
    >
      <div className="absolute -inset-6 bg-gradient-primary opacity-20 blur-3xl rounded-full" aria-hidden />
      <div className="relative bg-card border border-border rounded-2xl shadow-soft overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white/20 grid place-items-center font-bold">M</div>
          <div className="flex-1">
            <p className="font-semibold leading-tight">Mika</p>
            <p className="text-xs text-white/80">online · seu agente pessoal</p>
          </div>
        </div>
        {/* Messages */}
        <div className="p-4 space-y-3 bg-muted/30 min-h-[420px]">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
              className={m.who === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.who === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-sm bg-primary text-primary-foreground"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-card border border-border text-foreground"
                }
              >
                <p>{m.text}</p>
                {m.bullets && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {m.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          ))}
        </div>
        {/* Input */}
        <div className="border-t border-border p-3 flex items-center gap-2 bg-card">
          <div className="flex-1 h-9 rounded-full bg-muted/60 px-3 grid items-center text-xs text-muted-foreground">
            Mensagem…
          </div>
          <div className="h-9 w-9 rounded-full bg-primary grid place-items-center text-primary-foreground">
            <Send className="h-4 w-4" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
