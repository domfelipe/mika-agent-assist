
# Correções de Segurança — Sem Impacto em Produção

Objetivo: eliminar todos os erros e warnings listados **mantendo 100% do comportamento atual** (provisionamento automático, webhooks Railway/Telegram, polling Hermes, painéis admin/usuário). Cada mudança é defensiva: bloqueia chamadas externas não autorizadas, mas mantém os caminhos internos legítimos funcionando ao adicionar um header de segredo compartilhado já configurado.

---

## 1. Erros de endpoints abertos (agent_security)

### 1.1 `provision-agent`
- Adicionar verificação de header `X-Internal-Secret` no topo do handler.
- Segredo novo: `INTERNAL_FUNCTION_SECRET` (request via `add_secret`).
- Atualizar **todos os callers internos** para enviar o header:
  - `supabase/functions/validate-telegram-bot/index.ts` (chamada async)
  - `supabase/functions/payments-webhook/index.ts` (se chamar)
  - `src/routes/admin.*` → painel admin chama via `supabase.functions.invoke` autenticado por JWT de admin: aceitar **OU** JWT de admin **OU** o segredo.
  - `trigger_provision_agent()` (função PL/pgSQL via pg_net): adicionar header com o segredo lido do `vault.decrypted_secrets`.

### 1.2 `railway-webhook`
- Adicionar verificação do header `X-Railway-Signature` (HMAC SHA-256 do body cru) usando segredo `RAILWAY_WEBHOOK_SECRET`.
- Como Railway pode não estar configurado com webhook signature ainda: **modo permissivo controlado** — se `RAILWAY_WEBHOOK_SECRET` estiver vazio, loga warning e aceita (mantém produção). Quando o usuário configurar o segredo no Railway, valida estritamente.

### 1.3 `managed-bot-webhook`
- Validar `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_MANAGER_BOT_WEBHOOK_SECRET`.
- Mesma estratégia permissiva: se segredo não existe, mantém aberto + log (já estava aberto antes; não regride).

### 1.4 `generate-skill-markdown`
- Remover `verify_jwt = false` do `config.toml` (volta ao padrão `true`).
- Não é mais chamado por sistemas externos; o painel usa o cliente Supabase autenticado, então JWT vai naturalmente.

### 1.5 `suspend-agent` / `resume-agent`
- Adicionar extração do JWT + checagem `agent.user_id === auth.uid()` **OU** `has_role(uid, 'admin')` **OU** header `X-Internal-Secret` (para trigger pg_net `trigger_suspend_or_resume_agent`).
- Atualizar `trigger_suspend_or_resume_agent()` para passar o segredo.

---

## 2. Warning: `keep-alive-agents`
- Adicionar verificação `X-Internal-Secret`. Atualizar cron pg_net que invoca (se existir) para enviar o header. Se não houver cron configurado (chamada manual), o admin pode configurar.

---

## 3. Warnings de RLS (supabase_lov)

Adicionar policies **apenas para `service_role`** em tabelas que já são usadas só pelo backend (não muda comportamento, documenta intenção e silencia o linter):

- `oauth_state_tokens` — policy `service_role ALL`
- `paddle_webhook_events` — policy `service_role ALL`
- `stripe_webhook_events` — policy `service_role ALL`
- `telegram_rate_limit_bucket` — policy `service_role ALL`

Não adicionar policies novas para `user_integrations`/`vps_pool` (warnings informativos sobre design intencional — aceitos como estão, vamos ignorá-los via `manage_security_finding` com justificativa).

### Realtime
- Adicionar policies em `realtime.messages` restringindo subscribe por tópico:
  - Tópico de `subscriptions:<user_id>` → apenas se `auth.uid() = user_id`
  - Tópico de `telegram_messages_log:<user_id>` → idem
- Se hoje o frontend não usa nomes de tópico baseados em `user_id`, **não introduzir** — apenas marcar como ignorado documentando que as queries Realtime atuais ainda passam pela RLS da tabela base. Vou verificar uso real antes de aplicar.

---

## 4. Warnings Supabase linter

- **`extension_in_public`**: mover extensões fora de `public` quebra muita coisa. Marcar como `ignore` com razão "extensão `pg_net`/`vault` instalada por padrão pelo Supabase, mover requer downtime e não traz ganho real".
- **SECURITY DEFINER executable**: revisar cada função SECURITY DEFINER. As que devem ficar acessíveis (`has_role`, `has_active_subscription`) — REVOKE de `anon`, manter `authenticated`. As de uso interno (`vault_*`, `trigger_*`, `enforce_*`, `handle_new_user`, `cleanup_*`) — REVOKE de `anon` e `authenticated`.
- **`rls_enabled_no_policy`**: resolvido pelas policies novas acima.

---

## Detalhes técnicos

### Segredos novos a criar
- `INTERNAL_FUNCTION_SECRET` (gerado, 32 bytes hex)
- `RAILWAY_WEBHOOK_SECRET` (opcional — modo permissivo até configurar)
- `TELEGRAM_MANAGER_BOT_WEBHOOK_SECRET` (opcional — modo permissivo)

### Vault entry para o trigger pg_net
Inserir `internal_function_secret` em `vault.secrets` para que `trigger_provision_agent` / `trigger_suspend_or_resume_agent` leiam e enviem como header.

### Arquivos editados
- `supabase/config.toml` (remover `verify_jwt = false` de generate-skill-markdown)
- `supabase/functions/provision-agent/index.ts`
- `supabase/functions/railway-webhook/index.ts`
- `supabase/functions/managed-bot-webhook/index.ts`
- `supabase/functions/suspend-agent/index.ts`
- `supabase/functions/resume-agent/index.ts`
- `supabase/functions/keep-alive-agents/index.ts`
- `supabase/functions/validate-telegram-bot/index.ts` (adicionar header)
- Migration nova: policies service_role, REVOKE de funções SECURITY DEFINER, update das triggers para enviar header.

### Rollout em ordem (evita downtime)
1. Criar segredos + migration (vault entry + policies + revokes + triggers atualizados).
2. Deploy das edge functions com checagem **opcional** (se segredo ausente, aceita). Isso garante que mesmo se o trigger antigo chamar sem header, continua funcionando durante a janela.
3. Após confirmar deploy, próxima migration torna a checagem **obrigatória** (remove o modo permissivo). Posso fazer isso já se preferir — mas o modo "primeiro permissivo" é mais seguro.

### Findings que serão marcadas como `ignore` (com justificativa em `update_memory`)
- `user_integrations` write policies — intencional, escrita feita só por backend
- `vps_pool` — intencional, somente admin
- `extension_in_public` — Supabase default

---

## Confirmação necessária

Posso prosseguir com:
- (a) Plano completo, **modo permissivo** nos webhooks externos (Railway/Telegram manager) até você configurar os segredos lá → zero risco em produção.
- (b) Estrito desde o início (mais seguro, exige configurar Railway/Telegram webhook secrets agora).

Diga **(a)** ou **(b)** e eu executo. Se aprovar sem escolher, vou de **(a)**.
