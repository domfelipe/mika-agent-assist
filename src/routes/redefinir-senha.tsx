"use client";

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { passwordStrength } from "@/lib/password";
import { AuthCard } from "@/components/mika/AuthCard";
import { PasswordStrengthMeter } from "@/components/mika/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "A senha precisa de pelo menos 8 caracteres, 1 maiúscula e 1 número.")
      .refine((v) => /[A-Z]/.test(v), "A senha precisa de pelo menos 1 maiúscula.")
      .refine((v) => /\d/.test(v), "A senha precisa de pelo menos 1 número."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/redefinir-senha")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const password = watch("password") || "";

  const onSubmit = async (data: FormValues) => {
    if (passwordStrength(data.password) < 2) {
      toast.error("Escolha uma senha mais forte.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setSubmitting(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success("Senha redefinida com sucesso. Faça login.");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <AuthCard title="Definir nova senha" subtitle="Escolha uma senha forte">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          <PasswordStrengthMeter password={password} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Redefinir senha
        </Button>
      </form>
    </AuthCard>
  );
}
