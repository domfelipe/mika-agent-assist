UPDATE public.agent_instances
SET telegram_webhook_secret = 'fe5c5c65de942c8102d0b06b2d2dff81cd928547e41f8b095679f06ef9d71231',
    telegram_webhook_configured = true,
    updated_at = now()
WHERE id = '2d5bfffc-68dc-41d2-870c-2c77f794da08';