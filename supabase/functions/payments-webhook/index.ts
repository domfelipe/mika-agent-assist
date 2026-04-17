import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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
      // Se já existe (unique violation), ignora silenciosamente
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
      case EventName.SubscriptionUpdated:
        await upsertSubscription((event as any).data, env);
        break;
      case EventName.SubscriptionCanceled:
        await markCanceled((event as any).data, env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', (event as any).data.id);
        break;
      case EventName.TransactionPaymentFailed:
        console.log('Payment failed:', (event as any).data.id);
        break;
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

async function upsertSubscription(data: any, env: PaddleEnv) {
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

  // Resolve plan_id local pelo slug correspondente ao product externalId
  // Mapeamento: basic_plan -> basic, starter_plan -> starter, professional_plan -> professional
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

  // Atualiza paddle_customer_id no profile
  await supabase.from('profiles').update({ paddle_customer_id: customerId }).eq('id', userId);
}

async function markCanceled(data: any, env: PaddleEnv) {
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);
}
