import {
  ensureRailwayServiceDomain,
  getServiceContext,
} from "./railway.ts";

interface AgentInstanceRecord {
  id: string;
  user_id: string;
  railway_service_id: string | null;
  vps_pool_id: string | null;
}

interface ActiveSkillRow {
  id: string;
  agent_instance_id: string;
  name: string;
  description: string;
  trigger_keywords: string;
  current_version_id: string;
  updated_at: string;
}

interface SkillVersionRow {
  id: string;
  version_number: number;
  markdown_content: string;
  form_inputs: Record<string, unknown> | null;
  created_at: string;
}

interface ScheduledJobRow {
  id: string;
  agent_instance_id: string;
  name: string;
  description: string | null;
  natural_language_input: string;
  cron_expression: string;
  human_readable: string;
  action_prompt: string;
  required_mcp_slugs: string[] | null;
  status: string;
  auto_paused_reason: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface AvailableMcpRow {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string;
  oauth_authorize_url: string;
  oauth_token_url: string;
  oauth_revoke_url: string | null;
  required_scopes: string[] | null;
  supports_refresh_token: boolean;
}

interface UserIntegrationRow {
  id: string;
  user_id: string;
  mcp_id: string;
  status: string;
  connected_account_email: string | null;
  connected_account_name: string | null;
  granted_scopes: string[] | null;
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  error_message: string | null;
  access_token_vault_id: string | null;
  refresh_token_vault_id: string | null;
  created_at: string;
  updated_at: string;
  mcp: AvailableMcpRow | AvailableMcpRow[] | null;
}

interface RuntimeTarget {
  serviceId: string;
  projectId: string;
  environmentId: string;
  publicUrl: string;
  publicDomain: string;
}

type RuntimeSyncScope = "cronjobs" | "integrations" | "all";

export interface AgentSkillsSyncPayload {
  agent_instance_id: string;
  synced_at: string;
  skills: Array<{
    skill_id: string;
    version_id: string;
    version_number: number;
    name: string;
    description: string;
    trigger_keywords: string;
    updated_at: string;
    created_at: string;
    form_inputs: Record<string, unknown> | null;
    markdown_content: string;
  }>;
}

export interface AgentSkillsSyncResult {
  agent_instance_id: string;
  public_url: string;
  public_domain: string;
  synced_count: number;
  response: unknown;
}

export interface AgentCronjobsSyncPayload {
  agent_instance_id: string;
  synced_at: string;
  cronjobs: Array<{
    job_id: string;
    name: string;
    description: string | null;
    natural_language_input: string;
    cron_expression: string;
    human_readable: string;
    action_prompt: string;
    required_mcp_slugs: string[];
    status: string;
    auto_paused_reason: string | null;
    last_run_at: string | null;
    next_run_at: string | null;
    timezone: string;
    created_at: string;
    updated_at: string;
  }>;
}

export interface AgentCronjobsSyncResult {
  agent_instance_id: string;
  public_url: string;
  public_domain: string;
  synced_count: number;
  response: unknown;
}

interface RuntimeManagedCronjobRecord {
  id: string;
  state?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  last_delivery_error?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

interface RuntimeCronjobsListResponse {
  cronjobs?: RuntimeManagedCronjobRecord[];
}

export interface AgentCronjobsRuntimePullResult {
  agent_instance_id: string;
  public_url: string;
  public_domain: string;
  synced_count: number;
  updated_count: number;
  response: unknown;
}

interface RuntimeMcpHint {
  server_url: string | null;
  transport: "streamable-http" | null;
  auth_mode: "oauth" | "unknown";
  notes: string[];
}

export interface AgentIntegrationsSyncPayload {
  agent_instance_id: string;
  user_id: string;
  synced_at: string;
  integrations: Array<{
    integration_id: string;
    mcp_id: string;
    slug: string;
    name: string;
    provider: string;
    description: string;
    status: string;
    connected_account_email: string | null;
    connected_account_name: string | null;
    granted_scopes: string[];
    required_scopes: string[];
    token_expires_at: string | null;
    last_refreshed_at: string | null;
    error_message: string | null;
    oauth_authorize_url: string;
    oauth_token_url: string;
    oauth_revoke_url: string | null;
    supports_refresh_token: boolean;
    access_token: string | null;
    refresh_token: string | null;
    runtime_mcp: RuntimeMcpHint;
    created_at: string;
    updated_at: string;
  }>;
}

export interface AgentIntegrationsSyncResult {
  agent_instance_id: string;
  public_url: string;
  public_domain: string;
  synced_count: number;
  response: unknown;
}

export interface AgentRuntimeSyncResult {
  agent_instance_id: string;
  public_url: string;
  public_domain: string;
  cronjobs_synced_count: number;
  integrations_synced_count: number;
  responses: {
    cronjobs: unknown;
    integrations: unknown;
  };
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value ?? "");
}

function ensureStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function ensureSkillFrontmatter(skill: {
  name: string;
  description: string;
  trigger_keywords: string;
  markdown_content: string;
}): string {
  const markdown = (skill.markdown_content ?? "").trim();
  if (markdown.startsWith("---")) {
    return markdown;
  }

  return [
    "---",
    `name: ${yamlQuoted(skill.name)}`,
    `description: ${yamlQuoted(skill.description)}`,
    `trigger_keywords: ${yamlQuoted(skill.trigger_keywords)}`,
    "---",
    "",
    markdown,
  ].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeRuntimeState(value: unknown): "scheduled" | "paused" | "completed" | "error" | null {
  switch (value) {
    case "scheduled":
    case "paused":
    case "completed":
    case "error":
      return value;
    default:
      return null;
  }
}

function normalizeRuntimeLastStatus(value: unknown): "ok" | "error" | null {
  switch (value) {
    case "ok":
    case "error":
      return value;
    default:
      return null;
  }
}

function getOfficialRuntimeMcpHint(slug: string): RuntimeMcpHint {
  switch (slug) {
    case "notion":
      return {
        server_url: "https://mcp.notion.com/mcp",
        transport: "streamable-http",
        auth_mode: "oauth",
        notes: [
          "Official hosted MCP available via interactive OAuth.",
          "Mika runtime currently uses native provider bridge tools for headless execution.",
        ],
      };
    case "todoist":
      return {
        server_url: "https://ai.todoist.net/mcp",
        transport: "streamable-http",
        auth_mode: "oauth",
        notes: [
          "Official hosted MCP available via Todoist AI MCP docs.",
          "Mika runtime currently uses native provider bridge tools for headless execution.",
        ],
      };
    case "calcom":
      return {
        server_url: "https://mcp.cal.com/mcp",
        transport: "streamable-http",
        auth_mode: "oauth",
        notes: [
          "Official hosted MCP available via interactive OAuth.",
          "Mika runtime currently uses native provider bridge tools for headless execution.",
        ],
      };
    default:
      return {
        server_url: null,
        transport: null,
        auth_mode: "unknown",
        notes: ["No official remote MCP endpoint mapped in Mika runtime yet."],
      };
  }
}

// deno-lint-ignore no-explicit-any
async function loadAgentRecord(supabase: any, agentInstanceId: string): Promise<AgentInstanceRecord> {
  const { data: agent, error: agentErr } = await supabase
    .from("agent_instances")
    .select("id, user_id, railway_service_id, vps_pool_id")
    .eq("id", agentInstanceId)
    .maybeSingle();

  if (agentErr || !agent) {
    throw new Error(`agent_instance not found: ${agentErr?.message ?? agentInstanceId}`);
  }

  return agent as AgentInstanceRecord;
}

async function loadAgentServiceTarget(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  agentInstanceId: string,
  railwayToken: string,
): Promise<{
  agent: AgentInstanceRecord;
  serviceId: string;
  projectId: string;
  environmentId: string;
}> {
  const agent = await loadAgentRecord(supabase, agentInstanceId);

  if (!agent.railway_service_id) {
    throw new Error("agent has no railway_service_id");
  }

  let projectId: string | null = null;
  let environmentId: string | null = null;

  if (agent.vps_pool_id) {
    const { data: pool, error: poolErr } = await supabase
      .from("vps_pool")
      .select("railway_project_id, railway_environment_id")
      .eq("id", agent.vps_pool_id)
      .maybeSingle();
    if (poolErr) {
      throw new Error(`failed to load vps_pool for agent ${agent.id}: ${poolErr.message}`);
    }
    projectId = pool?.railway_project_id ?? null;
    environmentId = pool?.railway_environment_id ?? null;
  }

  if (!projectId || !environmentId) {
    const ctx = await getServiceContext({
      token: railwayToken,
      serviceId: agent.railway_service_id,
    });
    projectId = projectId ?? ctx.projectId;
    environmentId = environmentId ?? ctx.environmentId;
  }

  if (!projectId || !environmentId) {
    throw new Error("failed to resolve railway project/environment for agent");
  }

  return {
    agent,
    serviceId: agent.railway_service_id,
    projectId,
    environmentId,
  };
}

export async function resolveRuntimeTarget(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
}): Promise<RuntimeTarget> {
  const target = await loadAgentServiceTarget(opts.supabase, opts.agentInstanceId, opts.railwayToken);
  const publicDomain = await ensureRailwayServiceDomain({
    token: opts.railwayToken,
    serviceId: target.serviceId,
    environmentId: target.environmentId,
    projectId: target.projectId,
  });

  return {
    serviceId: target.serviceId,
    projectId: target.projectId,
    environmentId: target.environmentId,
    publicDomain: publicDomain.domain,
    publicUrl: `https://${publicDomain.domain}`,
  };
}

// deno-lint-ignore no-explicit-any
async function vaultDecryptSecret(supabase: any, secretId: string | null): Promise<string | null> {
  if (!secretId) return null;

  const { data, error } = await supabase
    .rpc("vault_decrypt_secret", { secret_id: secretId })
    .single();

  if (error || !data) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data) && data.length > 0 && typeof data[0]?.decrypted_secret === "string") {
    return data[0].decrypted_secret;
  }

  if (typeof (data as { decrypted_secret?: unknown }).decrypted_secret === "string") {
    return (data as { decrypted_secret: string }).decrypted_secret;
  }

  return null;
}

