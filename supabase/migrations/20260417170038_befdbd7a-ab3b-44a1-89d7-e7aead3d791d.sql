
-- ============================================
-- HELPER: trigger para updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  company_name TEXT,
  cpf_cnpj TEXT,
  phone TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT UNIQUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem o próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuários atualizam o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Usuários inserem o próprio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: cria profile automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PLANS
-- ============================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_brl NUMERIC(10,2),
  price_yearly_brl NUMERIC(10,2),
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlighted BOOLEAN NOT NULL DEFAULT false,
  is_enterprise BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planos são públicos"
  ON public.plans FOR SELECT
  USING (true);

INSERT INTO public.plans (slug, name, description, price_monthly_brl, price_yearly_brl, features, highlighted, is_enterprise, display_order) VALUES
('basic', 'Basic', 'Para quem está começando a explorar IA pessoal', 69.90, 671.04,
  '["Memória persistente básica","Até 500 mensagens/mês","Integração com Telegram","Suporte por e-mail"]'::jsonb,
  false, false, 1),
('starter', 'Starter', 'Para profissionais que querem produtividade real', 199.90, 1919.04,
  '["Memória persistente avançada","Até 3.000 mensagens/mês","Integração Google Workspace","Skills personalizadas (até 10)","Suporte prioritário"]'::jsonb,
  false, false, 2),
('professional', 'Professional', 'Para quem usa IA o dia inteiro', 399.90, 3839.04,
  '["Memória persistente ilimitada","Mensagens ilimitadas","Skills ilimitadas","Agendamentos automáticos","Integrações premium","Suporte dedicado em horário comercial"]'::jsonb,
  true, false, 3),
('enterprise', 'Enterprise', 'Para times e empresas', NULL, NULL,
  '["Tudo do Professional","Múltiplos usuários","SSO e auditoria","SLA garantido","Onboarding personalizado","Gerente de conta dedicado"]'::jsonb,
  false, true, 4);

-- ============================================
-- SUBSCRIPTIONS
-- ============================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id),
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem a própria assinatura"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- AGENT INSTANCES
-- ============================================
CREATE TABLE public.agent_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','active','suspended','error')),
  vps_host TEXT,
  container_name TEXT,
  telegram_bot_token_vault_id UUID,
  telegram_bot_username TEXT,
  uuid_tenant UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_instances_user_id ON public.agent_instances(user_id);
CREATE INDEX idx_agent_instances_uuid_tenant ON public.agent_instances(uuid_tenant);
CREATE INDEX idx_agent_instances_status ON public.agent_instances(status);

ALTER TABLE public.agent_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem o próprio agente"
  ON public.agent_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_agent_instances_updated_at
  BEFORE UPDATE ON public.agent_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STRIPE WEBHOOK EVENTS (idempotência)
-- ============================================
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB
);

CREATE INDEX idx_stripe_webhook_events_event_id ON public.stripe_webhook_events(stripe_event_id);
CREATE INDEX idx_stripe_webhook_events_event_type ON public.stripe_webhook_events(event_type);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role acessa

-- ============================================
-- ENTERPRISE LEADS
-- ============================================
CREATE TABLE public.enterprise_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  team_size TEXT NOT NULL CHECK (team_size IN ('1-10','11-50','51-200','200+')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer pessoa pode enviar lead"
  ON public.enterprise_leads FOR INSERT
  WITH CHECK (true);
-- Leitura: apenas service_role
