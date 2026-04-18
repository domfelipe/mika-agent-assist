-- ============================================================================
-- FASE 4 — Integrações OAuth e Automações
-- ============================================================================

-- 1. Adiciona timezone em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- ============================================================================
-- 2. TABELA: available_mcps (catálogo público)
-- ============================================================================
CREATE TABLE public.available_mcps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  provider text NOT NULL,
  description text NOT NULL,
  icon_url text NOT NULL,
  oauth_authorize_url text NOT NULL,
  oauth_token_url text NOT NULL,
  oauth_revoke_url text,
  required_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_in_plans jsonb NOT NULL DEFAULT '[]'::jsonb,
  supports_refresh_token boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.available_mcps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MCPs disponíveis são públicos para autenticados"
  ON public.available_mcps FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE TRIGGER update_available_mcps_updated_at
  BEFORE UPDATE ON public.available_mcps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. TABELA: user_integrations
-- ============================================================================
CREATE TABLE public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcp_id uuid NOT NULL REFERENCES public.available_mcps(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  -- Tokens estão no Vault. Sem FK porque o schema vault não permite.
  -- Integridade garantida pela aplicação.
  access_token_vault_id uuid,
  refresh_token_vault_id uuid,
  token_expires_at timestamptz,
  connected_account_email text,
  connected_account_name text,
  granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mcp_id)
);

CREATE INDEX idx_user_integrations_user_status
  ON public.user_integrations (user_id, status);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem suas próprias integrações"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE só via service_role (Edge Functions)

CREATE TRIGGER update_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. TABELA: oauth_state_tokens (CSRF)
-- ============================================================================
CREATE TABLE public.oauth_state_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcp_id uuid NOT NULL REFERENCES public.available_mcps(id) ON DELETE CASCADE,
  consumed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_state_lookup
  ON public.oauth_state_tokens (state_token, consumed);

ALTER TABLE public.oauth_state_tokens ENABLE ROW LEVEL SECURITY;
-- Sem policies: só service_role acessa

-- ============================================================================
-- 5. TABELA: scheduled_jobs (automações)
-- ============================================================================
CREATE TABLE public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_instance_id uuid NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR length(description) <= 200),
  cron_expression text NOT NULL,
  human_readable text NOT NULL,
  natural_language_input text NOT NULL,
  action_prompt text NOT NULL CHECK (length(action_prompt) BETWEEN 20 AND 2000),
  required_mcp_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error', 'archived')),
  auto_paused_reason text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_scheduled_jobs_user_status
  ON public.scheduled_jobs (user_id, status);

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem suas próprias automações"
  ON public.scheduled_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam suas próprias automações"
  ON public.scheduled_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam suas próprias automações"
  ON public.scheduled_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários deletam suas próprias automações"
  ON public.scheduled_jobs FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_scheduled_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. VIEW: user_integration_limits
-- ============================================================================
CREATE VIEW public.user_integration_limits
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  pl.slug AS plan_slug,
  CASE pl.slug
    WHEN 'basic'        THEN 2
    WHEN 'starter'      THEN 4
    WHEN 'professional' THEN 8
    WHEN 'enterprise'   THEN 999999
    ELSE NULL
  END AS max_integrations,
  COALESCE((
    SELECT COUNT(*)::int
    FROM public.user_integrations ui
    WHERE ui.user_id = p.id
      AND ui.status IN ('active', 'expired', 'error')
  ), 0) AS current_integrations_count
FROM public.profiles p
LEFT JOIN public.subscriptions s
  ON s.user_id = p.id
  AND s.status IN ('active', 'trialing')
  AND (s.current_period_end IS NULL OR s.current_period_end > now())
LEFT JOIN public.plans pl ON pl.id = s.plan_id;

-- ============================================================================
-- 7. VIEW: user_jobs_limits
-- ============================================================================
CREATE VIEW public.user_jobs_limits
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  pl.slug AS plan_slug,
  CASE pl.slug
    WHEN 'basic'        THEN 0
    WHEN 'starter'      THEN 5
    WHEN 'professional' THEN 25
    WHEN 'enterprise'   THEN 999999
    ELSE NULL
  END AS max_jobs,
  COALESCE((
    SELECT COUNT(*)::int
    FROM public.scheduled_jobs sj
    WHERE sj.user_id = p.id
      AND sj.status != 'archived'
  ), 0) AS current_jobs_count
FROM public.profiles p
LEFT JOIN public.subscriptions s
  ON s.user_id = p.id
  AND s.status IN ('active', 'trialing')
  AND (s.current_period_end IS NULL OR s.current_period_end > now())
LEFT JOIN public.plans pl ON pl.id = s.plan_id;

-- ============================================================================
-- 8. TRIGGER: enforce_integration_limit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_integration_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_count int;
  v_plan_slug text;
  v_mcp_slug text;
  v_available_in jsonb;
  v_agent_active boolean;