async function postPayloadToAgent(opts: {
  publicUrl: string;
  apiKey: string;
  path: string;
  payload: unknown;
  maxAttempts?: number;
}): Promise<unknown> {
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${opts.publicUrl.replace(/\/$/, "")}${opts.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(opts.payload),
      });

      if (res.ok) {
        return await res.json().catch(() => ({}));
      }

      const detail = await res.text().catch(() => "");
      const shouldRetry = ![400, 401, 403].includes(res.status);
      lastError = new Error(`${opts.path} HTTP ${res.status}: ${detail}`);
      if (!shouldRetry || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts) {
        throw lastError;
      }
    }

    await sleep(attempt * 1000);
  }

  throw lastError ?? new Error(`${opts.path} sync failed`);
}

async function getPayloadFromAgent(opts: {
  publicUrl: string;
  apiKey: string;
  path: string;
  maxAttempts?: number;
}): Promise<unknown> {
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${opts.publicUrl.replace(/\/$/, "")}${opts.path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
        },
      });

      if (res.ok) {
        return await res.json().catch(() => ({}));
      }

      const detail = await res.text().catch(() => "");
      const shouldRetry = ![400, 401, 403].includes(res.status);
      lastError = new Error(`${opts.path} HTTP ${res.status}: ${detail}`);
      if (!shouldRetry || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts) {
        throw lastError;
      }
    }

    await sleep(attempt * 1000);
  }

  throw lastError ?? new Error(`${opts.path} fetch failed`);
}

