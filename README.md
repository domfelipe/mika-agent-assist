# Mika

Plataforma de agentes pessoais de IA com integração nativa ao Telegram.

## Stack

- **Frontend**: React 19 + TanStack Start (Vite 7) + Tailwind v4
- **Backend**: Lovable Cloud (Supabase) — Postgres, Auth, Vault, Edge Functions, Realtime
- **Pagamentos**: Paddle (sandbox + live)
- **Deploy SSR**: Cloudflare Workers (via Wrangler)

## Variáveis de ambiente

Já configuradas via `.env` (gerado automaticamente pelo Lovable Cloud):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_PADDLE_ENVIRONMENT` (`sandbox` ou `production`)
- `VITE_PADDLE_CLIENT_TOKEN`

### Secrets do backend (configurados via UI do Lovable Cloud)

- `PADDLE_API_KEY` / `PADDLE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAILWAY_API_TOKEN` — token da Railway Public API, usado por `provision-agent`/`suspend-agent`/`resume-agent` para criar e gerenciar containers Hermes.
- `OLLAMA_API_KEY` — chave do Ollama Cloud, injetada como env var no container Hermes.
- `HERMES_RUNTIME_IMAGE` — opcional; imagem Docker usada no Railway. Default: `ghcr.io/domfelipe/hermes-agent-custom:latest`.
- `HERMES_API_SERVER_KEY` — token usado pelo API server interno do Hermes (`API_SERVER_KEY`). Gere um valor forte por ambiente e nunca versione no repo.
- `INTERNAL_FUNCTION_SECRET` — segredo server-to-server usado pelo runtime Hermes para chamar Edge Functions internas, como `create-cronjob-from-agent` e `create-skill-from-agent`.
- `TELEGRAM_MANAGER_BOT_TOKEN` — token do bot manager (`@mika_managerbot`) usado para criar bots dos clientes em 1 toque via Bot Management Mode do BotFather.
- `TELEGRAM_MANAGER_BOT_USERNAME` — username do bot manager, padrão `mika_managerbot` (sem `@`).

### Setup do Managed Bot (one-tap onboarding)

> ⚠️ **Experimental**: o "Bot Management Mode" do BotFather (endpoint `getManagedBotToken` e deep-link `t.me/newbot/<manager>/<username>`) **não faz parte da Bot API pública oficial do Telegram**. Funcionalidade pode mudar/quebrar sem aviso. Mantemos o fluxo manual via `/newbot` no BotFather como fallback na página `/bem-vindo`.

1. **Criar o bot manager** no [@BotFather](https://t.me/BotFather): `/newbot` → nome: `Mika Manager` → username: `mika_managerbot`.
2. **Habilitar Bot Management Mode**: abrir [https://t.me/Botfather?startapp](https://t.me/Botfather?startapp) → selecionar o bot `Mika Manager` → **Bot Settings → Bot Management Mode → Enable**.
3. **Adicionar secrets** no Lovable Cloud: `TELEGRAM_MANAGER_BOT_TOKEN` (token recebido do BotFather) e `TELEGRAM_MANAGER_BOT_USERNAME=mika_managerbot`.
4. **Configurar webhook** uma vez após o deploy:
   ```
   GET https://<SUPABASE_URL>/functions/v1/managed-bot-webhook?setup=true
   ```
   Resposta esperada: `{ "webhook_set": "...", "telegram_response": { "ok": true } }`.

> **Imagem Docker custom**: por padrão o container roda `ghcr.io/domfelipe/hermes-agent-custom:latest`, mas `HERMES_RUNTIME_IMAGE` pode apontar para uma tag de branch/sha durante smoke. A imagem contém um `SOUL.md` base, e o `provision-agent` pode injetar `HERMES_SOUL_OVERRIDE` para aplicar a identidade do agente e as instruções obrigatórias de runtime.

> **Suspend/Resume via flag, não via stop.** Railway não permite parar containers sem redeploy. As Edge Functions `suspend-agent`/`resume-agent` usam a env var `HERMES_SUSPENDED` + `serviceInstanceRedeploy`:
>
> - `suspend` → upsert `HERMES_SUSPENDED=true` e redeploy → container entra em `sleep infinity`.
> - `resume` → upsert `HERMES_SUSPENDED=""` e redeploy → container sobe normal.
>
> Isso depende do start command verificar a flag. Novos serviços já são provisionados com o comando correto (`HERMES_START_COMMAND` em `_shared/railway.ts`):
>
> ```bash
> /bin/bash -c 'if [ "$HERMES_SUSPENDED" = "true" ]; then echo "Agent suspended" && sleep infinity; fi && if [ -n "$HERMES_SOUL_OVERRIDE" ]; then echo "$HERMES_SOUL_OVERRIDE" > /opt/data/SOUL.md; fi && /opt/hermes/docker/entrypoint.sh gateway run'
> ```
>
> **Para serviços Railway existentes (provisionados antes desta mudança):** use `admin-backfill-runtime` para reconciliar envs, imagem e start command. Não atualize manualmente secrets no Railway.

- `ADMIN_TELEGRAM_BOT_TOKEN` — token do bot de admin (ex: `@mika_test2_bot`) usado pelo `payments-webhook` para enviar notificações de novos clientes, falhas de pagamento e cancelamentos.
- `ADMIN_TELEGRAM_CHAT_ID` — chat ID do admin que recebe as notificações (ex: `179720882`).
- (opcional, Fase 5) credenciais SSH para Hermes

## Keep-alive dos agentes (substitui UptimeRobot)

A Edge Function `keep-alive-agents` mantém todos os containers Railway ativos automaticamente — **não há nada para configurar por agente**. A cada 4 minutos:

1. Carrega todos os `agent_instances` com `status = 'active'` e `telegram_bot_token_vault_id` preenchido.
2. Faz `GET https://api.telegram.org/bot{token}/getMe` para cada um (em paralelo, com falhas isoladas).
3. Esse tráfego de saída do container Hermes evita que o Railway hiberne instâncias ociosas.

