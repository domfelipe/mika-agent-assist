"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Subscribes to realtime changes on the user's subscription row.
 * When the payments webhook upserts a subscription, the affected
 * queries are invalidated so the UI updates without a page reload.
 *
 * Also surfaces a toast when the subscription transitions into an
 * active state (active/trialing) so the user gets immediate feedback
 * after a successful checkout.
 */
export function useSubscriptionRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    lastStatusRef.current = null;

    const channel = supabase
      .channel(`subscriptions:user:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["subscription", user.id] });
          queryClient.invalidateQueries({ queryKey: ["has-active-subscription", user.id] });
          queryClient.invalidateQueries({ queryKey: ["plan"] });

          const newRow = (payload.new ?? null) as { status?: string } | null;
          const newStatus = newRow?.status ?? null;
          const prevStatus = lastStatusRef.current;

          if (
            newStatus &&
            ACTIVE_STATUSES.has(newStatus) &&
            prevStatus !== newStatus &&
            !(prevStatus && ACTIVE_STATUSES.has(prevStatus))
          ) {
            if (newStatus === "trialing") {
              toast.success("Período de teste ativado!", {
                description: "Aproveite todos os recursos do seu plano.",
              });
            } else {
              toast.success("Assinatura ativada!", {
                description: "Tudo pronto — seu plano já está liberado.",
              });
            }
          }

          lastStatusRef.current = newStatus;
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
