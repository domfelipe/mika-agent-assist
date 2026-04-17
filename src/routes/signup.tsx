import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/mika/Logo";

type SignupSearch = {
  plan?: string;
  cycle?: "monthly" | "yearly";
};

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
    cycle: search.cycle === "yearly" || search.cycle === "monthly" ? search.cycle : undefined,
  }),
  component: SignupPlaceholder,
});

function SignupPlaceholder() {
  const { plan, cycle } = Route.useSearch();
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <Logo size="lg" />
        <h1 className="text-2xl font-bold">Criar conta</h1>
        <p className="text-muted-foreground">
          Cadastro completo será implementado na Etapa 2.
        </p>
        {plan && (
          <p className="text-sm bg-primary/10 text-primary rounded-lg px-3 py-2 inline-block">
            Plano selecionado: <strong>{plan}</strong> · {cycle === "yearly" ? "anual" : "mensal"}
          </p>
        )}
        <div>
          <Link to="/" className="inline-block text-primary hover:underline">← Voltar para o início</Link>
        </div>
      </div>
    </div>
  );
}