async function pullCronjobsRuntimeStateFromTarget(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  publicUrl: string;
  publicDomain: string;
  apiKey: string;
}): Promise<AgentCronjobsRuntimePullResult> {
  const response = await getPayloadFromAgent({
    publicUrl: opts.publicUrl,
    apiKey: opts.apiKey,
    path: "/api/cronjobs",
  });

  const runtimeCronjobs = Array.isArray((response as RuntimeCronjobsListResponse)?.cronjobs)
    ? ((response as RuntimeCronjobsListResponse).cronjobs ?? [])
    : [];

  const syncedAt = new Date().toISOString();
  let updatedCount = 0;

  for (const runtimeJob of runtimeCronjobs) {
    const jobId = asNullableString(runtimeJob?.id);
    if (!jobId) continue;

    const { error } = await opts.supabase
      .from("scheduled_jobs")
      .update({
        last_run_at: asNullableString(runtimeJob.last_run_at),
        next_run_at: asNullableString(runtimeJob.next_run_at),
        runtime_state: normalizeRuntimeState(runtimeJob.state),
        runtime_last_status: normalizeRuntimeLastStatus(runtimeJob.last_status),
        runtime_last_error: asNullableString(runtimeJob.last_error),
        runtime_last_delivery_error: asNullableString(runtimeJob.last_delivery_error),
        runtime_synced_at: syncedAt,
      })
      .eq("id", jobId)
      .eq("agent_instance_id", opts.agentInstanceId);

    if (error) {
      throw new Error(`failed to reconcile runtime cronjob ${jobId}: ${error.message}`);
    }

    updatedCount += 1;
  }

  await opts.supabase
    .from("agent_instances")
    .update({ last_health_check_at: syncedAt })
    .eq("id", opts.agentInstanceId);

  return {
    agent_instance_id: opts.agentInstanceId,
    public_url: opts.publicUrl,
    public_domain: opts.publicDomain,
    synced_count: runtimeCronjobs.length,
    updated_count: updatedCount,
    response,
  };
}

