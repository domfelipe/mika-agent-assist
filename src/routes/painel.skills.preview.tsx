"use client";

import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useState, lazy, Suspense, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileText, Loader2, Play, Save } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAgentInstance } from "@/hooks/use-agent-instance";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkillTestPanel } from "@/components/mika/skills/SkillTestPanel";

// Lazy-load CodeMirror to reduce initial bundle
const CodeMirrorEditor = lazy(() => import("@/components/mika/skills/SkillMarkdownEditor"));

export const Route = createFileRoute("/painel/skills/preview")({
  component: SkillPreviewPage,
});

function SkillPreviewPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { user } = useAuth();
  const agent = useAgentInstance();
  const qc = useQueryClient();

  // State passed from /painel/skills/nova
  const routerState = (router.state.location.state ?? {}) as {
    markdown_content?: string;
    form_inputs?: Record<string, unknown>;
  };

  const [markdown, setMarkdown] = useState(routerState.markdown_content ?? "");
  const formInputs = useMemo(() => routerState.form_inputs ?? {}, [routerState.form_inputs]);
  const [testOpen, setTestOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const agentId = agent.data?.id;

  const hasContent = markdown.trim().length > 0;

  // Helper: parse Supabase error codes
  const handleSupabaseError = useCallback((error: { code?: string; message?: string }) => {
    if (error.code === "P0001") {
      toast.error("Você precisa de uma assinatura ativa para criar skills.", {
        action: { label: "Ver planos", onClick: () => navigate({ to: "/", hash: "planos" }) },
      });
      return true;
    }
    if (error.code === "P0002") {
      toast.error("Você atingiu o limite de skills do seu plano. Faça upgrade ou arquive uma skill existente.");
      return true;
    }
    if (error.code === "23505") {
      toast.error("Você já tem uma skill com esse nome. Escolha outro.");
      return true;
    }
    return false;
  }, [navigate]);

  const createSkill = useCallback(async (publish: boolean) => {
    if (!user || !agentId) return;
    if (markdown.length > 50000) {
      toast.error("O conteúdo excede 50.000 caracteres. Reduza antes de salvar.");
      return;
    }

    const setter = publish ? setPublishing : setSaving;
    setter(true);

    try {
      const fi = formInputs as Record<string, unknown>;
      // 1. Create skill
      const { data: skill, error: skillErr } = await supabase
        .from("skills")
        .insert({
          user_id: user.id,
          agent_instance_id: agentId,
          name: (fi.name as string) || "Skill sem nome",
          description: (fi.description as string) || "",
          trigger_keywords: (fi.trigger_keywords as string) || "",
          status: "draft",
        })
        .select("id")
        .single();

      if (skillErr) {
        if (!handleSupabaseError(skillErr as { code?: string })) {
          toast.error(skillErr.message || "Erro ao criar skill");
        }
        return;
      }

      // 2. Create version
      const { data: ver, error: verErr } = await supabase
        .from("skill_versions")
        .insert([{
          skill_id: skill.id,
          version_number: 1,
          markdown_content: markdown,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form_inputs: formInputs as any,
          is_live: false,
          created_by: user.id,
        }])
        .select("id")
        .single();

      if (verErr) {
        toast.error(verErr.message || "Erro ao salvar versão");
        return;
      }

      // 3. Optionally publish
      if (publish) {
        const { data: pubData, error: pubErr } = await supabase.functions.invoke(
          "publish-skill-version",
          { body: { skill_version_id: ver.id } },
        );
        if (pubErr) {
          toast.error("Skill salva, mas falha ao publicar: " + pubErr.message);
        } else {
          toast.success("Skill publicada com sucesso!");
        }
      } else {
        toast.success("Rascunho salvo!");
      }

      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["user-limits"] });
      navigate({ to: "/painel/skills/$id", params: { id: skill.id } });
    } catch {
      toast.error("Erro inesperado");
    } finally {
      setter(false);
    }
  }, [user, agentId, markdown, formInputs, handleSupabaseError, navigate, qc]);

  if (!routerState.markdown_content) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Nenhum conteúdo para pré-visualizar.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/painel/skills/nova">Voltar ao formulário</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/painel/skills/nova">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Pré-visualização</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setTestOpen(true)} disabled={!hasContent}>
            <Play className="h-4 w-4 mr-1" /> Testar antes
          </Button>
          <Button variant="outline" onClick={() => createSkill(false)} disabled={saving || publishing || !hasContent}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar rascunho
          </Button>
          <Button
            onClick={() => createSkill(true)}
            disabled={saving || publishing || !hasContent}
            className="bg-primary hover:bg-primary-dark text-primary-foreground"
          >
            {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Publicar agora
          </Button>
        </div>
      </header>

      {/* Desktop: split | Mobile: tabs */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-4 min-h-[60vh]">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Suspense fallback={<EditorSkeleton />}>
            <CodeMirrorEditor value={markdown} onChange={setMarkdown} />
          </Suspense>
        </div>
        <MarkdownPreview content={markdown} />
      </div>

      <div className="lg:hidden">
        <Tabs defaultValue="preview">
          <TabsList className="w-full">
            <TabsTrigger value="editor" className="flex-1">
              <FileText className="h-4 w-4 mr-1" /> Editor
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex-1">
              <Eye className="h-4 w-4 mr-1" /> Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="mt-4 min-h-[50vh]">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Suspense fallback={<EditorSkeleton />}>
                <CodeMirrorEditor value={markdown} onChange={setMarkdown} />
              </Suspense>
            </div>
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            <MarkdownPreview content={markdown} />
          </TabsContent>
        </Tabs>
      </div>

      {testOpen && (
        <SkillTestPanel
          open={testOpen}
          onOpenChange={setTestOpen}
          skillName={(formInputs as Record<string, string>).name || "Skill"}
          skillVersionId="preview"
          triggerKeywords={(formInputs as Record<string, string>).trigger_keywords}
          stateless={{ markdown_content: markdown }}
        />
      )}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 overflow-auto max-h-[80vh] prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex items-center justify-center h-60">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
