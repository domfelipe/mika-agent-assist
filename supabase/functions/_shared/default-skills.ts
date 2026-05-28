import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type GenericDatabase = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, GenericTable>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  };
};

type SupabaseAdminClient = ReturnType<typeof createClient<GenericDatabase>>;

export interface DefaultSkillsEnsureResult {
  agent_instance_id: string;
  created_count: number;
  skipped_count: number;
  errors: string[];
}

interface DefaultSkillTemplate {
  name: string;
  description: string;
  trigger_keywords: string;
  form_inputs: Record<string, unknown>;
  markdown_content: string;
}

const DEFAULT_HERMES_SKILLS: DefaultSkillTemplate[] = [
  {
    name: "Resumo diario",
    description: "Gera um resumo curto do dia com compromissos, tarefas e proximas prioridades.",
    trigger_keywords: "resumo diario, resumo do dia, briefing diario, revisar dia",
    form_inputs: {
      name: "Resumo diario",
      description: "Gera um resumo curto do dia com compromissos, tarefas e proximas prioridades.",
      trigger_keywords: "resumo diario, resumo do dia, briefing diario, revisar dia",
      expected_inputs: "Periodo desejado e ferramentas conectadas, quando houver.",
      steps: "Consolidar agenda, tarefas e pontos pendentes. Apontar prioridades e riscos.",
      required_tools: ["calendar_optional", "tasks_optional", "notes_optional"],
      success_criteria: "Usuario recebe um resumo acionavel e curto.",
      example_use_case: "Me manda meu resumo diario as 8h.",
    },
    markdown_content: `---
name: Resumo diario
description: Gera um resumo curto do dia com compromissos, tarefas e proximas prioridades.
trigger_keywords: resumo diario, resumo do dia, briefing diario, revisar dia
---

## Quando usar

Use quando o usuario pedir um resumo do dia, briefing, revisao diaria ou preparacao rapida para comecar/encerrar o expediente.

## Inputs esperados

- Periodo desejado, se o usuario informar.
- Ferramentas conectadas relevantes, como agenda, tarefas ou notas.

## Passo a passo

1. Identifique o periodo solicitado. Se nao houver periodo, use hoje no fuso do usuario.
2. Consulte agenda, tarefas e notas quando essas integracoes estiverem disponiveis.
3. Organize a resposta em compromissos, tarefas importantes, pendencias e sugestao de foco.
4. Se uma integracao necessaria nao estiver conectada, explique isso de forma curta e ofereca um resumo com o contexto disponivel.

## Ferramentas necessarias

- Calendar opcional.
- Tasks opcional.
- Notes opcional.

## Criterio de sucesso

O usuario recebe um resumo curto, confiavel e acionavel, sem inventar dados ausentes.

## Exemplo

"Me manda meu resumo diario as 8h."`,
  },
  {
    name: "Planejamento semanal",
    description:
      "Ajuda o usuario a transformar objetivos da semana em prioridades e proximas acoes.",
    trigger_keywords:
      "planejar semana, planejamento semanal, prioridades da semana, organizar semana",
    form_inputs: {
      name: "Planejamento semanal",
      description:
        "Ajuda o usuario a transformar objetivos da semana em prioridades e proximas acoes.",
      trigger_keywords:
        "planejar semana, planejamento semanal, prioridades da semana, organizar semana",
      expected_inputs: "Objetivos, restricoes e contexto da semana.",
      steps: "Levantar objetivos, quebrar em acoes, priorizar e sugerir agenda.",
      required_tools: ["calendar_optional", "tasks_optional"],
      success_criteria: "Usuario sai com prioridades e proximas acoes claras.",
      example_use_case: "Me ajuda a planejar minha semana.",
    },
    markdown_content: `---
name: Planejamento semanal
description: Ajuda o usuario a transformar objetivos da semana em prioridades e proximas acoes.
trigger_keywords: planejar semana, planejamento semanal, prioridades da semana, organizar semana
---

## Quando usar

Use quando o usuario pedir ajuda para planejar a semana, organizar prioridades, distribuir tarefas ou revisar foco semanal.

## Inputs esperados

- Objetivos da semana.
- Prazos, reunioes ou restricoes conhecidas.
- Tarefas pendentes, se houver integracao disponivel.

## Passo a passo

1. Liste os objetivos principais mencionados pelo usuario.
2. Quebre cada objetivo em proximas acoes pequenas.
3. Sugira uma ordem de prioridade realista.
4. Se houver agenda conectada, proponha blocos de foco sem assumir disponibilidade que nao foi verificada.
5. Termine com um plano curto e facil de revisar.

## Ferramentas necessarias

- Calendar opcional.
- Tasks opcional.

## Criterio de sucesso

O usuario recebe prioridades claras, proximas acoes e uma sugestao de distribuicao da semana.

## Exemplo

"Me ajuda a planejar minha semana."`,
  },
  {
    name: "Preparar reuniao",
    description:
      "Monta um briefing rapido antes de reunioes com contexto, pauta e perguntas uteis.",
    trigger_keywords: "preparar reuniao, briefing de reuniao, pauta de reuniao, antes da reuniao",
    form_inputs: {
      name: "Preparar reuniao",
      description:
        "Monta um briefing rapido antes de reunioes com contexto, pauta e perguntas uteis.",
      trigger_keywords: "preparar reuniao, briefing de reuniao, pauta de reuniao, antes da reuniao",
      expected_inputs: "Nome da reuniao, participantes ou tema.",
      steps: "Localizar contexto, resumir objetivo, sugerir pauta e perguntas.",
      required_tools: ["calendar_optional", "email_optional", "notes_optional"],
      success_criteria: "Usuario chega preparado para a reuniao.",
      example_use_case: "Prepara meu briefing para a reuniao com o cliente.",
    },
    markdown_content: `---
name: Preparar reuniao
description: Monta um briefing rapido antes de reunioes com contexto, pauta e perguntas uteis.
trigger_keywords: preparar reuniao, briefing de reuniao, pauta de reuniao, antes da reuniao
---

## Quando usar

Use quando o usuario pedir preparacao para uma reuniao, briefing, pauta ou contexto antes de falar com alguem.

## Inputs esperados

- Nome, horario, participantes ou tema da reuniao.
- Materiais ou contexto fornecidos pelo usuario.

## Passo a passo

1. Identifique qual reuniao ou tema o usuario quer preparar.
2. Consulte agenda, emails ou notas quando houver integracao disponivel.
3. Resuma objetivo, contexto conhecido, riscos e decisoes pendentes.
4. Sugira uma pauta curta e perguntas uteis.
5. Se faltar contexto, diga exatamente o que falta.

## Ferramentas necessarias

- Calendar opcional.
- Email opcional.
- Notes opcional.

## Criterio de sucesso

O usuario recebe um briefing pratico para entrar na reuniao com clareza.

## Exemplo

"Prepara meu briefing para a reuniao com o cliente."`,
  },
];

