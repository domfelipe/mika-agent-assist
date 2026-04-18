"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CronjobWizard } from "@/components/mika/cronjobs/CronjobWizard";

export const Route = createFileRoute("/painel/cronjobs/nova")({
  component: NovaCronjobPage,
});

function NovaCronjobPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/painel/cronjobs">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Nova automação</h1>
      <CronjobWizard
        onCreated={() => navigate({ to: "/painel/cronjobs" })}
        onCancel={() => navigate({ to: "/painel/cronjobs" })}
      />
    </div>
  );
}
