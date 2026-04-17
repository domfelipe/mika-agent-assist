"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

/**
 * Persistent banner shown at the top of the dashboard when the user's
 * subscription status indicates a payment problem (past_due / unpaid).
 *
 * Provides a one-click action to open the Paddle customer portal so the
 * user can update their payment method.
 */
export function PaymentIssueBanner() {
  const { data: subscription } = useSubscription();
  const [loading, setLoading] = useState(false);

  const status = subscription?.status;
  const showBanner = status === "past_due" || status === "unpaid";

  if (!showBanner) return null;

  const isUnpaid = status === "unpaid";

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
      role="alert"
      aria-live="polite"
      className={
        isUnpaid
          ? "border-b border-destructive/30 bg-destructive/10"
          : "border-b border-amber-500/30 bg-amber-500/10"
      }
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle
            className={
              "h-5 w-5 shrink-0 mt-0.5 " +
              (isUnpaid ? "text-destructive" : "text-amber-600 dark:text-amber-500")
            }
          />
          <div className="min-w-0">
            <p
              className={
                "text-sm font-semibold " +
                (isUnpaid ? "text-destructive" : "text-amber-700 dark:text-amber-400")
              }
            >
              {isUnpaid
                ? "Sua assinatura está sem pagamento"
                : "Pagamento pendente na sua assinatura"}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {isUnpaid
                ? "Regularize o pagamento para reativar o acesso completo aos recursos."
                : "Atualize seu método de pagamento para evitar a suspensão do serviço."}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={openPortal}
          disabled={loading}
          className="shrink-0 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          Atualizar pagamento
        </Button>
      </div>
    </div>
  );
}
