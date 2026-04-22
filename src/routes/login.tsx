"use client";

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { AuthCard } from "@/components/mika/AuthCard";
import { GoogleButton } from "@/components/mika/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginSearch = { redirect?: string };

const schema = z.object({
  email: z.string().email("Formato de e-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: (redirect as "/painel") || "/painel", search: {} });
  };

  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse seu agente Mika"
      footer={
        <>
          Não tem conta?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/recuperar-senha" className="text-xs text-primary hover:underline">
              Esqueci minha senha
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton redirectTo={redirect || "/painel"} />
    </AuthCard>
  );
}
