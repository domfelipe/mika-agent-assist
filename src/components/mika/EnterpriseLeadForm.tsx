"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { IMaskInput } from "react-imask";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const schema = z.object({
  company_name: z.string().min(2, "Informe o nome da empresa").max(120),
  contact_name: z.string().min(2, "Informe seu nome").max(120),
  email: z.string().email("Formato de e-mail inválido."),
  phone: z.string().min(14, "Telefone inválido").max(20),
  team_size: z.enum(["1-10", "11-50", "51-200", "200+"], { message: "Selecione o tamanho da equipe" }),
  message: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function EnterpriseLeadForm() {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    const { error } = await supabase.from("enterprise_leads").insert({
      company_name: data.company_name,
      contact_name: data.contact_name,
      email: data.email,
      phone: data.phone,
      team_size: data.team_size,
      message: data.message || null,
      status: "new",
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateAuthError(error.message));
      return;
    }
    toast.success("Recebemos seu contato! Falamos com você em até 1 dia útil.");
    reset();
  };

  const phone = watch("phone") || "";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="company_name">Empresa</Label>
          <Input id="company_name" {...register("company_name")} placeholder="Acme S/A" />
          {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_name">Seu nome</Label>
          <Input id="contact_name" {...register("contact_name")} placeholder="Maria Silva" />
          {errors.contact_name && <p className="text-xs text-destructive">{errors.contact_name.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail corporativo</Label>
          <Input id="email" type="email" {...register("email")} placeholder="voce@empresa.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <IMaskInput
            id="phone"
            mask="(00) 00000-0000"
            value={phone}
            onAccept={(value) => setValue("phone", value as string, { shouldValidate: true })}
            placeholder="(11) 99999-9999"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="team_size">Tamanho da equipe</Label>
        <Select onValueChange={(v) => setValue("team_size", v as FormValues["team_size"], { shouldValidate: true })}>
          <SelectTrigger id="team_size"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1-10">1-10 pessoas</SelectItem>
            <SelectItem value="11-50">11-50 pessoas</SelectItem>
            <SelectItem value="51-200">51-200 pessoas</SelectItem>
            <SelectItem value="200+">200+ pessoas</SelectItem>
          </SelectContent>
        </Select>
        {errors.team_size && <p className="text-xs text-destructive">{errors.team_size.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">Mensagem (opcional)</Label>
        <Textarea id="message" {...register("message")} rows={3} placeholder="Conta um pouco do seu caso de uso…" />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground transition-all duration-150 active:scale-[0.98]"
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar
      </Button>
    </form>
  );
}
