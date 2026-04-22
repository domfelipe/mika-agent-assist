-- Trigger para chamar suspend-agent quando subscription fica inactive (canceled/past_due)
-- e resume-agent quando volta para active.

CREATE OR REPLACE FUNCTION public.trigger_suspend_or_resume_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_function text;
  v_agent_id uuid;
BEGIN
  -- Só age em UPDATE, não em INSERT inicial
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Determina ação: active/trialing => resume; canceled/past_due/unpaid => suspend
  IF NEW.status IN ('active', 'trialing') AND OLD.status NOT IN ('active', 'trialing') THEN
    v_function := 'resume-agent';
  ELSIF NEW.status IN ('canceled', 'past_due', 'unpaid', 'paused') AND OLD.status IN ('active', 'trialing') THEN
    v_function := 'suspend-agent';
  ELSE
    RETURN NEW;
  END IF;

  -- Busca o agent_instance correspondente
  SELECT id INTO v_agent_id FROM public.agent_instances WHERE user_id = NEW.user_id LIMIT 1;
  IF v_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lê config
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
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
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object('agent_instance_id', v_agent_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_status_change_trigger ON public.subscriptions;
CREATE TRIGGER subscription_status_change_trigger
AFTER UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_suspend_or_resume_agent();