export async function buildActiveSkillsPayload(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  agentInstanceId: string,
): Promise<AgentSkillsSyncPayload> {
  const { data: skillsData, error: skillsErr } = await supabase
    .from("skills")
    .select("id, agent_instance_id, name, description, trigger_keywords, current_version_id, updated_at")
    .eq("agent_instance_id", agentInstanceId)
    .eq("status", "active")
    .not("current_version_id", "is", null)
    .order("updated_at", { ascending: false });

  if (skillsErr) {
    throw new Error(`failed to load skills: ${skillsErr.message}`);
  }

  const skills = (skillsData ?? []) as ActiveSkillRow[];
  const versionIds = Array.from(
    new Set(skills.map((skill) => skill.current_version_id).filter(Boolean)),
  );

  let versionsById = new Map<string, SkillVersionRow>();
  if (versionIds.length > 0) {
    const { data: versionsData, error: versionsErr } = await supabase
      .from("skill_versions")
      .select("id, version_number, markdown_content, form_inputs, created_at")
      .in("id", versionIds);

    if (versionsErr) {
      throw new Error(`failed to load skill_versions: ${versionsErr.message}`);
    }

    versionsById = new Map(
      ((versionsData ?? []) as SkillVersionRow[]).map((version) => [version.id, version]),
    );
  }

  const payloadSkills = skills.flatMap((skill) => {
    const version = versionsById.get(skill.current_version_id);
    if (!version) return [];

    return [{
      skill_id: skill.id,
      version_id: version.id,
      version_number: version.version_number,
      name: skill.name,
      description: skill.description,
      trigger_keywords: skill.trigger_keywords,
      updated_at: skill.updated_at,
      created_at: version.created_at,
      form_inputs: version.form_inputs ?? null,
      markdown_content: ensureSkillFrontmatter({
        name: skill.name,
        description: skill.description,
        trigger_keywords: skill.trigger_keywords,
        markdown_content: version.markdown_content,
      }),
    }];
  });

  return {
    agent_instance_id: agentInstanceId,
    synced_at: new Date().toISOString(),
    skills: payloadSkills,
  };
}

