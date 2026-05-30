"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { invokeFunction } from "@/lib/invoke-function";

export interface ScheduledJob {
  id: string;
  user_id: string;
  agent_instance_id: string;
  name: string;
  description: string | null;
  natural_language_input: string;
  cron_expression: string;
  human_readable: string;
  action_prompt: string;
  required_mcp_slugs: string[];
  status: "active" | "paused" | "auto_paused" | "error" | "archived";
  auto_paused_reason: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  runtime_state: "scheduled" | "paused" | "completed" | "error" | null;
  runtime_last_status: "ok" | "error" | null;
  runtime_last_error: string | null;
  runtime_last_delivery_error: string | null;
  runtime_synced_at: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

function normalizeJob(row: unknown): ScheduledJob {
  const r = row as ScheduledJob & { required_mcp_slugs: unknown };
  return {
    ...r,
    required_mcp_slugs: Array.isArray(r.required_mcp_slugs)
      ? (r.required_mcp_slugs as string[])
      : [],
  };
}

export function useCronjobs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cronjobs", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ScheduledJob[]> => {
      const { data, error } = await supabase
        .from("scheduled_jobs")
        .select("*")
        .eq("user_id", user!.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeJob);
    },
  });
}

export function useCronjob(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cronjob", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async (): Promise<ScheduledJob | null> => {
      const { data, error } = await supabase
        .from("scheduled_jobs")
        .select("*")
        .eq("id", id!)
        .eq("user_id", user!.id)
        .neq("status", "archived")
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeJob(data) : null;
    },
  });
}

export function useUserJobsLimits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-jobs-limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_jobs_limits")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        user_id: string;
        plan_slug: string | null;
        current_jobs_count: number | null;
        max_jobs: number | null;
      } | null;
    },
  });
}

export interface CreateJobInput {
  agent_instance_id: string;
  name: string;
  description?: string | null;
  natural_language_input: string;
  cron_expression: string;
  human_readable: string;
  action_prompt: string;
  required_mcp_slugs: string[];
  timezone: string;
  next_run_at: string | null;
}

export function useCreateCronjob() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateJobInput) => {
      const { data, error } = await supabase
        .from("scheduled_jobs")
        .insert({
          user_id: user!.id,
          agent_instance_id: input.agent_instance_id,
          name: input.name,
          description: input.description ?? null,
          natural_language_input: input.natural_language_input,
          cron_expression: input.cron_expression,
          human_readable: input.human_readable,
          action_prompt: input.action_prompt,
          required_mcp_slugs: input.required_mcp_slugs,
          timezone: input.timezone,
          next_run_at: input.next_run_at,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      return normalizeJob(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cronjobs"] });
      qc.invalidateQueries({ queryKey: ["user-jobs-limits"] });
    },
  });
}

export async function markCronjobRuntimeSyncError(id: string, detail: string) {
  const message = detail.slice(0, 2000);
  const { error } = await supabase
    .from("scheduled_jobs")
    .update({
      status: "error",
      auto_paused_reason: "Falha ao sincronizar esta automação com o runtime do agente.",
      runtime_state: "error",
      runtime_last_status: "error",
      runtime_last_error: message,
    })
    .eq("id", id);

  if (error) throw error;
}

export function useUpdateCronjobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const update: { status: "active" | "paused"; auto_paused_reason?: null } = { status };
      if (status === "paused") update.auto_paused_reason = null;
      const { error } = await supabase.from("scheduled_jobs").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cronjobs"] });
      qc.invalidateQueries({ queryKey: ["cronjob"] });
    },
  });
}

export function useDeleteCronjob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cronjobs"] });
      qc.invalidateQueries({ queryKey: ["user-jobs-limits"] });
    },
  });
}
