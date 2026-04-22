-- =========================================================================
-- Fase 5.1 — Provisionamento Railway
-- =========================================================================

-- 1) Enum de roles + tabela user_roles + has_role()
CREATE TYPE public.app_role AS ENUM ('admin', 'support', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Usuários veem suas próprias roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins veem todas as roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins gerenciam roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) vps_pool — pool de projetos Railway disponíveis para alocar serviços
CREATE TABLE public.vps_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  railway_project_id text,
  railway_environment_id text,
  region text NOT NULL DEFAULT 'us-west',
  capacity_max int NOT NULL DEFAULT 100,
  capacity_current int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vps_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam vps_pool"
  ON public.vps_pool FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vps_pool_updated_at
  BEFORE UPDATE ON public.vps_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial — admin precisa preencher os IDs do Railway
INSERT INTO public.vps_pool (name, railway_project_id, railway_environment_id, region, capacity_max, notes)
VALUES (
  'railway-prod-1',
  'PREENCHER_APOS_CRIAR_NO_RAILWAY',
  'PREENCHER_APOS_CRIAR_NO_RAILWAY',
  'us-west',
  100,
  'Pool inicial. Admin: criar projeto no Railway e atualizar railway_project_id e railway_environment_id via SQL.'
);

-- 3) Acréscimos em agent_instances para Railway
ALTER TABLE public.agent_instances
  ADD COLUMN IF NOT EXISTS railway_service_id text,
  ADD COLUMN IF NOT EXISTS vps_pool_id uuid REFERENCES public.vps_pool(id),
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

-- vps_host e container_name ficam no schema (compat) mas marcamos como deprecated via comment
COMMENT ON COLUMN public.agent_instances.vps_host IS 'DEPRECATED — substituído por vps_pool_id + railway_service_id';
COMMENT ON COLUMN public.agent_instances.container_name IS 'DEPRECATED — substituído por railway_service_id';

-- 4) provisioning_jobs — log/state machine de cada tentativa de provisionamento
CREATE TABLE public.provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_instance_id uuid NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vps_pool_id uuid REFERENCES public.vps_pool(id),
  railway_service_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'retrying', 'completed', 'failed')),
  attempt int NOT NULL DEFAULT 1,
  max_attempts int NOT NULL DEFAULT 5,
  error_message text,
  payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provisioning_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus próprios provisioning jobs"
  ON public.provisioning_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins veem todos os jobs"
  ON public.provisioning_jobs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_provisioning_jobs_agent_status ON public.provisioning_jobs(agent_instance_id, status);
CREATE INDEX idx_provisioning_jobs_retry ON public.provisioning_jobs(status, next_retry_at) WHERE status = 'retrying';

CREATE TRIGGER update_provisioning_jobs_updated_at
  BEFORE UPDATE ON public.provisioning_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Extensão pg_net + trigger automático que dispara provision-agent
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_provision_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
BEGIN
  -- Só dispara em INSERT com status='provisioning' ou em UPDATE que entra nesse status
  IF NEW.status <> 'provisioning' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'provisioning' THEN
    RETURN NEW;
  END IF;

  -- Lê config do projeto via vault (caímos no fallback se não existir)
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  -- Sem config completa, não tenta — admin pode disparar manualmente via /admin
  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RAISE LOG 'trigger_provision_agent: vault.project_url ou vault.anon_key não configurado, pulando';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/provision-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('agent_instance_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_agent_instance_provisioning
  AFTER INSERT OR UPDATE OF status ON public.agent_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_provision_agent();

-- Salvar URL e anon key do projeto no vault para o trigger usar
SELECT vault.create_secret('https://smsarmgoirlcedmqvdgc.supabase.co', 'project_url', 'URL do projeto Supabase usada pelo trigger pg_net');

-- 6) Ajustar policy de service_role poder gravar em agent_instances e provisioning_jobs
-- (as edge functions usam service_role; já bypassam RLS, mas precisamos garantir UPDATE)
CREATE POLICY "Service role gerencia agent_instances"
  ON public.agent_instances FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role gerencia provisioning_jobs"
  ON public.provisioning_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
