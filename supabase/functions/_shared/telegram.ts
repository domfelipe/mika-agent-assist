// Helpers compartilhados das Edge Functions Telegram

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  description?: string;
  error_code?: number;
  result?: T;
  parameters?: { retry_after?: number };
};

export async function telegramApi<T = unknown>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramApiResult<T>> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: !!data.ok,
      status: res.status,
      description: data.description,
      error_code: data.error_code,
      result: data.result,
      parameters: data.parameters,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      description: err instanceof Error ? err.message : String(err),
    };
  }
}

// Resposta padrão para o Telegram que NÃO deve gerar retry
// (tudo que vem do webhook deve responder 200, mesmo em falha interna)
export function telegramAck(): Response {
  return new Response("ok", { status: 200 });
}
