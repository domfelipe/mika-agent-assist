-- ============================================================
-- FASE 2: Skill Studio — Schema completo
-- ============================================================

-- ------------------------------------------------------------
-- 1) agent_instances: garantir unicidade por user_id e popular retroativamente
-- ------------------------------------------------------------

-- Garante que cada usuário tem no máximo 1 agente (necessário para ON CONFLICT no webhook)
CREATE UNIQUE INDEX IF NOT EXISTS agent_instances_user_id_key
  ON public.agent_instances(user_id);

-- Migração retroativa: cria agent_instance 'active' para quem já tem subscription ativa/trial
INSERT INTO public.agent_instances (user_id, status, created_at, updated_at)
SELECT
  s.user_id,
  'active' AS status,
  now(),
  now()
FROM public.subscriptions s
WHERE s.status IN ('active', 'trialing')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_instances ai WHERE ai.user_id = s.user_id
  );

-- ------------------------------------------------------------
-- 2) Tabela: skills
-- ------------------------------------------------------------
CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_instance_id uuid NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  trigger_keywords text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'testing', 'active', 'disabled', 'archived')),
  current_version_id uuid, -- SEM FK por design (ver comment)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.skills.current_version_id IS
  'Aponta para skill_versions(id). Sem FK constraint para evitar dependência circular com skill_versions (que referencia skills.id). A integridade é garantida pela aplicação e pela edge function publish-skill-version.';

CREATE INDEX idx_skills_user_id ON public.skills(user_id);
CREATE INDEX idx_skills_agent_instance_id ON public.skills(agent_instance_id);
CREATE INDEX idx_skills_status ON public.skills(status);

-- Invariante: nome único por usuário entre não-arquivadas
CREATE UNIQUE INDEX skills_unique_name_per_user
  ON public.skills(user_id, name)
  WHERE status != 'archived';

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem suas próprias skills"
  ON public.skills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam suas próprias skills"
  ON public.skills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários atualizam suas próprias skills"
  ON public.skills FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários deletam suas próprias skills"
  ON public.skills FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER trg_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 3) Tabela: skill_versions
-- ------------------------------------------------------------
CREATE TABLE public.skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  markdown_content text NOT NULL CHECK (length(markdown_content) <= 50000),
  form_inputs jsonb NOT NULL,
  is_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  UNIQUE (skill_id, version_number)
);

COMMENT ON COLUMN public.skill_versions.form_inputs IS
  'Snapshot dos campos do formulário usados para gerar esta versão. Schema esperado: { name: string, description: string, trigger_keywords: string, expected_inputs: string|null, steps: string, required_tools: string[], success_criteria: string, example_use_case: string|null }';

CREATE INDEX idx_skill_versions_skill_id ON public.skill_versions(skill_id);
CREATE INDEX idx_skill_versions_is_live ON public.skill_versions(skill_id) WHERE is_live = true;

-- INVARIANTE CRÍTICA: apenas 1 versão live por skill (garantido no banco)
CREATE UNIQUE INDEX skill_versions_one_live_per_skill
  ON public.skill_versions(skill_id)
  WHERE is_live = true;

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem versões das próprias skills"
  ON public.skill_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.skills s WHERE s.id = skill_versions.skill_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Usuários criam versões das próprias skills"
  ON public.skill_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.skills s WHERE s.id = skill_versions.skill_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Usuários atualizam versões das próprias skills"
  ON public.skill_versions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.skills s WHERE s.id = skill_versions.skill_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Usuários deletam versões das próprias skills"
  ON public.skill_versions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.skills s WHERE s.id = skill_versions.skill_id AND s.user_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 4) Tabela: skill_test_runs
-- ------------------------------------------------------------
CREATE TABLE public.skill_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_version_id uuid NOT NULL REFERENCES public.skill_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_input text NOT NULL,
  test_output text,
  status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  error_message text,
  duration_ms int,
  test_type text NOT NULL DEFAULT 'dry_run' CHECK (test_type IN ('dry_run', 'real')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_test_runs_skill_version_id ON public.skill_test_runs(skill_version_id);
CREATE INDEX idx_skill_test_runs_user_id ON public.skill_test_runs(user_id);

ALTER TABLE public.skill_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem seus próprios test runs"
  ON public.skill_test_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários criam seus próprios test runs"
  ON public.skill_test_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) View: user_skill_limits
-- ------------------------------------------------------------
CREATE VIEW public.user_skill_limits
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  pl.slug AS plan_slug,
  CASE
    WHEN pl.slug IS NULL THEN NULL
    WHEN pl.slug = 'basic' THEN 5
    WHEN pl.slug = 'starter' THEN 15
    WHEN pl.slug = 'professional' THEN 50
    WHEN pl.slug = 'enterprise' THEN 999999
    ELSE NULL
  END AS max_skills,
  (
    SELECT count(*)::int
    FROM public.skills sk
    WHERE sk.user_id = p.id AND sk.status != 'archived'
  ) AS current_skills_count
FROM public.profiles p
LEFT JOIN public.subscriptions s
  ON s.user_id = p.id
  AND s.status IN ('active', 'trialing')
LEFT JOIN public.plans pl
  ON pl.id = s.plan_id;

GRANT SELECT ON public.user_skill_limits TO authenticated;

-- ------------------------------------------------------------
-- 6) Função + trigger: enforce_skill_limit (BEFORE INSERT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_skill_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_count int;
BEGIN
  SELECT max_skills, current_skills_count
    INTO v_max, v_count
  FROM public.user_skill_limits
  WHERE user_id = NEW.user_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Sem assinatura ativa para criar skills'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de skills atingido para o plano'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_enforce_skill_limit
  BEFORE INSERT ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.enforce_skill_limit();

-- ------------------------------------------------------------
-- 7) Função + trigger: cleanup_old_skill_versions (AFTER INSERT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_skill_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.skill_versions
  WHERE skill_id = NEW.skill_id
    AND is_live = false
    AND id NOT IN (
      SELECT id FROM public.skill_versions
      WHERE skill_id = NEW.skill_id
        AND is_live = false
      ORDER BY created_at DESC
      LIMIT 12
    );
  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_cleanup_skill_versions
  AFTER INSERT ON public.skill_versions
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_old_skill_versions();