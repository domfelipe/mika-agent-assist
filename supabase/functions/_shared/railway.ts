// Helper para chamar a Railway GraphQL API (Public API).
// Docs: https://docs.railway.com/reference/public-api
const RAILWAY_GRAPHQL = "https://backboard.railway.app/graphql/v2";

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
  image: string;
  variables: Record<string, string>;
}): Promise<void> {
  // O Railway expõe variáveis via variableUpsert (uma por vez) e fonte/imagem via serviceInstanceUpdate.
  // Setamos a imagem primeiro.
  const updateSource = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  const sourceRes = await railwayQuery(
    updateSource,
    {
      serviceId: opts.serviceId,
      environmentId: opts.environmentId,
      input: { source: { image: opts.image } },
    },
    opts.token,
  );
  if (sourceRes.errors?.length) {
    throw new Error(`serviceInstanceUpdate (source) failed: ${JSON.stringify(sourceRes.errors)}`);
  }

  // Agora as variáveis. Railway recomenda variableUpsert por chave.
  const variableUpsert = `
    mutation VariableUpsert($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  for (const [name, value] of Object.entries(opts.variables)) {
    const r = await railwayQuery(
      variableUpsert,
      {
        input: {
          projectId: undefined, // será inferido pelo serviceId+environmentId
          environmentId: opts.environmentId,
          serviceId: opts.serviceId,
          name,
          value,
        },
      },
      opts.token,
    );
    if (r.errors?.length) {
      throw new Error(`variableUpsert(${name}) failed: ${JSON.stringify(r.errors)}`);
    }
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

export async function setRailwayReplicas(opts: {
  token: string;
  serviceId: string;
  environmentId: string;
  replicas: number;
}): Promise<void> {
  const mutation = `
    mutation ServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  const res = await railwayQuery(
    mutation,
    {
      serviceId: opts.serviceId,
      environmentId: opts.environmentId,
      input: { numReplicas: opts.replicas },
    },
    opts.token,
  );
  if (res.errors?.length) {
    throw new Error(`setRailwayReplicas failed: ${JSON.stringify(res.errors)}`);
  }
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
