"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, ArrowLeft, CheckCircle2, Plug } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { invokeFunction } from "@/lib/invoke-function";
import { useCreateCronjob } from "@/hooks/use-cronjobs";
import { useAvailableMcps, useUserIntegrations } from "@/hooks/use-integrations";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { useProfile } from "@/hooks/use-profile";

interface ParseResult {
  cron_expression: string;
  human_readable: string;
  action_description: string;
  required_mcp_slugs: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
  next_run_at: string | null;
}

type Step = "input" | "review" | "confirm";

interface Props {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}

export function CronjobWizard({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [naturalInput, setNaturalInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  // Form fields editáveis na revisão
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [humanReadable, setHumanReadable] = useState("");
  const [actionPrompt, setActionPrompt] = useState("");
  const [requiredMcps, setRequiredMcps] = useState<string[]>([]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const { data: profile } = useProfile();
  const { data: agent } = useAgentInstance();
  const { data: mcps = [] } = useAvailableMcps();
  const { data: integrations = [] } = useUserIntegrations();
  const createMut = useCreateCronjob();

  const tz = profile && "timezone" in profile && typeof (profile as { timezone?: string }).timezone === "string"
    ? (profile as { timezone: string }).timezone
    : "America/Sao_Paulo";

  const mcpsBySlug = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const x of mcps) m.set(x.slug, { id: x.id, name: x.name });
    return m;
  }, [mcps]);

  const connectedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const it of integrations) {
      if (it.status !== "active") continue;
      const mcp = mcps.find((m) => m.id === it.mcp_id);
      if (mcp) set.add(mcp.slug);
    }
    return set;
  }, [integrations, mcps]);

  const missingMcps = requiredMcps.filter((s) => !connectedSlugs.has(s));

  async function handleParse() {
    const trimmed = naturalInput.trim();
    if (trimmed.length < 5) {
      toast.error("Descreva a automação com mais detalhes.");
      return;
    }
    setParsing(true);
    const { data, error } = await invokeFunction<ParseResult>(
      "parse-cronjob-natural-language",
      { natural_language_input: trimmed, user_timezone: tz },
    );
    setParsing(false);
    if (error || !data) {
      toast.error(error?.message ?? "Não conseguimos interpretar. Tente reescrever.");
      return;
    }
    setParsed(data);
    // Pré-preenche campos
    const suggestedName = trimmed.length <= 60 ? trimmed : trimmed.slice(0, 57) + "...";
    setName(suggestedName);
    setDescription("");
    setCronExpression(data.cron_expression);
    setHumanReadable(data.human_readable);
    setActionPrompt(data.action_description || trimmed);
    setRequiredMcps(data.required_mcp_slugs);
    setReviewConfirmed(false);
    setStep("review");
  }

  async function handleCreate() {
    if (!agent) {
      toast.error("Agente ainda não está pronto.");
      return;
    }
    if (!name.trim()) {
      toast.error("Dê um nome à automação.");
      return;
    }
    if (!cronExpression.trim() || !actionPrompt.trim()) {
      toast.error("Preencha o cron e a ação.");
      return;
    }
    try {
      const job = await createMut.mutateAsync({
        agent_instance_id: agent.id,
        name: name.trim(),
        description: description.trim() || null,
        natural_language_input: naturalInput.trim(),
        cron_expression: cronExpression.trim(),
        human_readable: humanReadable.trim() || cronExpression.trim(),
        action_prompt: actionPrompt.trim(),
        required_mcp_slugs: requiredMcps,
        timezone: tz,
        next_run_at: parsed?.next_run_at ?? null,
      });
      toast.success("Automação criada!");
      onCreated?.(job.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar automação";
      toast.error(msg);
    }
  }

  // STEP 1 — Input
  if (step === "input") {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <Label htmlFor="nl-input" className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Descreva sua automação em português
          </Label>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Diga o quê, quando e quais ferramentas usar. A IA traduz para um cronjob.
          </p>
          <Textarea
            id="nl-input"
            value={naturalInput}
            onChange={(e) => setNaturalInput(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="Ex: todo dia útil às 9h, me envie um resumo dos e-mails do Gmail recebidos no dia anterior."
            disabled={parsing}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {naturalInput.length}/1000 — Fuso: {tz}
            </span>
          </div>

          <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Exemplos:</p>
            <p>• Toda segunda-feira às 8h, criar uma página no Notion com tarefas da semana.</p>
            <p>• A cada hora útil, verificar Todoist e me lembrar das tarefas atrasadas.</p>
            <p>• Todo primeiro dia do mês às 10h, enviar relatório do Cal.com por e-mail.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={parsing}>
              Cancelar
            </Button>
          )}
          <Button onClick={handleParse} disabled={parsing || naturalInput.trim().length < 5}>
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Interpretando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Interpretar com IA
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // STEP 2 — Review (obrigatório)
  if (step === "review" && parsed) {
    const confidenceColor =
      parsed.confidence === "high"
        ? "success"
        : parsed.confidence === "medium"
        ? "secondary"
        : "destructive";
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Revisar interpretação</h2>
            <Badge variant={confidenceColor as "success" | "secondary" | "destructive"}>
              Confiança: {parsed.confidence === "high" ? "alta" : parsed.confidence === "medium" ? "média" : "baixa"}
            </Badge>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Suposições da IA — confira:
                  </p>
                  <ul className="list-disc list-inside mt-1 text-muted-foreground">
                    {parsed.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="job-name">Nome</Label>
              <Input
                id="job-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Ex: Resumo diário de e-mails"
              />
            </div>
            <div>
              <Label htmlFor="job-cron">Expressão cron</Label>
              <Input
                id="job-cron"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="job-human">Quando vai rodar</Label>
            <Input
              id="job-human"
              value={humanReadable}
              onChange={(e) => setHumanReadable(e.target.value)}
            />
            {parsed.next_run_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Próxima execução:{" "}
                {new Date(parsed.next_run_at).toLocaleString("pt-BR", {
                  timeZone: tz,
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="job-action">Ação (prompt enviado ao agente)</Label>
            <Textarea
              id="job-action"
              value={actionPrompt}
              onChange={(e) => setActionPrompt(e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="job-desc">Descrição (opcional)</Label>
            <Textarea
              id="job-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div>
            <Label>Integrações necessárias</Label>
            {requiredMcps.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                Nenhuma integração externa detectada.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {requiredMcps.map((slug) => {
                  const mcp = mcpsBySlug.get(slug);
                  const connected = connectedSlugs.has(slug);
                  return (
                    <Badge
                      key={slug}
                      variant={connected ? "success" : "destructive"}
                      className="gap-1"
                    >
                      {connected ? <CheckCircle2 className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
                      {mcp?.name ?? slug}
                      {!connected && " (não conectado)"}
                    </Badge>
                  );
                })}
              </div>
            )}
            {missingMcps.length > 0 && (
              <div className="mt-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
                <p className="text-destructive font-medium">
                  Conecte as integrações faltantes antes de criar.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link to="/painel/integracoes">Ir para Integrações</Link>
                </Button>
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 mt-4 p-3 rounded-md border border-border bg-muted/30 cursor-pointer">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(e) => setReviewConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              Revisei e confirmo que a expressão cron, o horário e a ação acima estão corretos.
            </span>
          </label>
        </div>

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => setStep("input")}
            disabled={createMut.isPending}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              createMut.isPending ||
              !reviewConfirmed ||
              missingMcps.length > 0 ||
              !name.trim() ||
              !cronExpression.trim() ||
              !actionPrompt.trim()
            }
          >
            {createMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando...
              </>
            ) : (
              "Criar automação"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
