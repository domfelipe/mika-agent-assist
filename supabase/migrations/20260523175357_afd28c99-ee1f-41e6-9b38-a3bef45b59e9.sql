
-- ==========================================
-- Correções de segurança — sem impacto em produção
-- ==========================================

-- 1) RLS: policies service_role explícitas em tabelas backend-only
--    (silencia warnings do linter e documenta intenção)

DROP POLICY IF EXISTS "service_role manages oauth_state_tokens" ON public.oauth_state_tokens;
CREATE POLICY "service_role manages oauth_state_tokens"
  ON public.oauth_state_tokens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role manages paddle_webhook_events" ON public.paddle_webhook_events;
CREATE POLICY "service_role manages paddle_webhook_events"
  ON public.paddle_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role manages stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "service_role manages stripe_webhook_events"
  ON public.stripe_webhook_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role manages telegram_rate_limit_bucket" ON public.telegram_rate_limit_bucket;
CREATE POLICY "service_role manages telegram_rate_limit_bucket"
  ON public.telegram_rate_limit_bucket
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) REVOKE EXECUTE em SECURITY DEFINER internas (mantém só service_role/postgres)
--    Funções de uso EXCLUSIVAMENTE interno (triggers, vault, cleanup):
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.vault_create_secret(text, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.vault_decrypt_secret(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_skill_limit() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_skill_versions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_provision_agent() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_job_limit() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_suspend_or_resume_agent() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_integration_limit() FROM anon, authenticated, public;

-- Funções que precisam ser acessíveis a usuários autenticados (não a anon):
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;

-- 3) Atualizar triggers para enviar X-Internal-Secret a partir do vault.
CREATE OR REPLACE FUNCTION public.trigger_provision_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_internal_secret text;
BEGIN
  IF NEW.status <> 'provisioning' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'provisioning' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RAISE LOG 'trigger_provision_agent: vault não configurado, pulando';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/provision-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Internal-Secret', COALESCE(v_internal_secret, '')
    ),
    body := jsonb_build_object('agent_instance_id', NEW.id)
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_suspend_or_resume_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_internal_secret text;
  v_function text;
  v_agent_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('active', 'trialing') AND OLD.status NOT IN ('active', 'trialing') THEN
    v_function := 'resume-agent';
  ELSIF NEW.status IN ('canceled', 'past_due', 'unpaid', 'paused') AND OLD.status IN ('active', 'trialing') THEN
    v_function := 'suspend-agent';
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO v_agent_id FROM public.agent_instances WHERE user_id = NEW.user_id LIMIT 1;
  IF v_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  IF v_supabase_url IS NULL OR v_anon_key IS NULL THEN
    RAISE LOG 'trigger_suspend_or_resume_agent: vault não configurado, pulando';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/' || v_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'X-Internal-Secret', COALESCE(v_internal_secret, '')
    ),
    body := jsonb_build_object('agent_instance_id', v_agent_id)
  );

  RETURN NEW;
END;
$function$;

-- 4) Atualizar cron job keep-alive para enviar X-Internal-Secret
DO $$
DECLARE
  v_anon_key text;
  v_internal_secret text;
  v_command text;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  SELECT decrypted_secret INTO v_internal_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1;

  IF v_anon_key IS NULL OR v_internal_secret IS NULL THEN
    RAISE LOG 'keep-alive cron: vault não populado, mantendo schedule atual';
    RETURN;
  END IF;

  v_command := format($cmd$
    SELECT net.http_post(
      url := 'https://smsarmgoirlcedmqvdgc.supabase.co/functions/v1/keep-alive-agents',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer %s',
        'X-Internal-Secret', '%s'
      ),
      body := '{}'::jsonb
    );
  $cmd$, v_anon_key, v_internal_secret);

  PERFORM cron.unschedule('keep-alive-agents-every-4min');
  PERFORM cron.schedule('keep-alive-agents-every-4min', '*/4 * * * *', v_command);
END;
$$;
