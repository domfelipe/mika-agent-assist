"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IMaskInput } from "react-imask";
import { toast } from "sonner";
import { Loader2, LogOut, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { translateAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

export const Route = createFileRoute("/painel/configuracoes")({
  component: SettingsPage,
});

const profileSchema = z.object({
  full_name: z.string().min(2, "Informe seu nome completo.").max(120),
  company_name: z.string().max(120).optional().or(z.literal("")),
  cpf_cnpj: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});
type ProfileForm = z.infer<typeof profileSchema>;

function SettingsPage() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name,
        company_name: profile.company_name ?? "",
        cpf_cnpj: profile.cpf_cnpj ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [profile, reset]);

  const cpfCnpj = watch("cpf_cnpj") || "";
  const phone = watch("phone") || "";
  const cpfCnpjDigits = cpfCnpj.replace(/\D/g, "");
  const cpfCnpjMask = cpfCnpjDigits.length > 11 ? "00.000.000/0000-00" : "000.000.000-00";

  const updateProfile = useMutation({
    mutationFn: async (data: ProfileForm) => {
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          company_name: data.company_name || null,
          cpf_cnpj: data.cpf_cnpj || null,
          phone: data.phone || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(translateAuthError(e.message)),
  });

  const signOutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Saiu de todos os dispositivos.");
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-8 max-w-2xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-1 text-muted-foreground">Gerencie seu perfil e segurança.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-semibold mb-1">Perfil</h2>
        <p className="text-sm text-muted-foreground mb-6">Informações para faturamento e suporte.</p>

        <form onSubmit={handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" {...register("full_name")} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company_name">Empresa (opcional)</Label>
            <Input id="company_name" {...register("company_name")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cpf_cnpj">CPF ou CNPJ</Label>
              <IMaskInput
                id="cpf_cnpj"
                mask={cpfCnpjMask}
                value={cpfCnpj}
                onAccept={(v) => setValue("cpf_cnpj", v as string, { shouldValidate: true })}
                placeholder="000.000.000-00"
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <IMaskInput
                id="phone"
                mask="(00) 00000-0000"
                value={phone}
                onAccept={(v) => setValue("phone", v as string, { shouldValidate: true })}
                placeholder="(11) 99999-9999"
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
          >
            {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-semibold mb-1">Segurança</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Para alterar sua senha, use o link de recuperação no e-mail.
        </p>
        <Button onClick={signOutAll} variant="outline" className="rounded-lg gap-2">
          <LogOut className="h-4 w-4" />
          Sair de todos os dispositivos
        </Button>
      </section>
    </div>
  );
}
