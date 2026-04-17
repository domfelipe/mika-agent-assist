"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Subscribes to realtime changes on the user's subscription row.
 * When the payments webhook upserts a subscription, the affected
 * queries are invalidated so the UI updates without a page reload.
 */
export function useSubscriptionRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

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
        () => {
          queryClient.invalidateQueries({ queryKey: ["subscription", user.id] });
          queryClient.invalidateQueries({ queryKey: ["has-active-subscription", user.id] });
          queryClient.invalidateQueries({ queryKey: ["plan"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