export async function pushSkillsPayloadToAgent(opts: {
  publicUrl: string;
  apiKey: string;
  payload: AgentSkillsSyncPayload;
  maxAttempts?: number;
}): Promise<unknown> {
  return await postPayloadToAgent({
    publicUrl: opts.publicUrl,
    apiKey: opts.apiKey,
    path: "/api/skills/sync",
    payload: opts.payload,
    maxAttempts: opts.maxAttempts,
  });
}

export async function syncAgentSkillsSnapshot(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
  apiKey: string;
}): Promise<AgentSkillsSyncResult> {
  if (!opts.railwayToken) {
    throw new Error("RAILWAY_API_TOKEN not configured");
  }
  if (!opts.apiKey) {
    throw new Error("HERMES_API_SERVER_KEY not configured");
  }

  const payload = await buildActiveSkillsPayload(opts.supabase, opts.agentInstanceId);
  const target = await resolveRuntimeTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    railwayToken: opts.railwayToken,
  });
  const response = await pushSkillsPayloadToAgent({
    publicUrl: target.publicUrl,
    apiKey: opts.apiKey,
    payload,
  });

  return {
    agent_instance_id: opts.agentInstanceId,
    public_url: target.publicUrl,
    public_domain: target.publicDomain,
    synced_count: payload.skills.length,
    response,
  };
}

export async function buildManagedCronjobsPayload(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  agentInstanceId: string,
): Promise<AgentCronjobsSyncPayload> {
  const { data, error } = await supabase
    .from("scheduled_jobs")
    .select(
      "id, agent_instance_id, name, description, natural_language_input, cron_expression, human_readable, action_prompt, required_mcp_slugs, status, auto_paused_reason, last_run_at, next_run_at, timezone, created_at, updated_at",
    )
    .eq("agent_instance_id", agentInstanceId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`failed to load scheduled_jobs: ${error.message}`);
  }

  const rows = (data ?? []) as ScheduledJobRow[];

  return {
    agent_instance_id: agentInstanceId,
    synced_at: new Date().toISOString(),
    cronjobs: rows.map((job) => ({
      job_id: job.id,
      name: job.name,
      description: job.description ?? null,
      natural_language_input: job.natural_language_input,
      cron_expression: job.cron_expression,
      human_readable: job.human_readable,
      action_prompt: job.action_prompt,
      required_mcp_slugs: ensureStringArray(job.required_mcp_slugs),
      status: job.status,
      auto_paused_reason: job.auto_paused_reason ?? null,
      last_run_at: job.last_run_at ?? null,
      next_run_at: job.next_run_at ?? null,
      timezone: job.timezone,
      created_at: job.created_at,
      updated_at: job.updated_at,
    })),
  };
}

export async function pushCronjobsPayloadToAgent(opts: {
  publicUrl: string;
  apiKey: string;
  payload: AgentCronjobsSyncPayload;
  maxAttempts?: number;
}): Promise<unknown> {
  return await postPayloadToAgent({
    publicUrl: opts.publicUrl,
    apiKey: opts.apiKey,
    path: "/api/cronjobs/sync",
    payload: opts.payload,
    maxAttempts: opts.maxAttempts,
  });
}

