// Helper para chamar a Railway GraphQL API (Public API).
// Docs: https://docs.railway.com/reference/public-api
const RAILWAY_GRAPHQL = "https://backboard.railway.app/graphql/v2";

/**
 * Start command padrão dos containers Hermes.
 * - Verifica HERMES_SUSPENDED no início: se true, dorme infinitamente (agente "pausado")
 * - Aplica HERMES_SOUL_OVERRIDE em /opt/data/SOUL.md se presente
 * - Inicia o gateway Hermes
 *
 * IMPORTANTE: este comando deve ser idêntico ao configurado nos serviços Railway
 * existentes. Para serviços antigos, atualize manualmente via UI/Agent do Railway.
 */
export const HERMES_START_COMMAND =
  `/bin/bash -c 'if [ "$HERMES_SUSPENDED" = "true" ]; then echo "Agent suspended" && sleep infinity; fi && if [ -n "$HERMES_SOUL_OVERRIDE" ]; then echo "$HERMES_SOUL_OVERRIDE" > /opt/data/SOUL.md; fi && /opt/hermes/docker/entrypoint.sh gateway run'`;

export interface RailwayError {
  message: string;
  path?: string[];
  extensions?: Record<string, unknown>;
}

export async function railwayQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<{ data?: T; errors?: RailwayError[] }> {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Railway HTTP ${res.status} for query:`, query.trim().split("\n")[1]?.trim(), "vars:", JSON.stringify(variables), "body:", text);
    throw new Error(`Railway HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    console.error("Railway GraphQL errors:", JSON.stringify(json.errors), "for vars:", JSON.stringify(variables));
  }
  return json;
}

export async function createRailwayService(opts: {
  token: string;
  projectId: string;
  name: string;
}): Promise<string> {
  const mutation = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }
  `;
  const res = await railwayQuery<{ serviceCreate: { id: string; name: string } }>(
    mutation,
    { input: { projectId: opts.projectId, name: opts.name } },
    opts.token,
  );
  if (res.errors?.length) {
    throw new Error(`serviceCreate failed: ${JSON.stringify(res.errors)}`);
  }
  if (!res.data?.serviceCreate?.id) {
    throw new Error("serviceCreate returned no id");
  }
  return res.data.serviceCreate.id;
}

export async function configureRailwayService(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
  projectId?: string;
  image: string;
  variables: Record<string, string>;
  startCommand?: string;
}): Promise<void> {
  // Setamos a imagem (e startCommand opcional) primeiro.
  const updateSource = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  const sourceInput: Record<string, unknown> = { source: { image: opts.image } };
  if (opts.startCommand) {
    sourceInput.startCommand = opts.startCommand;
  }
  const sourceRes = await railwayQuery(
    updateSource,
    {
      serviceId: opts.serviceId,
      environmentId: opts.environmentId,
      input: sourceInput,
    },
    opts.token,
  );
  if (sourceRes.errors?.length) {
    throw new Error(`serviceInstanceUpdate (source) failed: ${JSON.stringify(sourceRes.errors)}`);
  }

  // Agora as variáveis. Use batch + skipDeploys para evitar um deploy/rate-limit por env var.
  if (opts.projectId) {
    await upsertRailwayVariableCollection({
      token: opts.token,
      serviceId: opts.serviceId,
      environmentId: opts.environmentId,
      projectId: opts.projectId,
      variables: opts.variables,
      skipDeploys: true,
    });
    return;
  }

  // Fallback legado caso algum caller antigo não tenha projectId.
  for (const [name, value] of Object.entries(opts.variables)) {
    await upsertRailwayVariable({
      token: opts.token,
      serviceId: opts.serviceId,
      environmentId: opts.environmentId,
      projectId: opts.projectId,
      name,
      value,
      skipDeploys: true,
    });
  }
}

export async function deployRailwayService(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
}): Promise<void> {
  const mutation = `
    mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;
  const res = await railwayQuery(
    mutation,
    { serviceId: opts.serviceId, environmentId: opts.environmentId },
    opts.token,
  );
  if (res.errors?.length) {
    throw new Error(`serviceInstanceRedeploy failed: ${JSON.stringify(res.errors)}`);
  }
}

/**
 * Upsert de várias variáveis de uma vez no serviço Railway.
 * Mais eficiente que múltiplos variableUpsert sequenciais.
 */
