// create-managed-bot
// Recebe { agent_instance_id?, agent_name } do usuário autenticado.
// Gera username sugerido, marca o agent_instance como managed_bot_pending
// e retorna a URL de deep-link para o @mika_managerbot criar o bot em 1 toque.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateUsername(name: string): string {
  const base = (name || "mika")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, "") // só letras e números
    .substring(0, 28);
  const safe = base.length >= 3 ? base : `mika${base}`;
  return `${safe.substring(0, 28)}bot`;
}

async function usernameAvailable(
  admin: ReturnType<typeof createClient>,
  username: string,
): Promise<boolean> {
  const { data } = await admin
    .from("agent_instances")
    .select("id")
    .or(`telegram_bot_username.eq.${username},managed_bot_suggested_username.eq.${username}`)
    .limit(1)
    .maybeSingle();
  return !data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const managerUsername =
      Deno.env.get("TELEGRAM_MANAGER_BOT_USERNAME") || "mika_managerbot";

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const agentName = (body?.agent_name ?? "").toString().trim();
    const explicitAgentId = (body?.agent_instance_id ?? "").toString().trim();

    if (!agentName || agentName.length < 2) {
      return jsonResponse({ error: "Nome do agente inválido." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Localiza agent_instance do usuário
    const query = admin
      .from("agent_instances")
      .select("id, user_id, agent_name, managed_bot_suggested_username")
      .eq("user_id", userId);
    const { data: agent, error: agentErr } = explicitAgentId
      ? await query.eq("id", explicitAgentId).maybeSingle()
      : await query.maybeSingle();

    if (agentErr) {
      console.error("agent lookup error", agentErr);
      return jsonResponse({ error: "Falha ao localizar agente." }, 500);
    }
    if (!agent) {
      return jsonResponse(
        { error: "Agente não encontrado. Aguarde o provisionamento." },
        404,
      );
    }

    // Gera username único (até 5 tentativas com sufixo numérico)
    let suggestedUsername = generateUsername(agentName);
    let attempts = 0;
    while (attempts < 5 && !(await usernameAvailable(admin, suggestedUsername))) {
      attempts++;
      const suffix = Math.floor(Math.random() * 9000 + 1000);
      const baseNoBot = suggestedUsername.replace(/bot$/, "");
      suggestedUsername = `${baseNoBot.substring(0, 24)}${suffix}bot`;
    }

    // Persiste estado pendente
    const { error: updErr } = await admin
      .from("agent_instances")
      .update({
        managed_bot_pending: true,
        managed_bot_suggested_username: suggestedUsername,
        agent_name: agent.agent_name || agentName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (updErr) {
      console.error("agent update error", updErr);
      return jsonResponse({ error: "Falha ao iniciar criação do bot." }, 500);
    }

    const url =
      `https://t.me/newbot/${managerUsername}/${suggestedUsername}` +
      `?name=${encodeURIComponent(agentName)}`;

    return jsonResponse({
      url,
      suggested_username: suggestedUsername,
      manager_username: managerUsername,
    });
  } catch (err) {
    console.error("create-managed-bot fatal", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