export async function syncAgentCronjobsSnapshot(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
  apiKey: string;
}): Promise<AgentCronjobsSyncResult> {
  if (!opts.railwayToken) {
    throw new Error("RAILWAY_API_TOKEN not configured");
  }
  if (!opts.apiKey) {
    throw new Error("HERMES_API_SERVER_KEY not configured");
  }

  const payload = await buildManagedCronjobsPayload(opts.supabase, opts.agentInstanceId);
  const target = await resolveRuntimeTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    railwayToken: opts.railwayToken,
  });
  const response = await pushCronjobsPayloadToAgent({
    publicUrl: target.publicUrl,
    apiKey: opts.apiKey,
    payload,
  });
  const pullResult = await pullCronjobsRuntimeStateFromTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    publicUrl: target.publicUrl,
    publicDomain: target.publicDomain,
    apiKey: opts.apiKey,
  });

  return {
    agent_instance_id: opts.agentInstanceId,
    public_url: target.publicUrl,
    public_domain: target.publicDomain,
    synced_count: payload.cronjobs.length,
    response: {
      push: response,
      pull: pullResult.response,
      updated_count: pullResult.updated_count,
    },
  };
}

export async function pullAgentCronjobsRuntimeState(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
  apiKey: string;
}): Promise<AgentCronjobsRuntimePullResult> {
  if (!opts.railwayToken) {
    throw new Error("RAILWAY_API_TOKEN not configured");
  }
  if (!opts.apiKey) {
    throw new Error("HERMES_API_SERVER_KEY not configured");
  }

  const target = await resolveRuntimeTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    railwayToken: opts.railwayToken,
  });

  return await pullCronjobsRuntimeStateFromTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    publicUrl: target.publicUrl,
    publicDomain: target.publicDomain,
    apiKey: opts.apiKey,
  });
}

export async function buildManagedIntegrationsPayload(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  agentInstanceId: string,
): Promise<AgentIntegrationsSyncPayload> {
  const agent = await loadAgentRecord(supabase, agentInstanceId);

  const { data, error } = await supabase
    .from("user_integrations")
    .select(
      "id, user_id, mcp_id, status, connected_account_email, connected_account_name, granted_scopes, token_expires_at, last_refreshed_at, error_message, access_token_vault_id, refresh_token_vault_id, created_at, updated_at, mcp:available_mcps(id, slug, name, provider, description, oauth_authorize_url, oauth_token_url, oauth_revoke_url, required_scopes, supports_refresh_token)",
    )
    .eq("user_id", agent.user_id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`failed to load user_integrations: ${error.message}`);
  }

  const rows = (data ?? []) as UserIntegrationRow[];
  const integrations = [];

  for (const row of rows) {
    const mcp = Array.isArray(row.mcp) ? row.mcp[0] : row.mcp;
    if (!mcp) continue;

    const accessToken = row.status === "active"
      ? await vaultDecryptSecret(supabase, row.access_token_vault_id)
      : null;
    const refreshToken = row.status === "active"
      ? await vaultDecryptSecret(supabase, row.refresh_token_vault_id)
      : null;

    integrations.push({
      integration_id: row.id,
      mcp_id: row.mcp_id,
      slug: mcp.slug,
      name: mcp.name,
      provider: mcp.provider,
      description: mcp.description,
      status: row.status,
      connected_account_email: row.connected_account_email ?? null,
      connected_account_name: row.connected_account_name ?? null,
      granted_scopes: ensureStringArray(row.granted_scopes),
      required_scopes: ensureStringArray(mcp.required_scopes),
      token_expires_at: row.token_expires_at ?? null,
      last_refreshed_at: row.last_refreshed_at ?? null,
      error_message: row.error_message ?? null,
      oauth_authorize_url: mcp.oauth_authorize_url,
      oauth_token_url: mcp.oauth_token_url,
      oauth_revoke_url: mcp.oauth_revoke_url ?? null,
      supports_refresh_token: !!mcp.supports_refresh_token,
      access_token: accessToken,
      refresh_token: refreshToken,
      runtime_mcp: getOfficialRuntimeMcpHint(mcp.slug),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return {
    agent_instance_id: agentInstanceId,
    user_id: agent.user_id,
    synced_at: new Date().toISOString(),
    integrations,
  };
}

export async function pushIntegrationsPayloadToAgent(opts: {
  publicUrl: string;
  apiKey: string;
  payload: AgentIntegrationsSyncPayload;
  maxAttempts?: number;
}): Promise<unknown> {
  return await postPayloadToAgent({
    publicUrl: opts.publicUrl,
    apiKey: opts.apiKey,
    path: "/api/integrations/sync",
    payload: opts.payload,
    maxAttempts: opts.maxAttempts,
  });
}

export async function syncAgentIntegrationsSnapshot(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
  apiKey: string;
}): Promise<AgentIntegrationsSyncResult> {
  if (!opts.railwayToken) {
    throw new Error("RAILWAY_API_TOKEN not configured");
  }
  if (!opts.apiKey) {
    throw new Error("HERMES_API_SERVER_KEY not configured");
  }

  const payload = await buildManagedIntegrationsPayload(opts.supabase, opts.agentInstanceId);
  const target = await resolveRuntimeTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    railwayToken: opts.railwayToken,
  });
  const response = await pushIntegrationsPayloadToAgent({
    publicUrl: target.publicUrl,
    apiKey: opts.apiKey,
    payload,
  });

  return {
    agent_instance_id: opts.agentInstanceId,
    public_url: target.publicUrl,
    public_domain: target.publicDomain,
    synced_count: payload.integrations.length,
    response,
  };
}

