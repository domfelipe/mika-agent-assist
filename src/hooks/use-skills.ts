"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";

export type Skill = Database["public"]["Tables"]["skills"]["Row"];
export type SkillStatus = "draft" | "testing" | "active" | "disabled" | "archived";

export function useSkills(includeArchived = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["skills", user?.id, includeArchived],
    enabled: !!user,
    queryFn: async (): Promise<Skill[]> => {
      let q = supabase
        .from("skills")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (!includeArchived) {
        q = q.neq("status", "archived");
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Skill[];
    },
  });
}

export function useSkill(skillId: string | undefined) {
  return useQuery({
    queryKey: ["skill", skillId],
    enabled: !!skillId,
    queryFn: async (): Promise<Skill | null> => {
      const { data, error } = await supabase
        .from("skills")
        .select("*")
        .eq("id", skillId!)
        .maybeSingle();
      if (error) throw error;
      return data as Skill | null;
    },
  });
}
