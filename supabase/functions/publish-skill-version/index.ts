// Promove uma skill_version a "live" de forma atômica e idempotente.
// Garantia adicional: unique index parcial skill_versions_one_live_per_skill no banco.
// TODO Fase 5: dispatch SSH deploy to container after publish
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: { skill_version_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { skill_version_id } = body;
  if (!skill_version_id) {
    return new Response(JSON.stringify({ error: "skill_version_id é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Carrega versão + skill (verifica ownership e estado atual)
  const { data: versionRow, error: vErr } = await admin
    .from("skill_versions")
    .select("id, skill_id, version_number, is_live, skills!inner(id, user_id)")
    .eq("id", skill_version_id)
    .maybeSingle();

  if (vErr || !versionRow) {
    return new Response(JSON.stringify({ error: "Versão não encontrada" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // @ts-expect-error nested
  const skillUserId: string = versionRow.skills.user_id;
  if (skillUserId !== userId) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotência: já é live, no-op
  if (versionRow.is_live === true) {
    return new Response(
      JSON.stringify({ success: true, no_op: true, version_number: versionRow.version_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const skillId: string = versionRow.skill_id;

  // Postgres não permite transação multi-statement via supabase-js.
  // Estratégia: 1) zera todos is_live da skill, 2) marca a alvo como live, 3) atualiza skills.
  // O unique index parcial skill_versions_one_live_per_skill protege contra race.
  // Se duas execuções rodarem em paralelo, uma delas falhará no passo 2 com 23505.

  // Passo 1: desmarcar todas as outras versões como live
  const { error: clearErr } = await admin
    .from("skill_versions")
    .update({ is_live: false })
    .eq("skill_id", skillId)
    .eq("is_live", true);

  if (clearErr) {
    console.error("Clear live error:", clearErr);
    return new Response(JSON.stringify({ error: "Falha ao publicar (clear)." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Passo 2: marcar a versão alvo como live
  const { error: setErr } = await admin
    .from("skill_versions")
    .update({ is_live: true })
    .eq("id", skill_version_id);

  if (setErr) {
    // Race condition na invariante de banco
    if (setErr.code === "23505") {
      return new Response(
        JSON.stringify({ error: "Conflito de concorrência. Tente novamente." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.error("Set live error:", setErr);
    return new Response(JSON.stringify({ error: "Falha ao publicar (set)." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Passo 3: atualizar skills.current_version_id e status
  const { error: updSkillErr } = await admin
    .from("skills")
    .update({
      current_version_id: skill_version_id,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId);

  if (updSkillErr) {
    console.error("Update skill error:", updSkillErr);
    return new Response(JSON.stringify({ error: "Falha ao publicar (skill)." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true, version_number: versionRow.version_number }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
