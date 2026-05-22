UPDATE public.agent_instances
SET telegram_webhook_secret = 'a1ef7f3d2c4b8e9f0d6a5b1c3e7f9a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f',
    telegram_webhook_configured = true,
    updated_at = now()
WHERE id = '2d5bfffc-68dc-41d2-870c-2c77f794da08';