"use client";

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { AuthCard } from "@/components/mika/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Formato de e-mail inválido."),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/recuperar-senha")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    setSent(true);
    toast.success("Se houver uma conta com esse e-mail, enviamos um link de recuperação.");
  };

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Vamos te enviar um link para redefinir"
      footer={
        <Link to="/login" className="text-primary hover:underline">
          ← Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Se o e-mail informado existir em nossa base, você receberá o link em alguns minutos.
            Verifique também a pasta de spam.
          </p>
          <Button asChild variant="outline" className="rounded-lg w-full">
            <Link to="/login">Voltar para o login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar link de recuperação
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
