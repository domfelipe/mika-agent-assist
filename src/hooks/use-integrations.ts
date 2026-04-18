"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-profile";

export interface AvailableMcp {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string;
  icon_url: string;
  oauth_authorize_url: string;
  oauth_token_url: string;
  oauth_revoke_url: string | null;
  required_scopes: string[];
  available_in_plans: string[];
  supports_refresh_token: boolean;
  display_order: number;
  is_active: boolean;
}

export interface UserIntegration {
  id: string;
  user_id: string;
  mcp_id: string;
  status: "active" | "expired" | "revoked" | "error";
  connected_account_email: string | null;
  connected_account_name: string | null;
  granted_scopes: string[];
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type IntegrationCardState =
  | { kind: "available"; mcp: AvailableMcp }
  | { kind: "locked"; mcp: AvailableMcp; userPlan: string | null }
  | { kind: "connected"; mcp: AvailableMcp; integration: UserIntegration }
  | { kind: "error"; mcp: AvailableMcp; integration: UserIntegration };

export function useAvailableMcps() {
  return useQuery({
    queryKey: ["available-mcps"],
    queryFn: async (): Promise<AvailableMcp[]> => {
      const { data, error } = await supabase
        .from("available_mcps")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        required_scopes: Array.isArray(row.required_scopes)
          ? (row.required_scopes as string[])
          : [],
        available_in_plans: Array.isArray(row.available_in_plans)
          ? (row.available_in_plans as string[])
          : [],
      })) as AvailableMcp[];
    },
  });
}

export function useUserIntegrations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-integrations", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserIntegration[]> => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select(
          "id, user_id, mcp_id, status, connected_account_email, connected_account_name, granted_scopes, token_expires_at, last_refreshed_at, error_message, created_at, updated_at",
        )
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        granted_scopes: Array.isArray(row.granted_scopes)
          ? (row.granted_scopes as string[])
          : [],
      })) as UserIntegration[];
    },
  });
}

export function useUserIntegrationLimits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-integration-limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_integration_limits")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        user_id: string;
        plan_slug: string | null;
        current_integrations_count: number | null;
        max_integrations: number | null;
      } | null;
    },
  });
}

/**
 * Combina available_mcps + user_integrations + plano em estados de cartão.
 */
export function useIntegrationCards() {
  const mcpsQ = useAvailableMcps();
  const integsQ = useUserIntegrations();
  const subQ = useSubscription();

  const userPlan = subQ.data?.plan_id ?? null;

  // Para checagem de plano usamos a view de limites (que tem plan_slug derivado)
  const limitsQ = useUserIntegrationLimits();
  const planSlug = limitsQ.data?.plan_slug ?? null;

  const isLoading = mcpsQ.isLoading || integsQ.isLoading || limitsQ.isLoading;
  const error = mcpsQ.error ?? integsQ.error ?? limitsQ.error;

  const cards: IntegrationCardState[] = (mcpsQ.data ?? []).map((mcp) => {
    const integ = (integsQ.data ?? []).find((i) => i.mcp_id === mcp.id);
    if (integ) {
      if (integ.status === "active") {
        return { kind: "connected", mcp, integration: integ };
      }
      return { kind: "error", mcp, integration: integ };
    }
    const planAllows = !planSlug || mcp.available_in_plans.length === 0
      ? true
      : mcp.available_in_plans.includes(planSlug);
    if (!planAllows) {
      return { kind: "locked", mcp, userPlan: planSlug };
    }
    return { kind: "available", mcp };
  });

  return {
    cards,
    isLoading,
    error,
    planSlug,
    userPlan,
    limit: limitsQ.data,
  };
}

export function useDependentJobsForMcp(mcpSlug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dependent-jobs", user?.id, mcpSlug],
    enabled: !!user && !!mcpSlug,
    queryFn: async (): Promise<{ id: string; name: string; status: string }[]> => {
      const { data, error } = await supabase
        .from("scheduled_jobs")
        .select("id, name, status, required_mcp_slugs")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .filter((j) => Array.isArray(j.required_mcp_slugs) && (j.required_mcp_slugs as string[]).includes(mcpSlug!))
        .map((j) => ({ id: j.id, name: j.name, status: j.status }));
    },
  });
}
