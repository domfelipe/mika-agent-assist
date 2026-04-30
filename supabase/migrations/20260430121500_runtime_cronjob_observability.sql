-- ============================================================================
-- FASE 5 — Observabilidade do runtime de cronjobs
-- ============================================================================

-- A UI e as Edge Functions já usam o estado "auto_paused", mas a migration
-- original ainda não o aceitava no CHECK da coluna status.
ALTER TABLE public.scheduled_jobs
  DROP CONSTRAINT IF EXISTS scheduled_jobs_status_check;

ALTER TABLE public.scheduled_jobs
  ADD CONSTRAINT scheduled_jobs_status_check
  CHECK (status IN ('active', 'paused', 'auto_paused', 'error', 'archived'));

-- Espelha no Supabase o estado operacional retornado pelo runtime do Hermes.
ALTER TABLE public.scheduled_jobs
  ADD COLUMN IF NOT EXISTS runtime_state text
    CHECK (runtime_state IS NULL OR runtime_state IN ('scheduled', 'paused', 'completed', 'error')),
  ADD COLUMN IF NOT EXISTS runtime_last_status text
    CHECK (runtime_last_status IS NULL OR runtime_last_status IN ('ok', 'error')),
  ADD COLUMN IF NOT EXISTS runtime_last_error text,
  ADD COLUMN IF NOT EXISTS runtime_last_delivery_error text,
  ADD COLUMN IF NOT EXISTS runtime_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_agent_runtime_synced_at
  ON public.scheduled_jobs (agent_instance_id, runtime_synced_at DESC NULLS LAST);
