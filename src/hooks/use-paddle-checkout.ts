"use client";

import { useState } from "react";
import { toast } from "sonner";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";

interface CheckoutOptions {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  userId: string;
  successUrl?: string;
}

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (opts: CheckoutOptions) => {
    setLoading(true);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(opts.priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: opts.quantity ?? 1 }],
        customer: opts.customerEmail ? { email: opts.customerEmail } : undefined,
        customData: { userId: opts.userId },
        settings: {
          displayMode: "overlay",
          successUrl: opts.successUrl || `${window.location.origin}/checkout/sucesso`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