export async function upsertRailwayVariableCollection(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
  projectId: string;
  variables: Record<string, string>;
  replace?: boolean;
  skipDeploys?: boolean;
}): Promise<void> {
  const mutation = `
    mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;
  const input: Record<string, unknown> = {
    projectId: opts.projectId,
    environmentId: opts.environmentId,
    serviceId: opts.serviceId,
    variables: opts.variables,
    replace: opts.replace ?? false,
  };
  if (opts.skipDeploys !== undefined) input.skipDeploys = opts.skipDeploys;
  const res = await railwayQuery(mutation, { input }, opts.token);
  if (res.errors?.length) {
    throw new Error(`variableCollectionUpsert failed: ${JSON.stringify(res.errors)}`);
  }
}

/**
 * Upsert de uma única variável de ambiente no serviço Railway.
 * Para "remover" o efeito de uma variável boolean, passe value="" (string vazia).
 */
export async function upsertRailwayVariable(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
  projectId?: string;
  name: string;
  value: string;
  skipDeploys?: boolean;
}): Promise<void> {
  const mutation = `
    mutation VariableUpsert($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  const input: Record<string, unknown> = {
    environmentId: opts.environmentId,
    serviceId: opts.serviceId,
    name: opts.name,
    value: opts.value,
  };
  if (opts.projectId) input.projectId = opts.projectId;
  if (opts.skipDeploys !== undefined) input.skipDeploys = opts.skipDeploys;

  const res = await railwayQuery(mutation, { input }, opts.token);
  if (res.errors?.length) {
    throw new Error(`variableUpsert(${opts.name}) failed: ${JSON.stringify(res.errors)}`);
  }
}

/**
 * Suspende ou retoma um serviço Hermes via flag HERMES_SUSPENDED + redeploy.
 * Railway não suporta stop sem redeploy — a abordagem oficial é controlar
 * via env var consumida pelo start command (ver HERMES_START_COMMAND).
 *
 * suspend=true  → seta HERMES_SUSPENDED=true e redeploy (container fica em sleep infinity)
 * suspend=false → seta HERMES_SUSPENDED="" e redeploy (container sobe normalmente)
 */
export async function setHermesSuspended(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
  projectId?: string;
  suspend: boolean;
}): Promise<void> {
  await upsertRailwayVariable({
    token: opts.token,
    serviceId: opts.serviceId,
    environmentId: opts.environmentId,
    projectId: opts.projectId,
    name: "HERMES_SUSPENDED",
    value: opts.suspend ? "true" : "",
    skipDeploys: true,
  });

  await deployRailwayService({
    token: opts.token,
    serviceId: opts.serviceId,
    environmentId: opts.environmentId,
  });
}

/** Busca o ID de um serviço pelo nome dentro de um projeto. Retorna null se não existir. */
export async function findRailwayServiceByName(opts: {
  token: string;
  projectId: string;
  name: string;
}): Promise<string | null> {
  const query = `
    query Project($id: String!) {
      project(id: $id) {
        services { edges { node { id name } } }
      }
    }
  `;
  const res = await railwayQuery<{
    project: { services: { edges: { node: { id: string; name: string } }[] } };
  }>(query, { id: opts.projectId }, opts.token);
  if (res.errors?.length) {
    console.error("findRailwayServiceByName errors:", JSON.stringify(res.errors));
    return null;
  }
  const edges = res.data?.project?.services?.edges ?? [];
  const match = edges.find((e) => e.node.name === opts.name);
  return match?.node.id ?? null;
}

/** Busca env+project IDs do primeiro deployment de um serviço. Útil quando vps_pool_id está null. */
export async function getServiceContext(opts: {
  token: string;
  serviceId: string;
}): Promise<{ environmentId: string | null; projectId: string | null }> {
  const query = `
    query Service($id: String!) {
      service(id: $id) {
        projectId
        deployments(first: 1) {
          edges { node { environmentId } }
        }
      }
    }
  `;
  const res = await railwayQuery<{
    service: { projectId: string; deployments: { edges: { node: { environmentId: string } }[] } };
  }>(query, { id: opts.serviceId }, opts.token);
  if (res.errors?.length) {
    console.error("getServiceContext errors:", JSON.stringify(res.errors));
    return { environmentId: null, projectId: null };
  }
  return {
    environmentId: res.data?.service?.deployments?.edges?.[0]?.node?.environmentId ?? null,
    projectId: res.data?.service?.projectId ?? null,
  };
}

/** @deprecated use getServiceContext */
export async function getServiceEnvironmentId(opts: {
  token: string;
  serviceId: string;
}): Promise<string | null> {
  return (await getServiceContext(opts)).environmentId;
}

/** Apaga o webhook do Telegram para que o Hermes assuma via polling. */
export async function deleteTelegramWebhook(botToken: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deleteWebhook failed: ${res.status} ${text}`);
  }
}
