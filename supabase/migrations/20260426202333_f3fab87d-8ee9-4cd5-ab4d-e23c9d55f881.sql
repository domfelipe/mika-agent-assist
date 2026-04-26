ALTER TABLE public.agent_instances 
  ADD COLUMN IF NOT EXISTS managed_bot_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_bot_suggested_username text;

CREATE INDEX IF NOT EXISTS idx_agent_instances_managed_bot_pending
  ON public.agent_instances (managed_bot_pending)
  WHERE managed_bot_pending = true;