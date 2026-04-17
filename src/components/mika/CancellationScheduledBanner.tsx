"use client";

import { useState } from "react";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

/**
 * Discrete banner shown when the subscription is scheduled to be canceled
 * at the end of the current period (cancel_at_period_end = true) but is
 * still active. Tells the user until when access remains and offers a
 * one-click way to reactivate via the Paddle customer portal.
 */
export function CancellationScheduledBanner() {
  const { data: subscription } = useSubscription();
  const [loading, setLoading] = useState(false);

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const scheduled = !!subscription?.cancel_at_period_end && isActive;

  if (!scheduled) return null;

  const endsAt = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "d 'de' MMMM 'de' yyyy", {
        locale: ptBR,
      })
    : null;

  const openPortal = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session");
      if (error || !data?.url) {
        toast.error("Não foi possível abrir o portal. Tente novamente.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-muted/40"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5 sm:mt-0" />
          <p className="text-xs sm:text-sm text-muted-foreground">
            Sua assinatura foi cancelada
            {endsAt ? (
              <>
                {" "}e expira em{" "}
                <span className="font-medium text-foreground">{endsAt}</span>.
              </>
            ) : (
              " e expirará no fim do período atual."
            )}{" "}
            Você ainda tem acesso até lá.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openPortal}
          disabled={loading}
          className="shrink-0 rounded-lg h-8 text-xs"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Reativar assinatura
        </Button>
      </div>
    </div>
  );
}
