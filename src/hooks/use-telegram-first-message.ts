"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FirstMessage {
  id: string;
  created_at: string;
  message_text: string | null;
  message_type: string;
}

/**
 * Aguarda a primeira mensagem incoming do Telegram para o agent_instance dado.
 * - Subscribe via Realtime com filter explícito.
 * - Fallback de polling a cada 5s caso o Realtime não conecte em 10s.
 * - Considera apenas mensagens com created_at >= since (telegram_connected_at).
 */
export function useTelegramFirstMessage(opts: {
  agentInstanceId: string | null | undefined;
  since: string | null | undefined;
  enabled: boolean;
}): { received: FirstMessage | null; reset: () => void } {
  const { agentInstanceId, since, enabled } = opts;
  const [received, setReceived] = useState<FirstMessage | null>(null);
  const realtimeConnected = useRef(false);
  const pollingRef = useRef<number | null>(null);

  function reset() {
    setReceived(null);
  }

  useEffect(() => {
    if (!enabled || !agentInstanceId) return;

    let cancelled = false;
    realtimeConnected.current = false;

    const channel = supabase
      .channel(`telegram-messages-${agentInstanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telegram_messages_log",
          filter: `agent_instance_id=eq.${agentInstanceId}`,
        },
        (payload) => {
          // deno-lint-ignore no-explicit-any
          const row = payload.new as any;
          if (row?.direction !== "incoming") return;
          if (since && new Date(row.created_at) < new Date(since)) return;
          if (cancelled) return;
          setReceived({
            id: row.id,
            created_at: row.created_at,
            message_text: row.message_text ?? null,
            message_type: row.message_type ?? "text",
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeConnected.current = true;
        }
      });

    // Fallback de polling: começa em 10s caso Realtime ainda não tenha conectado
    const fallbackTimer = window.setTimeout(() => {
      if (realtimeConnected.current || cancelled) return;
      pollingRef.current = window.setInterval(async () => {
        if (cancelled) return;
        let q = supabase
          .from("telegram_messages_log")
          .select("id, created_at, message_text, message_type, direction")
          .eq("agent_instance_id", agentInstanceId)
          .eq("direction", "incoming")
          .order("created_at", { ascending: false })
          .limit(1);
        if (since) q = q.gte("created_at", since);
        const { data } = await q.maybeSingle();
        if (data && !cancelled) {
          setReceived({
            id: data.id as string,
            created_at: data.created_at as string,
            message_text: (data.message_text as string | null) ?? null,
            message_type: (data.message_type as string) ?? "text",
          });
        }
      }, 5000);
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      supabase.removeChannel(channel);
    };
  }, [agentInstanceId, since, enabled]);

  return { received, reset };
}
