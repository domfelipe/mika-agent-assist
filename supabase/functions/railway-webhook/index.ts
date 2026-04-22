// railway-webhook (público)
// Recebe eventos do Railway (Project Settings → Webhooks) sobre deploys.
// Quando um deployment SUCCESS bate em um railway_service_id que conhecemos,
// marcamos o agent_instance como 'active'.
//
// Payload Railway (resumido):
// { type: "DEPLOY", deployment: { id, status, serviceId, environmentId, ... }, project, ... }
// Status possíveis: BUILDING, DEPLOYING, SUCCESS, FAILED, CRASHED, REMOVED

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RailwayWebhookPayload {
  type?: string;
  deployment?: {
    id?: string;
    status?: string;
    serviceId?: string;
    environmentId?: string;
  };
  // Railway envia variantes; aceitamos serviceId/serviço em vários lugares
  service?: { id?: string };
  status?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let payload: RailwayWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json" });
  }

  const serviceId =
    payload.deployment?.serviceId ?? payload.service?.id ?? null;
  const status = payload.deployment?.status ?? payload.status ?? null;

  if (!serviceId || !status) {
    console.log("railway-webhook: payload sem serviceId/status — ignorando", payload);
    return jsonResponse(200, { ignored: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agent } = await supabase
    .from("agent_instances")
    .select("id, status")
    .eq("railway_service_id", serviceId)
    .maybeSingle();

  if (!agent) {
    console.log(`railway-webhook: serviceId ${serviceId} não corresponde a nenhum agent_instance`);
    return jsonResponse(200, { ignored: true });
  }

  const now = new Date().toISOString();
  const upper = status.toUpperCase();

  if (upper === "SUCCESS") {
    await supabase
      .from("agent_instances")
      .update({
        status: "active",
        provisioned_at: now,
        last_health_check_at: now,
      })
      .eq("id", agent.id);

    await supabase
      .from("provisioning_jobs")
      .update({ status: "completed", completed_at: now })
      .eq("agent_instance_id", agent.id)
      .in("status", ["running", "retrying"]);

    return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "active" });
  }

  if (upper === "FAILED" || upper === "CRASHED") {
    await supabase
      .from("agent_instances")
      .update({ status: "error" })
      .eq("id", agent.id);

    await supabase
      .from("provisioning_jobs")
      .update({
        status: "failed",
        error_message: `Railway deployment ${upper}`,
        completed_at: now,
      })
      .eq("agent_instance_id", agent.id)
      .in("status", ["running", "retrying"]);

    return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "error" });
  }

  // BUILDING / DEPLOYING / outros — apenas log
  return jsonResponse(200, { ok: true, ignored_status: upper });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