Agendado via `pg_cron` (job `keep-alive-agents-every-4min`, schedule `*/4 * * * *`). Consultar/desagendar:

```sql
SELECT * FROM cron.job WHERE jobname = 'keep-alive-agents-every-4min';
SELECT cron.unschedule('keep-alive-agents-every-4min');
```

---

## Fase 3 — Telegram Onboarding (✅ entregue)

### O que foi entregue

- Wizard guiado de 6 passos (`TelegramOnboardingWizard`) com Framer Motion
- Validação de token via Edge Function `validate-telegram-bot` (armazenamento em Supabase Vault)
- Configuração automática de webhook (`configure-telegram-webhook`) com secret de 32 bytes
- Webhook público `telegram-webhook` com 3 camadas de segurança:
  1. Validação do `uuid_tenant` na URL
  2. Verificação do header `X-Telegram-Bot-Api-Secret-Token`
  3. Rate limit de 30 req/min por agente
- Detecção da primeira mensagem em **tempo real** via Supabase Realtime, com fallback de polling (5s) após 10s de espera
- Banners contextuais no painel:
  - Agente suspenso → vermelho com link para Faturamento
  - Token revogado → vermelho com link para Meu Agente
  - Onboarding pendente → amber com CTA "Conectar agora"
  - Onboarding parcial → primary com CTA "Continuar configuração"
- Card de status no `/painel/agente` com ações (Abrir bot, Desconectar)
- Auto-abertura do wizard ao retornar do checkout com `?status=success`

### Etapas pós-deploy (uma única vez)

1. **Verificar Vault** — confirme que a extensão `vault` está ativa e que os RPCs `vault_create_secret`, `vault_decrypt_secret`, `vault_delete_secret` estão restritos ao `service_role`.
2. **Realtime** — a tabela `telegram_messages_log` foi adicionada à publicação `supabase_realtime` via migration. Confirme em **Database → Replication** que ela está listada.
3. **Edge Functions públicas** — a função `telegram-webhook` deve estar com `verify_jwt = false` em `supabase/config.toml` (já configurado).
4. **URL pública do webhook** — a Edge Function gera automaticamente:
   `https://<project-ref>.supabase.co/functions/v1/telegram-webhook/<uuid_tenant>`
   O `uuid_tenant` é gerado por agente ao provisionar.
