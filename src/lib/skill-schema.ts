import { z } from "zod";

export const skillFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Mínimo 2 caracteres")
    .max(60, "Máximo 60 caracteres"),
  description: z
    .string()
    .trim()
    .min(10, "Descreva em pelo menos 10 caracteres")
    .max(200, "Máximo 200 caracteres"),
  trigger_keywords: z
    .string()
    .trim()
    .min(2, "Adicione ao menos 1 palavra-chave")
    .max(200, "Máximo 200 caracteres"),
  expected_inputs: z.string().trim().max(500).nullable().optional(),
  steps: z
    .string()
    .trim()
    .min(50, "Descreva o passo a passo (mín. 50 caracteres)")
    .max(3000, "Máximo 3000 caracteres"),
  required_tools: z
    .array(z.string())
    .min(1, "Selecione pelo menos uma ferramenta"),
  success_criteria: z
    .string()
    .trim()
    .min(5, "Defina o critério de sucesso")
    .max(300, "Máximo 300 caracteres"),
  example_use_case: z.string().trim().max(500).nullable().optional(),
});

export type SkillFormValues = z.infer<typeof skillFormSchema>;

export const AVAILABLE_TOOLS = [
  "Gmail",
  "Google Calendar",
  "Google Drive",
  "Notion",
  "Cal.com",
  "Microsoft Outlook",
  "Todoist",
  "Web Search",
] as const;
