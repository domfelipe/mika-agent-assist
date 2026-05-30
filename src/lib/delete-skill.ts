"use client";

import { invokeFunction } from "@/lib/invoke-function";

export interface DeleteSkillResponse {
  success: boolean;
  skill_id: string;
  agent_instance_id: string;
  archived: boolean;
  deleted: boolean;
  runtime_sync_warning: string | null;
}

export async function deleteSkill(
  skillId: string,
  action: "archive" | "delete" = "archive",
) {
  return await invokeFunction<DeleteSkillResponse>("delete-skill", {
    skill_id: skillId,
    action,
  });
}
