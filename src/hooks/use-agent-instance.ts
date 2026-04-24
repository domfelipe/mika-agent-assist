"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface AgentInstance {
  id: string;
  user_id: string;
  uuid_tenant: string;
  status: string;
  telegram_bot_username: string | null;
  telegram_bot_token_vault_id: string | null;
  telegram_webhook_configured: boolean;
  telegram_token_invalid: boolean;
  telegram_first_message_received_at: string | null;
  telegram_connected_at: string | null;
  telegram_onboarding_completed: boolean;
  created_at: string;
}

export function useAgentInstance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agent-instance", user?.id],
    enabled: !!user,
    refetchInterval: 10000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AgentInstance | null> => {
      const { data, error } = await supabase
        .from("agent_instances")
        .select(
          "id, user_id, uuid_tenant, status, telegram_bot_username, telegram_webhook_configured, telegram_token_invalid, telegram_first_message_received_at, telegram_connected_at, telegram_onboarding_completed, created_at",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as AgentInstance | null;
    },
  });
}
