ALTER TABLE public.agent_instances
  ADD COLUMN IF NOT EXISTS model_config jsonb NOT NULL DEFAULT '{}'::jsonb;