-- Mark platform-seeded Hermes skills separately from user-created skills.
-- Default skills stay active and synced to the runtime, but do not consume the
-- customer's custom skill quota.

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.skills.is_default IS
  'True for Mika/Hermes skills seeded by the platform. These do not count against the custom skill quota.';

UPDATE public.skills
SET is_default = true
WHERE is_default = false
  AND (
    (
      name = 'Resumo diario'
      AND description = 'Gera um resumo curto do dia com compromissos, tarefas e proximas prioridades.'
    )
    OR (
      name = 'Planejamento semanal'
      AND description = 'Ajuda o usuario a transformar objetivos da semana em prioridades e proximas acoes.'
    )
    OR (
      name = 'Preparar reuniao'
      AND description = 'Monta um briefing rapido antes de reunioes com contexto, pauta e perguntas uteis.'
    )
  );

CREATE OR REPLACE VIEW public.user_skill_limits
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
    WHERE sk.user_id = p.id
      AND sk.status != 'archived'
      AND COALESCE(sk.is_default, false) = false
  ) AS current_skills_count
FROM public.profiles p
LEFT JOIN public.subscriptions s
  ON s.user_id = p.id
  AND s.status IN ('active', 'trialing')
LEFT JOIN public.plans pl
  ON pl.id = s.plan_id;

GRANT SELECT ON public.user_skill_limits TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_skill_default_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.is_default := OLD.is_default;
  ELSE
    NEW.is_default := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_skill_default_flag ON public.skills;
CREATE TRIGGER trigger_protect_skill_default_flag
  BEFORE INSERT OR UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.protect_skill_default_flag();

CREATE OR REPLACE FUNCTION public.enforce_skill_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_count int;
  v_request_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF COALESCE(NEW.is_default, false) THEN
    IF v_request_role = 'service_role' THEN
      RETURN NEW;
    END IF;

    NEW.is_default := false;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.protect_skill_default_flag() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_skill_limit() FROM anon, authenticated, public;
