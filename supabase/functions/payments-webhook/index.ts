import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function notifyAdmin(message: string) {
  const adminBotToken = Deno.env.get('ADMIN_TELEGRAM_BOT_TOKEN');
  const adminChatId = Deno.env.get('ADMIN_TELEGRAM_CHAT_ID');
  if (!adminBotToken || !adminChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${adminBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (e) {
    console.error('Admin notification failed:', e);
  }
}

async function lookupEmailByUserId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch (e) {
    console.error('Failed to lookup email:', e);
    return null;
  }
}

async function lookupEmailByCustomerId(customerId: string, env: PaddleEnv): Promise<string | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('paddle_customer_id', customerId)
    .eq('environment', env)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.user_id) return null;
  return await lookupEmailByUserId(data.user_id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;

  try {
    const event = await verifyWebhook(req, env);
    console.log('Received event:', event.eventType, 'env:', env, 'id:', (event as any).eventId);

    // Idempotência: tenta inserir, ignora se já existe
    const eventId = (event as any).eventId || (event as any).id;
    if (eventId) {
      const { error: insertErr } = await supabase
        .from('paddle_webhook_events')
        .insert({
          paddle_event_id: eventId,
          event_type: event.eventType,
          environment: env,
          payload: event as any,
        });
      if (insertErr && insertErr.code !== '23505') {
        console.error('Failed to record event:', insertErr);
      } else if (insertErr?.code === '23505') {
        console.log('Event already processed:', eventId);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await upsertSubscription((event as any).data, env, true);
        break;
      case EventName.SubscriptionUpdated:
        await upsertSubscription((event as any).data, env, false);
        break;
      case EventName.SubscriptionCanceled:
        await markCanceled((event as any).data, env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', (event as any).data.id);
        break;
      case EventName.TransactionPaymentFailed: {
        const data = (event as any).data;
        console.log('Payment failed:', data.id);
        const customerEmail =
          data.customer?.email ||
          (data.customerId ? await lookupEmailByCustomerId(data.customerId, env) : null) ||
          'N/A';
        try {
          await notifyAdmin(
            `🔴 <b>Pagamento falhou</b>\n\n` +
              `📧 <b>Email:</b> ${customerEmail}\n` +
              `📅 <b>Data:</b> ${new Date().toLocaleDateString('pt-BR')}\n\n` +
              `O acesso do cliente será suspenso em breve.`
          );
        } catch (e) {
          console.error('notifyAdmin (payment_failed) error:', e);
        }
        break;
      }
      default:
        console.log('Unhandled event:', event.eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error: ' + (e as Error).message, { status: 400 });
  }
});

async function upsertSubscription(data: any, env: PaddleEnv, isCreated: boolean) {
  const { id, customerId, items, status, currentBillingPeriod, scheduledChange, customData } = data;

  const userId = customData?.userId;
  if (!userId) {
    console.error('No userId in customData for subscription', id);
    return;
  }

  const item = items?.[0];
  const priceExt = item?.price?.importMeta?.externalId || item?.price?.id;
  const productExt = item?.product?.importMeta?.externalId || item?.product?.id;
  const billingCycle = item?.price?.billingCycle?.interval === 'year' ? 'yearly' : 'monthly';

  const slugMap: Record<string, string> = {
    basic_plan: 'basic',
    starter_plan: 'starter',
    professional_plan: 'professional',
  };
  const planSlug = slugMap[productExt as string];
  let planId: string | null = null;
  if (planSlug) {
    const { data: planRow } = await supabase.from('plans').select('id').eq('slug', planSlug).maybeSingle();
    planId = planRow?.id ?? null;
  }

  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      paddle_subscription_id: id,
      paddle_customer_id: customerId,
      product_id: productExt,
      price_id: priceExt,
      plan_id: planId,
      billing_cycle: billingCycle,
      status,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      cancel_at_period_end: scheduledChange?.action === 'cancel',
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,environment' }
  );

  if (error) {
    console.error('Upsert subscription error:', error);
    throw error;
  }

  await supabase.from('profiles').update({ paddle_customer_id: customerId }).eq('id', userId);

  let agentJustCreated = false;
  if (status === 'active' || status === 'trialing') {
    const { error: agentErr } = await supabase
      .from('agent_instances')
      .insert({ user_id: userId, status: 'provisioning' });
    if (agentErr && agentErr.code !== '23505') {
      console.error('Failed to provision agent_instance:', agentErr);
    } else if (!agentErr) {
      agentJustCreated = true;
    }
  }

  // Notifica admin no Telegram quando é uma assinatura nova / agente recém-criado
  if (isCreated || agentJustCreated) {
    try {
      const [{ data: profile }, { data: plan }, customerEmail] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', userId).single(),
        planId
          ? supabase.from('plans').select('name, price_monthly_brl, slug').eq('id', planId).single()
          : Promise.resolve({ data: null as any }),
        lookupEmailByUserId(userId),
      ]);

      const planEmoji: Record<string, string> = {
        basic: '🟢',
        starter: '🟡',
        professional: '🔵',
        enterprise: '🟣',
      };
      const slug = (plan as any)?.slug as string | undefined;

      await notifyAdmin(
        `${planEmoji[slug ?? ''] || '⚪'} <b>Novo cliente Mika!</b>\n\n` +
          `👤 <b>Nome:</b> ${(profile as any)?.full_name || 'N/A'}\n` +
          `📧 <b>Email:</b> ${customerEmail || 'N/A'}\n` +
          `📱 <b>Telefone:</b> ${(profile as any)?.phone || 'N/A'}\n` +
          `💳 <b>Plano:</b> ${(plan as any)?.name || 'N/A'} — R$ ${(plan as any)?.price_monthly_brl ?? '?'}/mês\n` +
          `🤖 <b>Bot:</b> Aguardando configuração\n\n` +
          `➡️ <a href="https://mika.domco.ai/admin">Provisionar agora</a>`
      );
    } catch (e) {
      console.error('notifyAdmin (subscription_created) error:', e);
    }
  }
}

async function markCanceled(data: any, env: PaddleEnv) {
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);

  try {
    const customerEmail =
      data.customer?.email ||
      (data.customerId ? await lookupEmailByCustomerId(data.customerId, env) : null) ||
      'N/A';
    await notifyAdmin(
      `⚠️ <b>Assinatura cancelada</b>\n\n` +
        `📧 <b>Email:</b> ${customerEmail}\n` +
        `📅 <b>Data:</b> ${new Date().toLocaleDateString('pt-BR')}`
    );
  } catch (e) {
    console.error('notifyAdmin (canceled) error:', e);
  }
}
