-- Migrar tabela subscriptions para o formato Paddle
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_customer_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paddle_id
  ON public.subscriptions(paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- Constraint única (user_id, environment) para upsert idempotente do webhook
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_env
  ON public.subscriptions(user_id, environment);

-- Adicionar paddle_customer_id ao profiles (substitui stripe_customer_id conceitualmente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paddle_customer_id text;

-- Função utilitária para checar assinatura ativa
CREATE OR REPLACE FUNCTION public.has_active_subscription(
  user_uuid uuid,
  check_env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

-- Trigger updated_at na subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de eventos de webhook (idempotência) — renomeando conceitualmente para paddle
CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem políticas: apenas service_role acessa