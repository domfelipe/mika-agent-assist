// railway-webhook (público)
// Recebe eventos do Railway (Project Settings → Webhooks) sobre deploys.
// Quando um deployment SUCCESS bate em um railway_service_id que conhecemos,
// marcamos o agent_instance como 'active'.
//
// Railway envia payloads em formatos variados. Já vimos:
//   { type: "Deployment.deployed", details: { serviceId, status, ... }, resource: {...} }
//   { type: "DEPLOY", status, deployment: { serviceId, status, ... } }
// Aceitamos ambos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_BOT_TOKEN = Deno.env.get("ADMIN_TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");

async function notifyAdmin(message: string): Promise<void> {
  if (!ADMIN_TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${ADMIN_TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
  } catch (e) {
    console.error("notifyAdmin failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(200, { ignored: true, reason: "method not allowed" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    console.log("railway-webhook: invalid json body");
    return jsonResponse(200, { ignored: true, reason: "invalid json" });
  }

  console.log("railway-webhook: payload recebido", JSON.stringify(payload));

  // Extrai serviceId e status de qualquer um dos formatos conhecidos
  const deployment = (payload.deployment ?? {}) as Record<string, unknown>;
  const details = (payload.details ?? {}) as Record<string, unknown>;
  const resource = (payload.resource ?? {}) as Record<string, unknown>;
  const service = (payload.service ?? resource.service ?? {}) as Record<string, unknown>;

  const serviceId =
    (deployment.serviceId as string | undefined) ??
    (details.serviceId as string | undefined) ??
    (service.id as string | undefined) ??
    null;

  const status =
    (deployment.status as string | undefined) ??
    (details.status as string | undefined) ??
    (payload.status as string | undefined) ??
    null;

  if (!serviceId || !status) {
    console.log("railway-webhook: payload sem serviceId/status — ignorando");
    return jsonResponse(200, { ignored: true, reason: "missing serviceId/status" });
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
    return jsonResponse(200, { ignored: true, reason: "unknown serviceId" });
  }

  const now = new Date().toISOString();
  const upper = status.toUpperCase();

  if (upper === "SUCCESS" || upper === "ACTIVE" || upper === "DEPLOYED") {
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
      .in("status", ["running", "retrying", "pending"]);

    console.log(`railway-webhook: agent ${agent.id} marcado como active (status=${upper})`);
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
      .in("status", ["running", "retrying", "pending"]);

    console.log(`railway-webhook: agent ${agent.id} marcado como error (status=${upper})`);
    return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "error" });
  }

  // BUILDING / DEPLOYING / outros — apenas log
  console.log(`railway-webhook: status ${upper} ignorado para agent ${agent.id}`);
  return jsonResponse(200, { ok: true, ignored_status: upper });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
