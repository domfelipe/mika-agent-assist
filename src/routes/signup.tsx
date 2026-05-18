"use client";

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { passwordStrength } from "@/lib/password";
import { AuthCard } from "@/components/mika/AuthCard";
import { GoogleButton } from "@/components/mika/GoogleButton";
import { PasswordStrengthMeter } from "@/components/mika/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type SignupSearch = {
  plan?: string;
  cycle?: "monthly" | "yearly";
};

const schema = z.object({
  full_name: z.string().min(2, "Informe seu nome completo.").max(120),
  email: z.string().email("Formato de e-mail inválido."),
  password: z
    .string()
    .min(8, "A senha precisa de pelo menos 8 caracteres, 1 maiúscula e 1 número.")
    .refine((v) => /[A-Z]/.test(v), "A senha precisa de pelo menos 1 maiúscula.")
    .refine((v) => /\d/.test(v), "A senha precisa de pelo menos 1 número."),
  accept_terms: z.literal(true, { message: "Você precisa aceitar os termos." }),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
    cycle: search.cycle === "yearly" || search.cycle === "monthly" ? search.cycle : undefined,
  }),
  head: () => {
    const title = "Criar conta na Mika — Comece seu agente de IA";
    const ogTitle = "Criar conta na Mika";
    const description =
      "Crie sua conta Mika em minutos e tenha um agente de IA pessoal no Telegram. Garantia de 30 dias para reembolso integral.";
    const ogDescription =
      "Comece em minutos. Agente de IA pessoal no Telegram com garantia de 30 dias.";
    const url = "https://mika.domco.ai/signup";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: ogTitle },
        { property: "og:description", content: ogDescription },
        { property: "og:url", content: url },
        { name: "twitter:title", content: ogTitle },
        { name: "twitter:description", content: ogDescription },
        { name: "robots", content: "noindex,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SignupPage,
});

function SignupPage() {
  const { plan, cycle } = Route.useSearch();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { accept_terms: false as unknown as true },
  });

  const password = watch("password") || "";

  const onSubmit = async (data: FormValues) => {
    if (passwordStrength(data.password) < 2) {
      toast.error("Escolha uma senha mais forte.");
      return;
    }
    setSubmitting(true);
    const { data: signupData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        emailRedirectTo: `${window.location.origin}/painel`,
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    // Sessão presente = e-mail já confirmado (auto-confirm desligado, então normalmente null)
    if (signupData.session) {
      toast.success("Conta criada!");
      if (plan && plan !== "enterprise") {
        // TODO Etapa 3: chamar create-checkout-session com plan/cycle
        navigate({ to: "/painel", search: {} });
      } else {
        navigate({ to: "/painel", search: {} });
      }
      return;
    }
    setNeedsConfirm(data.email);
  };

  const resend = async () => {
    if (!needsConfirm) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: needsConfirm });
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success("E-mail reenviado. Confira sua caixa de entrada.");
  };

  if (needsConfirm) {
    return (
      <AuthCard title="Confirme seu e-mail" subtitle={`Enviamos um link para ${needsConfirm}`}>
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Clique no link do e-mail para ativar sua conta. Não esqueça de checar a pasta de spam.
          </p>
          <Button onClick={resend} variant="outline" className="rounded-lg w-full">
            Reenviar e-mail de confirmação
          </Button>
          <Link to="/login" className="block text-sm text-primary hover:underline">
            Voltar para o login
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle={
        plan
          ? `Plano selecionado: ${plan} · ${cycle === "yearly" ? "anual" : "mensal"}`
          : "Comece em menos de 1 minuto"
      }
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nome completo</Label>
          <Input id="full_name" autoComplete="name" {...register("full_name")} />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          <PasswordStrengthMeter password={password} />
        </div>

        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="accept_terms"
            onCheckedChange={(v) =>
              setValue("accept_terms", v === true ? true : (false as unknown as true), {
                shouldValidate: true,
              })
            }
          />
          <Label htmlFor="accept_terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
            Li e aceito os{" "}
            <a href="/termos" className="text-primary hover:underline">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </a>
            .
          </Label>
        </div>
        {errors.accept_terms && (
          <p className="text-xs text-destructive">{errors.accept_terms.message}</p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar conta
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton redirectTo="/painel" />
    </AuthCard>
  );
}
