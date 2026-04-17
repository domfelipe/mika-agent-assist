"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Check, CircleDashed, Loader2, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { skillFormSchema, AVAILABLE_TOOLS, type SkillFormValues } from "@/lib/skill-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/painel/skills/nova")({
  component: NovaSkillPage,
});

const FIELDS_META: { key: keyof SkillFormValues; label: string; required: boolean }[] = [
  { key: "name", label: "Nome", required: true },
  { key: "description", label: "Descrição", required: true },
  { key: "trigger_keywords", label: "Gatilhos", required: true },
  { key: "expected_inputs", label: "Inputs esperados", required: false },
  { key: "steps", label: "Passo a passo", required: true },
  { key: "required_tools", label: "Ferramentas", required: true },
  { key: "success_criteria", label: "Critério de sucesso", required: true },
  { key: "example_use_case", label: "Exemplo de uso", required: false },
];

function NovaSkillPage() {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: {
      name: "",
      description: "",
      trigger_keywords: "",
      expected_inputs: "",
      steps: "",
      required_tools: [],
      success_criteria: "",
      example_use_case: "",
    },
    mode: "onChange",
  });

  const values = form.watch();
  const { isValid } = form.formState;

  const fieldFilled = (key: keyof SkillFormValues): boolean => {
    const v = values[key];
    if (key === "required_tools") return Array.isArray(v) && v.length > 0;
    return typeof v === "string" && v.trim().length > 0;
  };

  const handleGenerate = async () => {
    const valid = await form.trigger();
    if (!valid) return;
    setGenerating(true);
    try {
      const formValues = form.getValues();
      const formInputs = {
        name: formValues.name,
        description: formValues.description,
        trigger_keywords: formValues.trigger_keywords,
        expected_inputs: formValues.expected_inputs || null,
        steps: formValues.steps,
        required_tools: formValues.required_tools,
        success_criteria: formValues.success_criteria,
        example_use_case: formValues.example_use_case || null,
      };

      const { data, error } = await supabase.functions.invoke("generate-skill-markdown", {
        body: { form_inputs: formInputs },
      });

      if (error) {
        const msg = error.message || "Falha ao gerar skill";
        if (msg.includes("429") || msg.includes("Muitas")) {
          toast.error("Muitas requisições. Aguarde 1 minuto e tente novamente.");
        } else {
          toast.error(msg);
        }
        return;
      }

      // Navigate to preview with state
      navigate({
        to: "/painel/skills/preview",
        search: {},
        state: {
          markdown_content: data.markdown_content,
          form_inputs: formInputs,
        } as Record<string, unknown>,
      });
    } catch (e) {
      toast.error("Erro inesperado ao gerar skill. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/painel/skills">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nova skill</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os campos e gere o conteúdo com IA
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form column */}
        <div className="lg:col-span-2 space-y-5">
          <FormField label="Nome" helperText="Nome curto para identificar a skill" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} placeholder="Ex: Agendar reunião" maxLength={60} />
          </FormField>

          <FormField label="Descrição" helperText="O que essa skill faz, em uma frase" error={form.formState.errors.description?.message}>
            <Textarea {...form.register("description")} placeholder="Ex: Cria eventos no Google Calendar a partir de instruções naturais" rows={2} maxLength={200} />
          </FormField>

          <FormField label="Gatilhos / palavras-chave" helperText="Quando o Mika deve acionar esta skill" error={form.formState.errors.trigger_keywords?.message}>
            <Input {...form.register("trigger_keywords")} placeholder="Ex: agendar, marcar reunião, criar evento" maxLength={200} />
          </FormField>

          <FormField label="Inputs esperados" helperText="(Opcional) Que informações o usuário deve fornecer">
            <Textarea {...form.register("expected_inputs")} placeholder="Ex: data, hora, participantes, assunto" rows={2} maxLength={500} />
          </FormField>

          <FormField label="Passo a passo" helperText="Descreva o que o Mika deve fazer (mín. 50 chars)" error={form.formState.errors.steps?.message}>
            <Textarea
              {...form.register("steps")}
              placeholder="1. Extrair data e hora do input do usuário&#10;2. Verificar disponibilidade no Google Calendar&#10;3. Criar o evento com os participantes&#10;4. Enviar confirmação ao usuário"
              rows={5}
              maxLength={3000}
            />
          </FormField>

          <FormField label="Ferramentas necessárias" helperText="Quais serviços o Mika vai precisar" error={form.formState.errors.required_tools?.message}>
            <Controller
              control={form.control}
              name="required_tools"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const selected = field.value?.includes(tool);
                    return (
                      <Badge
                        key={tool}
                        variant={selected ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer transition-colors select-none",
                          selected
                            ? "bg-primary text-primary-foreground hover:bg-primary-dark"
                            : "hover:bg-muted",
                        )}
                        onClick={() => {
                          const next = selected
                            ? field.value.filter((t) => t !== tool)
                            : [...(field.value ?? []), tool];
                          field.onChange(next);
                        }}
                      >
                        {tool}
                      </Badge>
                    );
                  })}
                </div>
              )}
            />
          </FormField>

          <FormField label="Critério de sucesso" helperText="Como saber se a skill foi executada corretamente" error={form.formState.errors.success_criteria?.message}>
            <Input {...form.register("success_criteria")} placeholder="Ex: evento criado com data e participantes corretos" maxLength={300} />
          </FormField>

          <FormField label="Exemplo de uso" helperText="(Opcional) Uma situação concreta de uso">
            <Textarea {...form.register("example_use_case")} placeholder='Ex: "Mika, agenda uma reunião com o João amanhã às 14h"' rows={2} maxLength={500} />
          </FormField>
        </div>

        {/* Sticky checklist column */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h3 className="font-semibold text-sm mb-4">Checklist</h3>
              <ul className="space-y-2.5">
                {FIELDS_META.map((f) => {
                  const done = fieldFilled(f.key);
                  return (
                    <li key={f.key} className="flex items-center gap-2 text-sm">
                      {done ? (
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={done ? "text-foreground" : "text-muted-foreground"}>
                        {f.label}
                        {!f.required && " (opcional)"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!isValid || generating}
              className="w-full rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground h-12 text-base"
            >
              {generating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Gerando sua skill...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Gerar com IA
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  helperText,
  error,
  children,
}: {
  label: string;
  helperText?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
