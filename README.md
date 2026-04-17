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
- (opcional, Fase 5) credenciais SSH para Hermes

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

## Comandos úteis

```bash
bun dev          # dev server (porta 8080)
bun run build    # build de produção
bun run typecheck
```
