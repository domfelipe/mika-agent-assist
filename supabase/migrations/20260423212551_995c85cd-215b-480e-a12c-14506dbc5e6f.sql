-- Admins podem ler todos os agent_instances
CREATE POLICY "admins read all agent_instances"
ON public.agent_instances
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins podem ler todos os profiles
CREATE POLICY "admins read all profiles"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins podem ler todas as subscriptions
CREATE POLICY "admins read all subscriptions"
ON public.subscriptions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- provisioning_jobs já tem "Admins veem todos os jobs", então não duplica.
-- Admins também precisam atualizar agent_instances (chat_id backfill, etc.)
CREATE POLICY "admins update agent_instances"
ON public.agent_instances
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));