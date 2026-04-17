import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/mika/Logo";

export const Route = createFileRoute("/login")({
  component: LoginPlaceholder,
});

function LoginPlaceholder() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <Logo size="lg" />
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="text-muted-foreground">
          A página de login completa será implementada na Etapa 2 (Auth + Supabase).
        </p>
        <Link to="/" className="inline-block text-primary hover:underline">← Voltar para o início</Link>
      </div>
    </div>
  );
}
