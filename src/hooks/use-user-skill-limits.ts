"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface UserSkillLimits {
  user_id: string;
  plan_slug: string | null;
  max_skills: number | null;
  current_skills_count: number;
}

export function useUserSkillLimits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-limits", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserSkillLimits | null> => {
      const { data, error } = await supabase
        .from("user_skill_limits")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserSkillLimits | null;
    },
  });
}
