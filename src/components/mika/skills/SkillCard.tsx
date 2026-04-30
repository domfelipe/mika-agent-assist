"use client";

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Edit, Play, Power, Copy, Archive, RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncAgentSkills } from "@/lib/sync-agent-skills";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { SkillStatusBadge } from "./SkillStatusBadge";
import type { Skill } from "@/hooks/use-skills";
import { SkillTestPanel } from "./SkillTestPanel";

export function SkillCard({ skill }: { skill: Skill }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const isArchived = skill.status === "archived";

  async function syncRuntimeAfterMutation(actionLabel: string) {
    const { error } = await syncAgentSkills(skill.agent_instance_id);
    if (error) {
      toast.warning(`${actionLabel}, mas o sync com o container falhou.`, {
        description: error.message,
      });
    }
  }

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("skills")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", skill.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["user-limits"] });
    },
  });

  const handleToggleActive = () => {
    const next = skill.status === "active" ? "disabled" : "active";
    updateStatus.mutate(next, {
      onSuccess: async () => {
        const actionLabel = next === "active" ? "Skill ativada" : "Skill desativada";
        toast.success(actionLabel);
        await syncRuntimeAfterMutation(actionLabel);
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
    });
  };

  const handleArchive = () => {
    updateStatus.mutate("archived", {
      onSuccess: async () => {
        toast.success("Skill arquivada");
        setConfirmArchive(false);
        await syncRuntimeAfterMutation("Skill arquivada");
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao arquivar"),
    });
  };

  const handleRestore = () => {
    updateStatus.mutate("draft", {
      onSuccess: async () => {
        toast.success("Skill restaurada como rascunho");
        await syncRuntimeAfterMutation("Skill restaurada como rascunho");
      },
      onError: (e: unknown) => {
        if ((e as { code?: string })?.code === "23505") {
          toast.error("Já existe outra skill ativa com esse nome. Renomeie antes de restaurar.");
        } else {
          toast.error(e instanceof Error ? e.message : "Erro ao restaurar");
        }
      },
    });
  };

  const handleDelete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("skills").delete().eq("id", skill.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Skill deletada");
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["user-limits"] });
      setConfirmDelete(false);
      await syncRuntimeAfterMutation("Skill deletada");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao deletar"),
  });

  return (
    <>
      <div className="group rounded-xl border border-border bg-card p-5 shadow-soft hover:shadow-glow transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => navigate({ to: "/painel/skills/$id", params: { id: skill.id } })}
              className="text-left font-semibold text-base hover:text-primary transition-colors truncate w-full"
            >
              {skill.name}
            </button>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {skill.description}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-1 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isArchived ? (
                <>
                  <DropdownMenuItem onClick={handleRestore} className="cursor-pointer">
                    <RotateCcw className="h-4 w-4 mr-2" /> Restaurar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Deletar
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/painel/skills/$id" params={{ id: skill.id }}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setTestOpen(true)}
                    disabled={!skill.current_version_id}
                    className="cursor-pointer"
                  >
                    <Play className="h-4 w-4 mr-2" /> Testar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleToggleActive}
                    disabled={!skill.current_version_id && skill.status !== "active"}
                    className="cursor-pointer"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {skill.status === "active" ? "Desativar" : "Ativar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled className="cursor-not-allowed opacity-50">
                    <Copy className="h-4 w-4 mr-2" /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmArchive(true)}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Archive className="h-4 w-4 mr-2" /> Arquivar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <SkillStatusBadge status={skill.status} />
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(skill.updated_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      </div>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar esta skill?</AlertDialogTitle>
            <AlertDialogDescription>
              A skill <strong>{skill.name}</strong> ficará invisível para o agente. Você
              poderá restaurá-la depois sem perder o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove <strong>{skill.name}</strong> e todo o histórico de versões.
              Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {testOpen && skill.current_version_id && (
        <SkillTestPanel
          open={testOpen}
          onOpenChange={setTestOpen}
          skillName={skill.name}
          skillVersionId={skill.current_version_id}
          triggerKeywords={skill.trigger_keywords}
        />
      )}
    </>
  );
}
