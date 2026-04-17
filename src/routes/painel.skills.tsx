"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/painel/skills")({
  component: SkillsLayout,
});

function SkillsLayout() {
  return <Outlet />;
}