export async function syncAgentRuntimeSnapshot(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  agentInstanceId: string;
  railwayToken: string;
  apiKey: string;
  scope?: RuntimeSyncScope;
}): Promise<AgentRuntimeSyncResult> {
  if (!opts.railwayToken) {
    throw new Error("RAILWAY_API_TOKEN not configured");
  }
  if (!opts.apiKey) {
    throw new Error("HERMES_API_SERVER_KEY not configured");
  }

  const scope = opts.scope ?? "all";
  const target = await resolveRuntimeTarget({
    supabase: opts.supabase,
    agentInstanceId: opts.agentInstanceId,
    railwayToken: opts.railwayToken,
  });

  let cronjobsSyncedCount = 0;
  let integrationsSyncedCount = 0;
  let cronjobsResponse: unknown = { skipped: true };
  let integrationsResponse: unknown = { skipped: true };

  if (scope === "cronjobs" || scope === "all") {
    const cronjobsPayload = await buildManagedCronjobsPayload(opts.supabase, opts.agentInstanceId);
    const cronjobsPushResponse = await pushCronjobsPayloadToAgent({
      publicUrl: target.publicUrl,
      apiKey: opts.apiKey,
      payload: cronjobsPayload,
    });
    const cronjobsPullResult = await pullCronjobsRuntimeStateFromTarget({
      supabase: opts.supabase,
      agentInstanceId: opts.agentInstanceId,
      publicUrl: target.publicUrl,
      publicDomain: target.publicDomain,
      apiKey: opts.apiKey,
    });
    cronjobsResponse = {
      push: cronjobsPushResponse,
      pull: cronjobsPullResult.response,
      updated_count: cronjobsPullResult.updated_count,
    };
    cronjobsSyncedCount = cronjobsPayload.cronjobs.length;
  }

  if (scope === "integrations" || scope === "all") {
    const integrationsPayload = await buildManagedIntegrationsPayload(opts.supabase, opts.agentInstanceId);
    integrationsResponse = await pushIntegrationsPayloadToAgent({
      publicUrl: target.publicUrl,
      apiKey: opts.apiKey,
      payload: integrationsPayload,
    });
    integrationsSyncedCount = integrationsPayload.integrations.length;
  }

  return {
    agent_instance_id: opts.agentInstanceId,
    public_url: target.publicUrl,
    public_domain: target.publicDomain,
    cronjobs_synced_count: cronjobsSyncedCount,
    integrations_synced_count: integrationsSyncedCount,
    responses: {
      cronjobs: cronjobsResponse,
      integrations: integrationsResponse,
    },
  };
}
