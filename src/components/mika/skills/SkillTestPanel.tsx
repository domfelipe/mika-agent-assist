"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  skillVersionId: string;
  triggerKeywords?: string;
  // se não houver skill_version_id ainda (preview), passa o markdown direto e usa stateless mode
  stateless?: { markdown_content: string };
}

interface TestResult {
  status: "success" | "error";
  test_output?: string;
  duration_ms: number;
  error_message?: string;
}

export function SkillTestPanel({
  open,
  onOpenChange,
  skillName,
  skillVersionId,
  triggerKeywords,
  stateless,
}: Props) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const placeholder = triggerKeywords
    ? `Ex: "${triggerKeywords.split(",")[0]?.trim() || "..."}"`
    : "Digite um exemplo de input que você daria ao Mika para acionar esta skill";

  const history = useQuery({
    queryKey: ["skill-test-runs", skillVersionId],
    enabled: open && !stateless,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_test_runs")
        .select("*")
        .eq("skill_version_id", skillVersionId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runTest = useMutation({
    mutationFn: async (): Promise<TestResult> => {
      if (stateless) {
        // Modo preview sem persistência: chama AI direto via edge function
        const start = Date.now();
        const { data, error } = await supabase.functions.invoke("test-skill-dry-run", {
          body: { skill_version_id: skillVersionId, test_input: input },
        });
        if (error) {
          return {
            status: "error",
            duration_ms: Date.now() - start,
            error_message: error.message,
          };
        }
        return data as TestResult;
      }
      const { data, error } = await supabase.functions.invoke("test-skill-dry-run", {
        body: { skill_version_id: skillVersionId, test_input: input },
      });
      if (error) throw new Error(error.message);
      return data as TestResult;
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["skill-test-runs", skillVersionId] });
    },
    onError: (e: unknown) => {
      setResult({
        status: "error",
        duration_ms: 0,
        error_message: e instanceof Error ? e.message : "Erro desconhecido",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Testar skill: <span className="text-primary">{skillName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">
              Digite um exemplo de input
            </label>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="resize-none"
              disabled={runTest.isPending}
            />
          </div>

          <Button
            onClick={() => runTest.mutate()}
            disabled={!input.trim() || runTest.isPending}
            className="w-full bg-primary hover:bg-primary-dark text-primary-foreground"
          >
            {runTest.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mika está pensando...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Executar teste
              </>
            )}
          </Button>

          {result && (
            <div
              className={
                result.status === "success"
                  ? "rounded-xl border border-info/30 bg-info/5 p-4"
                  : "rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">
                  {result.status === "success" ? "Resultado do teste" : "Erro no teste"}
                </h3>
                {result.status === "success" && (
                  <Badge variant="info">
                    Dry-run
                  </Badge>
                )}
                <button onClick={() => setResult(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="text-sm whitespace-pre-wrap">
                {result.status === "success" ? result.test_output : result.error_message}
              </div>
              {result.duration_ms > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Executado em {(result.duration_ms / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          )}

          {!stateless && history.data && history.data.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Histórico ({history.data.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {history.data.map((run) => (
                  <div key={run.id} className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <Badge
                        variant="outline"
                        className={
                          run.status === "success"
                            ? "bg-success/15 text-success border-success/30"
                            : "bg-destructive/15 text-destructive border-destructive/30"
                        }
                      >
                        {run.status === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="font-medium text-foreground/80 truncate">{run.test_input}</p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            O teste em modo simulação não executa ferramentas reais. Em breve você poderá
            testar a skill diretamente no seu agente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