BEGIN
  -- 1. Agente ativo?
  SELECT EXISTS (
    SELECT 1 FROM public.agent_instances ai
    WHERE ai.user_id = NEW.user_id
      AND ai.status = 'active'
  ) INTO v_agent_active;

  IF NOT v_agent_active THEN
    RAISE EXCEPTION 'Agente não está ativo. Complete o onboarding primeiro.'
      USING ERRCODE = 'P0005';
  END IF;

  -- 2. Limites de plano
  SELECT max_integrations, current_integrations_count, plan_slug
    INTO v_max, v_count, v_plan_slug
  FROM public.user_integration_limits
  WHERE user_id = NEW.user_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Sem assinatura ativa para conectar integrações'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. MCP disponível no plano?
  SELECT slug, available_in_plans
    INTO v_mcp_slug, v_available_in
  FROM public.available_mcps
  WHERE id = NEW.mcp_id;

  IF NOT (v_available_in ? v_plan_slug) THEN
    RAISE EXCEPTION 'A integração % não está disponível no plano %', v_mcp_slug, v_plan_slug
      USING ERRCODE = 'P0003';
  END IF;

  -- 4. Limite atingido? (só conta novos, não updates)
  IF TG_OP = 'INSERT' AND v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de % integrações atingido para o plano %', v_max, v_plan_slug
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_integration_limit_trigger
  BEFORE INSERT ON public.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_integration_limit();

-- ============================================================================
-- 9. TRIGGER: enforce_job_limit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_job_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_count int;
  v_plan_slug text;
  v_agent_active boolean;
BEGIN
  -- 1. Agente ativo?
  SELECT EXISTS (
    SELECT 1 FROM public.agent_instances ai
    WHERE ai.user_id = NEW.user_id
      AND ai.status = 'active'
  ) INTO v_agent_active;

  IF NOT v_agent_active THEN
    RAISE EXCEPTION 'Agente não está ativo. Complete o onboarding primeiro.'
      USING ERRCODE = 'P0005';
  END IF;

  -- 2. Limites de plano
  SELECT max_jobs, current_jobs_count, plan_slug
    INTO v_max, v_count, v_plan_slug
  FROM public.user_jobs_limits
  WHERE user_id = NEW.user_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Sem assinatura ativa para criar automações'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Plano não permite automações
  IF v_max = 0 THEN
    RAISE EXCEPTION 'O plano % não permite automações. Faça upgrade para Starter.', v_plan_slug
      USING ERRCODE = 'P0004';
  END IF;

  -- 4. Limite atingido
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de % automações atingido para o plano %', v_max, v_plan_slug
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_job_limit_trigger
  BEFORE INSERT ON public.scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_limit();

-- ============================================================================
-- 10. TRIGGER: cleanup_expired_oauth_states (FOR EACH STATEMENT, barato)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.oauth_state_tokens
  WHERE expires_at < (now() - interval '1 day');
  RETURN NULL;
END;
$$;

CREATE TRIGGER cleanup_expired_oauth_states_trigger
  AFTER INSERT ON public.oauth_state_tokens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_oauth_states();

-- ============================================================================
-- 11. SEED: 5 MCPs disponíveis
-- ============================================================================
INSERT INTO public.available_mcps
  (slug, name, provider, description, icon_url, oauth_authorize_url, oauth_token_url, oauth_revoke_url,
   required_scopes, available_in_plans, supports_refresh_token, display_order)
VALUES
  (
    'google_workspace',
    'Google Workspace',
    'google',
    'Conecte Gmail, Calendar e Drive para que o Mika possa ler emails, criar eventos e acessar arquivos.',
    'https://cdn.simpleicons.org/google',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    'https://oauth2.googleapis.com/revoke',
    '["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]'::jsonb,
    '["basic", "starter", "professional", "enterprise"]'::jsonb,
    true,
    1
  ),
  (
    'notion',
    'Notion',
    'notion',
    'Acesse páginas e bancos de dados do Notion para que o Mika possa criar, editar e consultar suas anotações.',
    'https://cdn.simpleicons.org/notion',
    'https://api.notion.com/v1/oauth/authorize',
    'https://api.notion.com/v1/oauth/token',
    NULL,
    '["read_content", "update_content", "insert_content"]'::jsonb,
    '["basic", "starter", "professional", "enterprise"]'::jsonb,
    false,
    2
  ),
  (
    'todoist',
    'Todoist',
    'todoist',
    'Gerencie suas tarefas no Todoist — peça ao Mika para criar lembretes, listar tarefas do dia e marcar como concluído.',
    'https://cdn.simpleicons.org/todoist',
    'https://todoist.com/oauth/authorize',
    'https://todoist.com/oauth/access_token',
    'https://api.todoist.com/sync/v9/access_tokens/revoke',
    '["data:read_write"]'::jsonb,
    '["starter", "professional", "enterprise"]'::jsonb,
    false,
    3
  ),
  (
    'calcom',
    'Cal.com',
    'calcom',
    'Conecte sua agenda do Cal.com para que o Mika consulte horários disponíveis e crie reuniões automaticamente.',
    'https://cdn.simpleicons.org/caldotcom',
    'https://app.cal.com/auth/oauth2/authorize',
    'https://api.cal.com/v2/oauth/token',
    'https://api.cal.com/v2/oauth/revoke',
    '["READ_BOOKING", "WRITE_BOOKING"]'::jsonb,
    '["starter", "professional", "enterprise"]'::jsonb,
    true,
    4
  ),
  (
    'microsoft_365',
    'Microsoft 365',
    'microsoft',
    'Acesse Outlook, Calendar e OneDrive corporativos. Ideal para times que usam Microsoft 365 no trabalho.',
    'https://cdn.simpleicons.org/microsoftoffice',
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    'https://login.microsoftonline.com/common/oauth2/logout',
    '["offline_access", "Mail.ReadWrite", "Calendars.ReadWrite", "Files.ReadWrite", "User.Read"]'::jsonb,
    '["professional", "enterprise"]'::jsonb,
    true,
    5
  );