-- ============================================================
-- FASE 3 — Telegram onboarding: schema
-- ============================================================

-- 1) Novas colunas em agent_instances --------------------------
ALTER TABLE public.agent_instances
  ADD COLUMN IF NOT EXISTS telegram_webhook_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_webhook_secret text,
  ADD COLUMN IF NOT EXISTS telegram_token_invalid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_first_message_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_onboarding_completed boolean NOT NULL DEFAULT false;

-- Índice parcial em username (busca rápida e garante 1 bot por conta)
CREATE INDEX IF NOT EXISTS agent_instances_telegram_username_idx
  ON public.agent_instances (telegram_bot_username)
  WHERE telegram_bot_username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_instances_telegram_username_unique
  ON public.agent_instances (telegram_bot_username)
  WHERE telegram_bot_username IS NOT NULL;

-- 2) Tabela telegram_messages_log ------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_messages_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id uuid NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  telegram_chat_id bigint NOT NULL,
  telegram_user_id bigint,
  telegram_username text,
  direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  message_text text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','command','other')),
  is_first_message boolean NOT NULL DEFAULT false,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_messages_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem o próprio log de mensagens"
  ON public.telegram_messages_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Sem policies de INSERT/UPDATE/DELETE: somente service_role (Edge Function)

CREATE INDEX IF NOT EXISTS telegram_messages_log_agent_idx
  ON public.telegram_messages_log (agent_instance_id);

CREATE INDEX IF NOT EXISTS telegram_messages_log_user_idx
  ON public.telegram_messages_log (user_id);

CREATE INDEX IF NOT EXISTS telegram_messages_log_created_idx
  ON public.telegram_messages_log (created_at DESC);

CREATE INDEX IF NOT EXISTS telegram_messages_log_first_message_idx
  ON public.telegram_messages_log (agent_instance_id)
  WHERE is_first_message = true;

CREATE INDEX IF NOT EXISTS telegram_messages_log_agent_direction_idx
  ON public.telegram_messages_log (agent_instance_id, direction, created_at DESC);

-- 3) Tabela telegram_rate_limit_bucket -------------------------
CREATE TABLE IF NOT EXISTS public.telegram_rate_limit_bucket (
  agent_instance_id uuid PRIMARY KEY REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_rate_limit_bucket ENABLE ROW LEVEL SECURITY;
-- Sem policies: somente service_role

-- 4) Realtime --------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_messages_log;