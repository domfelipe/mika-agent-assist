UPDATE public.agent_instances
SET telegram_user_chat_id = 179720882,
    telegram_connected_at = now(),
    telegram_onboarding_completed = true,
    onboarding_completed = true,
    updated_at = now()
WHERE id = '911396a1-7c2d-42e0-b018-5e7ba21bd181';
