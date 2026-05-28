// bootstrap-internal-secret
// Função one-shot: lê INTERNAL_FUNCTION_SECRET de env e persiste em vault como
// 'internal_function_secret', para que triggers pg_net e cron job possam ler e
// enviar como X-Internal-Secret nas chamadas a outras edge functions.
//
// Requer JWT de admin. Idempotente — pode ser chamada várias vezes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secretValue = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  if (!secretValue) {
    return json(500, { error: "INTERNAL_FUNCTION_SECRET not set in env" });
  }

  // Validar admin via JWT
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing bearer token" });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "invalid jwt" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleOk } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!roleOk) return json(403, { error: "admin role required" });

  // Upsert no vault. Como vault.create_secret falha em nomes duplicados,
  // tentamos atualizar existente primeiro via SQL direto.
  try {
    // 1) Tenta achar entry existente
    const { data: existingData } = await admin
      .from("vault.decrypted_secrets" as never)
      .select("id, decrypted_secret")
      .eq("name", "internal_function_secret")
      .maybeSingle();
    const existing = existingData as { id: string; decrypted_secret: string } | null;

    if (existing && existing.decrypted_secret === secretValue) {
      return json(200, { ok: true, action: "already_synced" });
    }

    if (existing) {
      // Atualiza o valor via RPC dedicada (não temos UPDATE direto em vault.secrets via PostgREST,
      // então deletamos e recriamos).
      await admin.rpc("vault_delete_secret", { secret_id: existing.id });
    }

    const { data: created, error: createErr } = await admin
      .rpc("vault_create_secret", {
        secret_value: secretValue,
        secret_name: "internal_function_secret",
        secret_description: "Shared secret for trigger pg_net → edge functions auth",
      })
      .single();

    if (createErr) {
      console.error("vault_create_secret failed:", createErr);
      return json(500, { error: "vault create failed", detail: createErr.message });
    }

    return json(200, {
      ok: true,
      action: existing ? "rotated" : "created",
      // deno-lint-ignore no-explicit-any
      secret_id: (created as any)?.secret_id ?? created,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bootstrap-internal-secret fatal:", msg);
    return json(500, { error: msg });
  }
});