export async function ensureDefaultSkillsForAgent(
  supabase: SupabaseAdminClient,
  agentInstanceId: string,
): Promise<DefaultSkillsEnsureResult> {
  const result: DefaultSkillsEnsureResult = {
    agent_instance_id: agentInstanceId,
    created_count: 0,
    skipped_count: 0,
    errors: [],
  };

  const { data: agentData, error: agentErr } = await supabase
    .from("agent_instances")
    .select("id, user_id")
    .eq("id", agentInstanceId)
    .maybeSingle();
  const agent = agentData as { id: string; user_id: string } | null;

  if (agentErr || !agent) {
    throw new Error(
      `agent_instance not found for default skills: ${agentErr?.message ?? agentInstanceId}`,
    );
  }

  for (const template of DEFAULT_HERMES_SKILLS) {
    const { data: existing, error: existingErr } = await supabase
      .from("skills")
      .select("id")
      .eq("user_id", agent.user_id)
      .eq("name", template.name)
      .neq("status", "archived")
      .maybeSingle();

    if (existingErr) {
      result.errors.push(
        `${template.name}: failed to check existing skill (${existingErr.message})`,
      );
      continue;
    }

    if (existing) {
      result.skipped_count += 1;
      continue;
    }

    const { data: skillData, error: skillErr } = await supabase
      .from("skills")
      .insert({
        user_id: agent.user_id,
        agent_instance_id: agent.id,
        name: template.name,
        description: template.description,
        trigger_keywords: template.trigger_keywords,
        status: "draft",
        is_default: true,
      })
      .select("id")
      .single();

    const skill = skillData as { id: string } | null;

    if (skillErr || !skill) {
      result.errors.push(
        `${template.name}: failed to create skill (${skillErr?.message ?? "unknown"})`,
      );
      continue;
    }

    const { data: versionData, error: versionErr } = await supabase
      .from("skill_versions")
      .insert({
        skill_id: skill.id,
        version_number: 1,
        markdown_content: template.markdown_content,
        form_inputs: template.form_inputs,
        is_live: true,
        created_by: agent.user_id,
      })
      .select("id")
      .single();
    const version = versionData as { id: string } | null;

    if (versionErr || !version) {
      result.errors.push(
        `${template.name}: failed to create skill version (${versionErr?.message ?? "unknown"})`,
      );
      continue;
    }

    const { error: updateErr } = await supabase
      .from("skills")
      .update({
        current_version_id: version.id,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", skill.id);

    if (updateErr) {
      result.errors.push(`${template.name}: failed to publish skill (${updateErr.message})`);
      continue;
    }

    result.created_count += 1;
  }

  return result;
}
