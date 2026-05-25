// admin-runtime-inspect
// Endpoint admin para inspecionar o estado bruto do runtime Hermes de um agente.
// Faz GET autenticado (Bearer HERMES_API_SERVER_KEY) em uma lista de paths conhecidos
// e devolve as respostas para diagnóstico (cronjobs, plugins, integrations, health).
//
// Uso (admin-only):
//   POST { agent_instance_id: string, paths?: string[] }
//
// Default paths: /api/health, /api/cronjobs, /api/integrations, /api/plugins

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveRuntimeTarget } from "../_shared/runtime-sync.ts";

const DEFAULT_PATHS = [
  "/api/health",
  "/api/cronjobs",
  "/api/integrations",
  "/api/plugins",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchRuntimePath(opts: {
  publicUrl: string;
  apiKey: string;
  path: string;
}): Promise<{ path: string; status: number; ok: boolean; body: unknown }> {
  const url = `${opts.publicUrl.replace(/\/$/, "")}${opts.path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // mantém texto cru
    }
    return { path: opts.path, status: res.status, ok: res.ok, body };
  } catch (err) {
    return {
      path: opts.path,
      status: 0,
      ok: false,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const railwayToken = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
    const hermesKey = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

    if (!railwayToken) return jsonResponse({ error: "RAILWAY_API_TOKEN not configured" }, 500);
    if (!hermesKey) return jsonResponse({ error: "HERMES_API_SERVER_KEY not configured" }, 500);

    // 1) Autenticação: JWT do usuário e checa role admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse({ error: "Admin requerido" }, 403);
    }

    // 2) Body
    const body = await req.json().catch(() => ({})) as {
      agent_instance_id?: string;
      paths?: string[];
    };
    if (!body.agent_instance_id) {
      return jsonResponse({ error: "agent_instance_id é obrigatório" }, 400);
    }
    const paths = Array.isArray(body.paths) && body.paths.length > 0
      ? body.paths.filter((p) => typeof p === "string" && p.startsWith("/"))
      : DEFAULT_PATHS;

    // 3) Resolve target Railway
    let target;
    try {
      target = await resolveRuntimeTarget({
        supabase: admin,
        agentInstanceId: body.agent_instance_id,
        railwayToken,
      });
    } catch (err) {
      return jsonResponse(
        {
          error: "Falha ao resolver runtime target",
          detail: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    // 4) Faz GET em cada path em paralelo
    const results = await Promise.all(
      paths.map((p) =>
        fetchRuntimePath({
          publicUrl: target.publicUrl,
          apiKey: hermesKey,
          path: p,
        })
      ),
    );

    return jsonResponse({
      agent_instance_id: body.agent_instance_id,
      public_url: target.publicUrl,
      public_domain: target.publicDomain,
      service_id: target.serviceId,
      results,
    });
  } catch (err) {
    console.error("admin-runtime-inspect fatal", err instanceof Error ? err.message : "unknown");
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
