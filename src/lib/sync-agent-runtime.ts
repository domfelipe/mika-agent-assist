import { invokeFunction } from "@/lib/invoke-function";

type RuntimeSyncScope = "cronjobs" | "integrations" | "all";

export async function syncAgentRuntime(
  agentInstanceId: string,
  scope: RuntimeSyncScope = "all",
) {
  return await invokeFunction<{
    success: boolean;
    agent_instance_id: string;
    public_url: string;
    public_domain: string;
    cronjobs_synced_count: number;
    integrations_synced_count: number;
    runtime_responses: {
      cronjobs: unknown;
      integrations: unknown;
    };
  }>("sync-agent-runtime", {
    agent_instance_id: agentInstanceId,
    scope,
  });
}
