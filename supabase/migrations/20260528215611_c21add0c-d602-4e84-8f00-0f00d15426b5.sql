-- Add is_default column to skills and update user_skill_limits view
-- to exclude default skills from custom skill quota
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Mark known default skills by name (where description matches the template too)
UPDATE public.skills
   SET is_default = true
 WHERE is_default = false
   AND name IN ('Resumo diario', 'Planejamento semanal', 'Preparar reuniao')
   AND description IN (
     'Gera um resumo curto do dia com compromissos, tarefas e proximas prioridades.',
     'Ajuda o usuario a transformar objetivos da semana em prioridades e proximas acoes.',
     'Monta um briefing rapido antes de reunioes com contexto, pauta e perguntas uteis.'
   );

-- Recreate user_skill_limits to exclude default skills from quota count
DROP VIEW IF EXISTS public.user_skill_limits;

CREATE VIEW public.user_skill_limits AS
SELECT
  p.id AS user_id,
  pl.slug AS plan_slug,
  CASE
    WHEN pl.slug IS NULL THEN NULL::integer
    WHEN pl.slug = 'basic' THEN 5
    WHEN pl.slug = 'starter' THEN 15
    WHEN pl.slug = 'professional' THEN 50
    WHEN pl.slug = 'enterprise' THEN 999999
    ELSE NULL::integer
  END AS max_skills,
  (
    SELECT count(*)::integer
      FROM public.skills sk
     WHERE sk.user_id = p.id
       AND sk.status <> 'archived'
       AND COALESCE(sk.is_default, false) = false
  ) AS current_skills_count
FROM public.profiles p
LEFT JOIN public.subscriptions s
  ON s.user_id = p.id
 AND s.status = ANY (ARRAY['active'::text, 'trialing'::text])
LEFT JOIN public.plans pl ON pl.id = s.plan_id;

GRANT SELECT ON public.user_skill_limits TO authenticated;
GRANT SELECT ON public.user_skill_limits TO service_role;