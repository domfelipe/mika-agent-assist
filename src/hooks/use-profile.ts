"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { getPaddleEnv } from "@/lib/paddle";

export interface Profile {
  id: string;
  full_name: string;
  company_name: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  paddle_customer_id: string | null;
  onboarding_completed: boolean;
  timezone: string;
}

export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  product_id: string | null;
  price_id: string | null;
  environment: "sandbox" | "live";
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" | "paused";
  billing_cycle: "monthly" | "yearly";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export function useSubscription() {
  const { user } = useAuth();
  const env = getPaddleEnv();

  return useQuery({
    queryKey: ["subscription", user?.id, env],
    enabled: !!user,
    queryFn: async (): Promise<SubscriptionRow | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SubscriptionRow | null;
    },
  });
}
