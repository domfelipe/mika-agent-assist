"use client";

import { supabase } from "@/integrations/supabase/client";

interface InvokeResult<T> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

/**
 * Wrapper para supabase.functions.invoke que normaliza erros de função
 * (FunctionsHttpError vem com Response no .context que precisa ser lido).
 */
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, {
      body: body ?? {},
    });

    if (error) {
      // Tenta extrair mensagem do response real
      let msg = error.message ?? "Erro inesperado";
      let status: number | undefined;
      // deno-lint-ignore no-explicit-any
      const ctx = (error as any).context as Response | undefined;
      if (ctx && typeof ctx.json === "function") {
        try {
          status = ctx.status;
          const parsed = await ctx.json();
          if (parsed?.error) msg = parsed.error;
        } catch {
          // ignora
        }
      }
      return { data: null, error: { message: msg, status } };
    }

    return { data: (data ?? null) as T | null, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : "Erro inesperado",
      },
    };
  }
}
