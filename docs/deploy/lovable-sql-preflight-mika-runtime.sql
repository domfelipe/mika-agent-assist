-- Mika runtime contract preflight for Lovable/Supabase SQL Editor.
-- Safe to run: read-only diagnostics, no data changes and no secrets printed.

-- 1) Required scheduled_jobs columns used by runtime sync/error handling.
select
  'scheduled_jobs columns' as check_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scheduled_jobs'
  and column_name in (
    'auto_paused_reason',
    'runtime_state',
    'runtime_last_status',
    'runtime_last_error',
    'runtime_synced_at'
  )
order by column_name;

-- 2) Skill tables/columns needed by default skill seed and create-skill-from-agent.
select
  'skill columns' as check_name,
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'skills' and column_name in (
      'id',
      'user_id',
      'agent_instance_id',
      'name',
      'description',
      'trigger_keywords',
      'status',
      'current_version_id'
    ))
    or
    (table_name = 'skill_versions' and column_name in (
      'id',
      'skill_id',
      'version_number',
      'markdown_content',
      'form_inputs',
      'is_live',
      'created_by'
    ))
  )
order by table_name, column_name;

-- 3) Extensions expected by provisioning triggers / recurring keep-alive.
select
  'extensions' as check_name,
  e.extname,
  n.nspname as schema_name,
  e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('pg_net', 'pg_cron', 'supabase_vault', 'vault')
order by e.extname;

-- 4) Vault secrets used by pg_net triggers. Does not print secret values.
select
  'vault secrets' as check_name,
  name,
  case
    when decrypted_secret is null or length(decrypted_secret) = 0 then 'missing_or_empty'
    else 'present'
  end as status,
  length(coalesce(decrypted_secret, '')) as value_length,
  case
    when name = 'project_url' then decrypted_secret
    else null
  end as public_value
from vault.decrypted_secrets
where name in ('project_url', 'anon_key', 'internal_function_secret')
order by name;

-- 5) Trigger functions that call Edge Functions through pg_net.
select
  'trigger functions' as check_name,
  p.proname,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'trigger_provision_agent',
    'trigger_suspend_or_resume_agent',
    'vault_decrypt_secret',
    'enforce_job_limit',
    'enforce_skill_limit'
  )
order by p.proname;

-- 6) Agent provisioning triggers are present and enabled.
select
  'table triggers' as check_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  case t.tgenabled
    when 'O' then 'enabled'
    when 'D' then 'disabled'
    when 'R' then 'replica'
    when 'A' then 'always'
    else t.tgenabled::text
  end as trigger_state
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and t.tgname in (
    'trigger_agent_provisioning',
    'trigger_subscription_agent_lifecycle'
  )
order by c.relname, t.tgname;

-- 7) Railway pool readiness for no-hands provisioning.
select
  'vps pool' as check_name,
  id,
  name,
  is_active,
  capacity_current,
  capacity_max,
  railway_project_id is not null
    and railway_project_id <> ''
    and railway_project_id <> 'PREENCHER_APOS_CRIAR_NO_RAILWAY' as has_railway_project_id,
  railway_environment_id is not null
    and railway_environment_id <> ''
    and railway_environment_id <> 'PREENCHER_APOS_CRIAR_NO_RAILWAY' as has_railway_environment_id
from public.vps_pool
order by is_active desc, name;

-- 8) Current active/provisioning agents summary for smoke planning.
select
  'agent summary' as check_name,
  status,
  count(*) as total
from public.agent_instances
group by status
order by status;
