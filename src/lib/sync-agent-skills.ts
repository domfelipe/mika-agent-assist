"use client";

import { invokeFunction } from "@/lib/invoke-function";

export interface SyncAgentSkillsResponse {
  success?: boolean;
  agent_instance_id?: string;
  public_url?: string;
  public_domain?: string;
  synced_count?: number;
  runtime_response?: unknown;
}

export async function syncAgentSkills(agentInstanceId: string) {
  return await invokeFunction<SyncAgentSkillsResponse>("sync-agent-skills", {
    agent_instance_id: agentInstanceId,
  });
}
