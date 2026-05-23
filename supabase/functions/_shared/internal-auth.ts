// internal-auth.ts
// Helper compartilhado para validar chamadas internas a edge functions.
// Permite que uma function aceite:
//  - X-Internal-Secret válido (chamadas server-to-server, triggers pg_net, cron)
//  - JWT de admin (painel admin via supabase.functions.invoke)
//  - opcionalmente, JWT do dono do recurso (ownerUserId)
//
// Modo de operação:
//  - Se INTERNAL_FUNCTION_SECRET estiver definido E o header X-Internal-Secret bater → OK
//  - Senão, tenta validar o JWT do Authorization header
//  - Retorna { ok, userId, isAdmin, isOwner, reason }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface InternalAuthResult {
  ok: boolean;
  userId: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  viaSecret: boolean;
  reason?: string;
}

export interface AuthorizeInternalOptions {
  /** Se fornecido, valida ownership contra esse user_id. */
  ownerUserId?: string | null;
  /** Se true (default), permite admins. */
  allowAdmin?: boolean;
  /** Se true (default), permite o dono. */
  allowOwner?: boolean;
  /** Se true (default), permite via X-Internal-Secret. */
  allowSecret?: boolean;
}

export async function authorizeInternalRequest(
  req: Request,
  opts: AuthorizeInternalOptions = {},
): Promise<InternalAuthResult> {
  const {
    ownerUserId = null,
    allowAdmin = true,
    allowOwner = true,
    allowSecret = true,
  } = opts;

  // 1) X-Internal-Secret
  if (allowSecret) {
    const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
    const received = req.headers.get("x-internal-secret") ?? "";
    if (expected && received && constantTimeEq(expected, received)) {
      return {
        ok: true,
        userId: null,
        isAdmin: false,
        isOwner: false,
        viaSecret: true,
      };
    }
  }

  // 2) JWT
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      userId: null,
      isAdmin: false,
      isOwner: false,
      viaSecret: false,
      reason: "missing bearer token",
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      ok: false,
      userId: null,
      isAdmin: false,
      isOwner: false,
      viaSecret: false,
      reason: "invalid jwt",
    };
  }
  const userId = userData.user.id;

  let isAdmin = false;
  if (allowAdmin) {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleOk } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    isAdmin = roleOk === true;
  }

  const isOwner = allowOwner && ownerUserId !== null && userId === ownerUserId;

  if (isAdmin || isOwner) {
    return { ok: true, userId, isAdmin, isOwner, viaSecret: false };
  }

  return {
    ok: false,
    userId,
    isAdmin,
    isOwner,
    viaSecret: false,
    reason: "forbidden",
  };
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
