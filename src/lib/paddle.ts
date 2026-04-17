import { supabase } from "@/integrations/supabase/client";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle: any;
  }
}

let paddleInitialized = false;
let initPromise: Promise<void> | null = null;

export function getPaddleEnv(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (initPromise) return initPromise;

  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN não está configurado");
  }

  initPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle="true"]');
    const onLoad = () => {
      try {
        const environment = clientToken.startsWith("test_") ? "sandbox" : "production";
        window.Paddle.Environment.set(environment);
        window.Paddle.Initialize({ token: clientToken });
        paddleInitialized = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    if (existing) {
      if (window.Paddle) onLoad();
      else existing.addEventListener("load", onLoad);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.dataset.paddle = "true";
    script.onload = onLoad;
    script.onerror = () => reject(new Error("Falha ao carregar Paddle.js"));
    document.head.appendChild(script);
  });

  return initPromise;
}

const priceIdCache = new Map<string, string>();

export async function getPaddlePriceId(priceId: string): Promise<string> {
  if (priceIdCache.has(priceId)) return priceIdCache.get(priceId)!;

  const environment = getPaddleEnv();
  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment },
  });
  if (error || !data?.paddleId) {
    throw new Error(`Não foi possível resolver o preço: ${priceId}`);
  }
  priceIdCache.set(priceId, data.paddleId);
  return data.paddleId;
}
