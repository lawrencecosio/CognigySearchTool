const DEFAULT_SEARCH_PATH = "/v2.0/search";
const DEFAULT_QUERY_PARAM = "search";
const DEFAULT_PROJECTS_PATH = "/v2.0/projects";
const DEFAULT_FLOWS_PATH = "/v2.0/flows";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizePath(searchPath) {
  if (!searchPath.startsWith("/")) {
    return `/${searchPath}`;
  }
  return searchPath;
}

function extractItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
  }
  return [];
}

function toSearchableText(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  return [item.name, item.type, item.subType]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
}

function filterAndRankItems(items, query) {
  const normalizedQuery = query.toLowerCase();
  const scored = [];

  for (const item of items) {
    const searchable = toSearchableText(item);
    const index = searchable.indexOf(normalizedQuery);
    if (index >= 0) {
      scored.push({ item, score: index });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry) => entry.item);
}

async function fetchCognigyJson(url, apiKey) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey
    }
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      const contentType = response.headers.get("content-type") || "unknown";
      const preview = text.slice(0, 120).replace(/\s+/g, " ");
      throw new Error(
        `Cognigy API returned non-JSON response (status ${response.status}, content-type ${contentType}): ${preview}`
      );
    }
  }

  if (!response.ok) {
    const upstreamMessage =
      payload && typeof payload === "object" && (payload.error || payload.detail || payload.title)
        ? String(payload.error || payload.detail || payload.title)
        : `HTTP ${response.status}`;
    throw new Error(upstreamMessage);
  }

  return payload;
}

async function searchCognigy({ query, limit, projectId }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const searchPath = normalizePath(process.env.COGNIGY_SEARCH_PATH || DEFAULT_SEARCH_PATH);
  const queryParam = process.env.COGNIGY_QUERY_PARAM || DEFAULT_QUERY_PARAM;
  const defaultProjectId = process.env.COGNIGY_PROJECT_ID;
  const selectedProjectId = projectId || defaultProjectId;

  const url = new URL(`${baseUrl}${searchPath}`);
  url.searchParams.set(queryParam, query);
  url.searchParams.set("limit", String(limit));
  if (selectedProjectId) {
    url.searchParams.set("projectId", selectedProjectId);
  }

  const payload = await fetchCognigyJson(url, apiKey);

  const upstreamItems = extractItems(payload);
  const strictLocalFilter = process.env.COGNIGY_STRICT_LOCAL_FILTER === "true";
  const items = strictLocalFilter ? filterAndRankItems(upstreamItems, query) : upstreamItems;
  return {
    query,
    count: items.length,
    upstreamCount: upstreamItems.length,
    strictLocalFilter,
    items,
    raw: payload
  };
}

function getSelectedProjectId(projectId) {
  return projectId || process.env.COGNIGY_PROJECT_ID || "";
}

async function listCognigyProjects() {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const projectsPath = normalizePath(process.env.COGNIGY_PROJECTS_PATH || DEFAULT_PROJECTS_PATH);
  const defaultProjectId = process.env.COGNIGY_PROJECT_ID || "";

  const url = new URL(`${baseUrl}${projectsPath}`);
  url.searchParams.set("limit", "100");

  const payload = await fetchCognigyJson(url, apiKey);
  const items = extractItems(payload)
    .filter((item) => item && typeof item === "object" && item._id && item.name)
    .map((item) => ({ id: String(item._id), name: String(item.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    defaultProjectId,
    count: items.length,
    items
  };
}

async function listCognigyFlows({ projectId }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const flowsPath = normalizePath(process.env.COGNIGY_FLOWS_PATH || DEFAULT_FLOWS_PATH);
  const selectedProjectId = getSelectedProjectId(projectId);

  if (!selectedProjectId) {
    throw new Error("Project ID is required to list flows.");
  }

  const url = new URL(`${baseUrl}${flowsPath}`);
  url.searchParams.set("projectId", selectedProjectId);
  url.searchParams.set("limit", "100");

  const payload = await fetchCognigyJson(url, apiKey);
  const items = extractItems(payload)
    .filter((item) => item && typeof item === "object" && item._id && item.name)
    .map((item) => ({
      id: String(item._id),
      name: String(item.name),
      description: item.description ? String(item.description) : ""
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    projectId: selectedProjectId,
    count: items.length,
    items
  };
}

async function searchFlowNodes({ flowId, query }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");

  if (!flowId) {
    throw new Error("Flow ID is required for node search.");
  }

  const searchUrl = new URL(`${baseUrl}/v2.0/flows/${flowId}/chart/nodes/search`);
  searchUrl.searchParams.set("filter", query);
  const matchPayload = await fetchCognigyJson(searchUrl, apiKey);
  const matches = extractItems(matchPayload);

  const detailPromises = matches.map(async (match) => {
    const nodeId = match && typeof match === "object" ? String(match.nodeId || "") : "";
    if (!nodeId) {
      throw new Error("Node search response did not include nodeId.");
    }

    const nodeUrl = new URL(`${baseUrl}/v2.0/flows/${flowId}/chart/nodes/${nodeId}`);
    const node = await fetchCognigyJson(nodeUrl, apiKey);
    return {
      nodeId,
      nodeReferenceId: match.nodeReferenceId || "",
      matches: Array.isArray(match.matches) ? match.matches : [],
      node
    };
  });

  const items = await Promise.all(detailPromises);
  return {
    mode: "flow-node-search",
    flowId,
    query,
    count: items.length,
    items,
    raw: matchPayload
  };
}

module.exports = {
  searchCognigy,
  listCognigyProjects,
  listCognigyFlows,
  searchFlowNodes
};
