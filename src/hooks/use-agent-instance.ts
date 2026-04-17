"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface AgentInstance {
  id: string;
  user_id: string;
  status: string;
  telegram_bot_username: string | null;
  created_at: string;
}

export function useAgentInstance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agent-instance", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AgentInstance | null> => {
      const { data, error } = await supabase
        .from("agent_instances")
        .select("id, user_id, status, telegram_bot_username, created_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
