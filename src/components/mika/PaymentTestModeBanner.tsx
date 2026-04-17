const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("test_")) return null;

  return (
    <div className="w-full bg-warning/15 border-b border-warning/30 px-4 py-2 text-center text-xs sm:text-sm text-warning-foreground">
      <span className="font-semibold text-warning">Modo de teste:</span>{" "}
      pagamentos no preview não cobram dinheiro real.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium text-warning"
      >
        Saiba mais
      </a>
    </div>
  );
}
