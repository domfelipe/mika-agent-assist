"use client";

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Play, Rocket, Save, MoreVertical, Copy, Archive, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSkill } from "@/hooks/use-skills";
import { SkillStatusBadge } from "@/components/mika/skills/SkillStatusBadge";
import { SkillTestPanel } from "@/components/mika/skills/SkillTestPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CodeMirrorEditor = lazy(() => import("@/components/mika/skills/SkillMarkdownEditor"));

export const Route = createFileRoute("/painel/skills/$id")({
  component: SkillDetailPage,
});

interface SkillVersion {
  id: string;
  version_number: number;
  markdown_content: string;
  form_inputs: Record<string, unknown>;
  is_live: boolean;
  created_at: string;
}

function SkillDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const skill = useSkill(id);

  const versions = useQuery({
    queryKey: ["skill-versions", id],
    enabled: !!id,
    queryFn: async (): Promise<SkillVersion[]> => {
      const { data, error } = await supabase
        .from("skill_versions")
        .select("id, version_number, markdown_content, form_inputs, is_live, created_at")
        .eq("skill_id", id)
        .order("version_number", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as SkillVersion[];
    },
  });

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [editing, setEditing] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Sync markdown when versions load or selection changes
  const currentVersion = versions.data?.find((v) =>
    selectedVersionId ? v.id === selectedVersionId : v.is_live,
  ) ?? versions.data?.[0];

  if (currentVersion && markdown === "" && !editing) {
    // initial load
    setTimeout(() => setMarkdown(currentVersion.markdown_content), 0);
  }

  const selectVersion = useCallback(
    (v: SkillVersion) => {
      setSelectedVersionId(v.id);
      setMarkdown(v.markdown_content);
      setEditing(false);
    },
    [],
  );

  // Save new version
  const saveVersion = useMutation({
    mutationFn: async () => {
      if (!user || !versions.data) throw new Error("Dados indisponíveis");
      const maxVer = Math.max(...versions.data.map((v) => v.version_number), 0);
      const { data, error } = await supabase
        .from("skill_versions")
        .insert([{
          skill_id: id,
          version_number: maxVer + 1,
          markdown_content: markdown,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form_inputs: (currentVersion?.form_inputs ?? {}) as any,
          is_live: false,
          created_by: user.id,
        }])
        .select("id, version_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Versão ${data.version_number} salva`);
      setSelectedVersionId(data.id);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  // Publish version
  const publishVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await supabase.functions.invoke("publish-skill-version", {
        body: { skill_version_id: versionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.no_op) {
        toast.info("Esta versão já está publicada");
      } else {
        toast.success(`Versão ${data.version_number} publicada!`);
      }
      qc.invalidateQueries({ queryKey: ["skill-versions", id] });
      qc.invalidateQueries({ queryKey: ["skill", id] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro";
      if (msg.includes("409")) {
        toast.error("Conflito de concorrência. Recarregue e tente novamente.");
      } else {
        toast.error(msg);
      }
    },
  });

  // Archive
  const archiveSkill = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("skills")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Skill arquivada");
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["user-limits"] });
      navigate({ to: "/painel/skills" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const loading = skill.isLoading || versions.isLoading;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-[60vh] rounded-xl" />
      </div>
    );
  }

  if (!skill.data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Skill não encontrada.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/painel/skills">Voltar</Link>
        </Button>
      </div>
    );
  }

  const isCurrentLive = currentVersion?.is_live === true;
  const hasChanged = editing && markdown !== currentVersion?.markdown_content;

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/painel/skills">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{skill.data.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <SkillStatusBadge status={skill.data.status} />
              {currentVersion && (
                <span className="text-xs text-muted-foreground">
                  v{currentVersion.version_number}
                  {currentVersion.is_live && " (live)"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
            disabled={!currentVersion}
          >
            <Play className="h-4 w-4 mr-1" /> Testar
          </Button>

          {editing && hasChanged && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveVersion.mutate()}
              disabled={saveVersion.isPending}
            >
              {saveVersion.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Salvar nova versão
            </Button>
          )}

          {!editing && currentVersion && !isCurrentLive && (
            <Button
              size="sm"
              onClick={() => publishVersion.mutate(currentVersion.id)}
              disabled={publishVersion.isPending}
              className="bg-primary hover:bg-primary-dark text-primary-foreground"
            >
              {publishVersion.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-1" />
              )}
              Publicar esta versão
            </Button>
          )}

          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="opacity-50">
                <Copy className="h-4 w-4 mr-2" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmArchive(true)}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <Archive className="h-4 w-4 mr-2" /> Arquivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-[60vh]">
        {/* Editor / Preview (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Desktop split */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Suspense fallback={<Skeleton className="h-60" />}>
                <CodeMirrorEditor
                  value={markdown}
                  onChange={(v) => { setMarkdown(v); if (!editing) setEditing(true); }}
                  readOnly={!editing}
                />
              </Suspense>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 overflow-auto max-h-[80vh] prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          </div>
          {/* Mobile tabs */}
          <div className="lg:hidden">
            <Tabs defaultValue="preview">
              <TabsList className="w-full">
                <TabsTrigger value="editor" className="flex-1">Editor</TabsTrigger>
                <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="editor" className="mt-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <Suspense fallback={<Skeleton className="h-60" />}>
                    <CodeMirrorEditor
                      value={markdown}
                      onChange={(v) => { setMarkdown(v); if (!editing) setEditing(true); }}
                      readOnly={!editing}
                    />
                  </Suspense>
                </div>
              </TabsContent>
              <TabsContent value="preview" className="mt-4">
                <div className="rounded-xl border border-border bg-card p-6 overflow-auto prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Timeline sidebar (1 col) */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 lg:sticky lg:top-24">
            <h3 className="font-semibold text-sm">Versões</h3>
            {versions.data?.map((v) => (
              <button
                key={v.id}
                onClick={() => selectVersion(v)}
                className={`w-full text-left rounded-lg p-3 transition-colors text-sm ${
                  currentVersion?.id === v.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">v{v.version_number}</span>
                  {v.is_live && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                      Live
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}
                </p>
                {!v.is_live && currentVersion?.id !== v.id && (
                  <button
                    className="text-xs text-primary hover:underline mt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      publishVersion.mutate(v.id);
                    }}
                  >
                    Restaurar
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Test panel */}
      {testOpen && currentVersion && (
        <SkillTestPanel
          open={testOpen}
          onOpenChange={setTestOpen}
          skillName={skill.data?.name ?? "Skill"}
          skillVersionId={currentVersion.id}
          triggerKeywords={skill.data?.trigger_keywords}
        />
      )}

      {/* Archive dialog */}
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar esta skill?</AlertDialogTitle>
            <AlertDialogDescription>
              A skill ficará invisível para o agente. Você poderá restaurá-la depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveSkill.mutate()}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