5. **Teste manual end-to-end**:
   - Crie um bot no [@BotFather](https://t.me/BotFather)
   - No painel, abra o wizard e cole o token
   - Aguarde a tela "Mande qualquer mensagem para seu Mika agora"
   - Envie "oi" no chat do bot — a tela deve mudar para o estado de sucesso em até 2s

### Observações de segurança

- Tokens dos bots **nunca** trafegam para o frontend após validação. Ficam apenas em `vault.secrets`, referenciados por `telegram_bot_token_vault_id`.
- Apenas o `service_role` (Edge Functions) consegue gravar/atualizar/deletar em `agent_instances` via RPCs Vault.
- A tabela `telegram_messages_log` tem RLS: usuário só vê seus próprios chats; INSERT é restrito ao `service_role`.

### O que **não** está nesta fase

- ❌ Resposta real via Hermes (Fase 5 — proxy SSH/API)
- ❌ Outros canais (Slack, WhatsApp)
- ❌ Comandos customizados / menus
- ❌ Mensagens de voz/imagem processadas por IA
- ❌ Suporte a grupos do Telegram

A Edge Function `telegram-webhook` hoje responde com um placeholder. O `TODO Fase 5` está marcado no código.

---

## Fase 4 — Integrações OAuth + Automações (✅ entregue)

### O que foi entregue

- **5 providers OAuth** cadastrados em `available_mcps`: Google Workspace, Notion, Todoist, Cal.com, Microsoft 365
- **Edge Functions**:
  - `oauth-start` — gera state token + URL de autorização (PKCE quando aplicável)
  - `oauth-callback` (público, `verify_jwt = false`) — troca code por tokens, persiste no Vault
  - `refresh-integration-token` — renova access_token via refresh_token
  - `disconnect-integration` — revoga no provider + apaga do Vault + auto-pausa cronjobs dependentes
  - `test-integration` — verifica conectividade sem consumir refresh
  - `parse-cronjob-natural-language` — Lovable AI Gateway (gemini-2.5-flash) → cron + prompt
- **Frontend `/painel/integracoes`** — grid com 4 estados (available, locked, connected, error), página de detalhe com `DisconnectMCPDialog` que lista cronjobs dependentes
- **Frontend `/painel/cronjobs`** — wizard 3 passos (NL → revisão obrigatória → checagem de dependências MCP), gestão de status (active/paused/auto_paused)
- **Dashboard** — widgets de Skills, Automações e Integrações + banner de auto-pausa
- **Enforcement via banco** — views `user_jobs_limits` e `user_integration_limits` aplicam limites por plano
- **Cleanup oauth_states** — trigger `FOR EACH STATEMENT` (não FOR EACH ROW) limpa tokens expirados

### Etapas pós-deploy (uma única vez)

#### 1. Configurar OAuth apps em cada provider

Para cada provider abaixo, crie um OAuth app e configure a **Redirect URI**:

```
https://smsarmgoirlcedmqvdgc.supabase.co/functions/v1/oauth-callback
```

| Provider             | Console                                                                                                                      | Scopes mínimos                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Google Workspace** | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID (Web app) | `openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar` |
| **Microsoft 365**    | [Azure Portal](https://portal.azure.com) → App registrations → New registration → Web                                        | `openid email profile offline_access Mail.Read Calendars.ReadWrite`                                            |
| **Notion**           | [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration (Public)                                | (definidos na integração)                                                                                      |
| **Todoist**          | [developer.todoist.com](https://developer.todoist.com/appconsole.html) → App management → Create app                         | `data:read_write`                                                                                              |
| **Cal.com**          | [app.cal.com/settings/developer](https://app.cal.com/settings/developer/oauth-clients) → New OAuth Client                    | `READ_BOOKING WRITE_BOOKING READ_PROFILE`                                                                      |

#### 2. Adicionar os 10 secrets no Lovable Cloud

Pelo menu **Connectors → Lovable Cloud → Secrets**, adicione:

```
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
MICROSOFT_OAUTH_CLIENT_ID
MICROSOFT_OAUTH_CLIENT_SECRET
NOTION_OAUTH_CLIENT_ID
NOTION_OAUTH_CLIENT_SECRET
TODOIST_OAUTH_CLIENT_ID
TODOIST_OAUTH_CLIENT_SECRET
CALCOM_OAUTH_CLIENT_ID
CALCOM_OAUTH_CLIENT_SECRET
```

#### 3. Verificar publicação Realtime

A view `user_integration_limits` e `user_jobs_limits` usam dados de `user_integrations` e `scheduled_jobs`. Não precisam estar em realtime, mas confirme que os RPCs Vault permanecem restritos ao `service_role`.

#### 4. Teste end-to-end

1. Acesse `/painel/integracoes` → conecte uma integração (ex: Notion)
2. Acesse `/painel/cronjobs/nova` → descreva "todo dia útil às 9h, criar uma página no Notion com resumo do dia"
3. Confirme a revisão (cron + prompt)
4. A automação deve aparecer ativa em `/painel/cronjobs`
5. Desconecte a integração Notion → a automação deve aparecer **auto-pausada** com banner no dashboard

### O que **não** está nesta fase

- ❌ Execução real de cronjobs (Fase 5 — scheduler + Hermes)
- ❌ Sync Mika ↔ Container (Fase 5)
- ❌ MCPs corporativos privados / BYOA
- ❌ Histórico de execuções de cronjobs
- ❌ Dashboard de uso de API calls
- ❌ Providers além dos 5 listados

---

## Fase 5.1 — Provisionamento Railway (parcial: schema + provision-agent + railway-webhook)

### O que foi entregue nesta etapa

- **Schema**:
  - `vps_pool` (pool de projetos Railway, com `railway_project_id` / `railway_environment_id` placeholders)
  - `provisioning_jobs` (state machine: pending/running/retrying/completed/failed, com retry exponencial `attempt²` minutos)
  - Acréscimos em `agent_instances`: `railway_service_id`, `vps_pool_id`, `provisioned_at`, `last_health_check_at`
  - `vps_host` e `container_name` mantidos como deprecated via comentário
  - `user_roles` + enum `app_role` + função `has_role()` (substitui `is_admin` em profiles, mais seguro)
  - Trigger `on_agent_instance_provisioning` usando `pg_net` chama `provision-agent` quando uma agent_instance entra em status `provisioning`
- **Edge Functions**:
  - `provision-agent` (verify_jwt=false): cria serviço Docker no Railway via GraphQL API, configura variáveis (TELEGRAM_BOT_TOKEN do Vault, OPENCODE_ZEN_API_KEY, etc.) e dispara deploy. Apaga webhook do Telegram antes (Hermes opera em polling). Retry com backoff exponencial até 5 tentativas.
  - `railway-webhook` (verify_jwt=false): recebe eventos do Railway. SUCCESS → marca agent como `active`; FAILED/CRASHED → marca como `error`.
- **Helper compartilhado**: `supabase/functions/_shared/railway.ts`

### Etapas pós-deploy (uma única vez) — **OBRIGATÓRIAS**

#### 1. Criar conta Railway e workspace

1. Crie conta em [railway.com](https://railway.com)
2. Crie um Workspace chamado **"Mika Agents"**
3. Dentro dele, crie um Projeto chamado **"hermes-agents-prod"** com environment **"production"**

#### 2. Gerar Account Token e adicionar como secret

1. **Account Settings → Tokens → Create Token** (não confundir com Project Token, precisa ser de conta)
2. Copie o token e adicione como secret `RAILWAY_API_TOKEN` em Lovable Cloud → Secrets
3. As Edge Functions já leem `OPENCODE_ZEN_API_KEY` e `OPENCODE_GO_API_KEY` (também precisam estar configurados — já solicitados nesta fase)

#### 3. Preencher os IDs do Railway na vps_pool

Pegue o `railway_project_id` na URL do projeto (`railway.com/project/<UUID>`) e o `railway_environment_id` em **Project → Settings → Environments → production → Copy ID**, e rode via SQL:

```sql
UPDATE public.vps_pool
SET railway_project_id = '<UUID-DO-PROJETO>',
    railway_environment_id = '<UUID-DO-ENV-PRODUCTION>'
WHERE name = 'railway-prod-1';
```

#### 4. Configurar webhook do Railway → Lovable Cloud

No Railway: **Project Settings → Webhooks → Add Webhook** e cole:

```
https://smsarmgoirlcedmqvdgc.supabase.co/functions/v1/railway-webhook
```

Tipo: **Deployment status changes** (ou todos).

#### 5. Marcar você (Felipe) como admin

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<SEU_USER_UUID>', 'admin');
```

Pegue seu UUID em **Lovable Cloud → Auth → Users**.

### O que ainda falta nesta fase (próxima mensagem)

- ❌ Edge Functions `suspend-agent` e `resume-agent`
- ❌ Botão "Abrir no Telegram" no `/painel` quando `status='active'`
- ❌ Página `/admin` (lista de agentes, ações suspender/reativar, link Railway, contadores)
- ❌ Simplificação do wizard de Telegram (capturar só token, sem configurar webhook)

### O que **não** está nesta fase (5.1) por design

- ❌ Sync de skills/cronjobs/MCPs para o container (Fase 5.2)
- ❌ Backup de memória antes de desprovisionamento
- ❌ Múltiplos environments Railway por plano
- ❌ Auto-scaling

### Notas técnicas

- Hermes roda em **polling**: o container faz outbound para `api.telegram.org`, sem necessidade de domínio público nem TLS.
- Após `provision-agent` retornar 200, o Railway leva 1–5 min para puxar a imagem Docker e iniciar. Durante esse tempo, `agent_instance.status` permanece `provisioning`. O webhook do Railway notifica quando o deploy fica `SUCCESS`.
- A Edge Function `telegram-webhook` (Fase 3) ainda existe mas será desativada na próxima entrega — o polling do Hermes substitui o webhook do Telegram.

---

## Comandos úteis

```bash
bun dev          # dev server (porta 8080)
bun run build    # build de produção
bun run typecheck
```
