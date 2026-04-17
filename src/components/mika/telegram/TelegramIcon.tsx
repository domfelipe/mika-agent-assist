"use client";

import { Send } from "lucide-react";

interface Props {
  className?: string;
}

/** Ícone do Telegram (paper plane) — usa apenas tokens, herda cor via currentColor. */
export function TelegramIcon({ className }: Props) {
  return <Send className={className} aria-hidden="true" />;
}
