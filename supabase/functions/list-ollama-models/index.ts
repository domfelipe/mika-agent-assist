import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  DEFAULT_OLLAMA_MODEL,
  normalizeOllamaModelSelection,
} from "../_shared/hermes-config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OLLAMA_API_KEY = Deno.env.get("OLLAMA_API_KEY");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface OllamaTagModel {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "missing authorization" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "invalid token" }, 401);
    }

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return jsonResponse({ error: "admin role required" }, 403);
    }

    if (!OLLAMA_API_KEY) {
      return jsonResponse({ error: "OLLAMA_API_KEY not configured" }, 500);
    }

    const res = await fetch("https://ollama.com/api/tags", {
      headers: {
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonResponse(
        {
          error: `ollama tags request failed: ${res.status}`,
          detail: text,
        },
        502,
      );
    }

    const payload = await res.json().catch(() => ({}));
    const models = Array.isArray(payload?.models) ? (payload.models as OllamaTagModel[]) : [];

    const normalized = models
      .map((item) => {
        const raw = item.name || item.model || "";
        const name = normalizeOllamaModelSelection(raw);
        return {
          name,
          raw_name: raw,
          modified_at: item.modified_at ?? null,
          size: item.size ?? null,
          digest: item.digest ?? null,
          details: item.details ?? {},
        };
      })
      .filter((item) => /(?:-cloud|:cloud)$/.test(item.name))
      .sort((a, b) => {
        if (a.name === DEFAULT_OLLAMA_MODEL) return -1;
        if (b.name === DEFAULT_OLLAMA_MODEL) return 1;
        return a.name.localeCompare(b.name);
      });

    return jsonResponse({
      models: normalized,
      default_model: DEFAULT_OLLAMA_MODEL,
      source_endpoint: "https://ollama.com/api/tags",
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unexpected error" },
      500,
    );
  }
});
