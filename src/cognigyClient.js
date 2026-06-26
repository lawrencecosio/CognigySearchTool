const DEFAULT_SEARCH_PATH = "/v2.0/search";
const DEFAULT_QUERY_PARAM = "search";
const DEFAULT_PROJECTS_PATH = "/v2.0/projects";
const DEFAULT_FLOWS_PATH = "/v2.0/flows";

// Node types (normalized: lowercase, no spaces/hyphens/underscores) that can
// reference another flow. Filtering to these before fetching full node details
// avoids unnecessary API calls for say/question/condition/etc. nodes.
const CALLER_NODE_TYPES = new Set(["executeflow", "goto"]);

function normalizeNodeType(type) {
  return String(type).toLowerCase().replace(/[\s_-]/g, "");
}

// Extracts the last path segment of a URL href as an ID.
// e.g. ".../flows/abc123/intents/def456" → "def456"
function extractIdFromHref(href) {
  if (!href || typeof href !== "string") return "";
  return href.split("?")[0].split("/").pop() || "";
}

// Creates a concurrency-limited fetch wrapper. At most `maxConcurrent` calls
// to fetchCognigyJson will be in-flight at any time across all usages of the
// returned function within a single invocation.
function makeConcurrentFetcher(apiKey, maxConcurrent = 8) {
  let activeCount = 0;
  const waitQueue = [];

  function acquireSlot() {
    if (activeCount < maxConcurrent) {
      activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waitQueue.push(resolve));
  }

  function releaseSlot() {
    if (waitQueue.length > 0) {
      // Pass our slot directly to the next waiter (activeCount stays the same).
      waitQueue.shift()();
    } else {
      activeCount--;
    }
  }

  return async function limitedFetch(url) {
    await acquireSlot();
    try {
      return await fetchCognigyJson(url, apiKey);
    } finally {
      releaseSlot();
    }
  };
}

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
    if (payload._embedded && typeof payload._embedded === "object") {
      const embeddedValues = Object.values(payload._embedded);
      for (const value of embeddedValues) {
        if (Array.isArray(value)) {
          return value;
        }
      }
    }
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
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const selfHref = item._links && item._links.self && typeof item._links.self.href === "string"
        ? item._links.self.href
        : "";
      const idMatch = selfHref.match(/\/flows\/([^/]+)$/);
      const id = item._id || (idMatch ? idMatch[1] : "");
      const referenceId =
        (item.properties && typeof item.properties.referenceId === "string" && item.properties.referenceId) ||
        (typeof item.referenceId === "string" && item.referenceId) ||
        "";
      const name =
        (item.properties && typeof item.properties.name === "string" && item.properties.name) ||
        (typeof item.name === "string" && item.name) ||
        "";
      const description =
        (item.properties && typeof item.properties.description === "string" && item.properties.description) ||
        (typeof item.description === "string" && item.description) ||
        "";

      return {
        id: String(id),
        referenceId: String(referenceId),
        name: String(name),
        description: String(description)
      };
    })
    .filter((item) => item.id && item.name)
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

  const [projectPayload, flowsPayload] = await Promise.all([
    fetchCognigyJson(new URL(`${baseUrl}/new/v2.0/projects/${selectedProjectId}`), apiKey),
    fetchCognigyJson(url, apiKey)
  ]);

  const items = extractItems(flowsPayload)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const selfHref = item._links && item._links.self && typeof item._links.self.href === "string"
        ? item._links.self.href
        : "";
      const idMatch = selfHref.match(/\/flows\/([^/]+)$/);
      const id = item._id || (idMatch ? idMatch[1] : "");
      const referenceId =
        (item.properties && typeof item.properties.referenceId === "string" && item.properties.referenceId) ||
        (typeof item.referenceId === "string" && item.referenceId) ||
        "";
      const name =
        (item.properties && typeof item.properties.name === "string" && item.properties.name) ||
        (typeof item.name === "string" && item.name) ||
        "";
      const description =
        (item.properties && typeof item.properties.description === "string" && item.properties.description) ||
        (typeof item.description === "string" && item.description) ||
        "";

      return {
        id: String(id),
        referenceId: String(referenceId),
        name: String(name),
        description: String(description)
      };
    })
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    projectId: selectedProjectId,
    primaryLocaleId: projectPayload && typeof projectPayload === "object" && projectPayload.primaryLocaleReference
      ? String(projectPayload.primaryLocaleReference)
      : "",
    count: items.length,
    items
  };
}

function filterFlowNodesByType(items, nodeType) {
  if (!nodeType) {
    return items;
  }

  const normalizedNodeType = nodeType.toLowerCase();
  return items.filter((item) => {
    const itemNodeType = item && item.node && typeof item.node === "object" ? String(item.node.type || "") : "";
    return itemNodeType.toLowerCase() === normalizedNodeType;
  });
}

function extractNodeTypesFromPayload(payload) {
  const candidateArrays = [];

  const directItems = extractItems(payload);
  if (directItems.length) {
    candidateArrays.push(directItems);
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.nodes)) {
      candidateArrays.push(payload.nodes);
    }
    if (payload.chart && typeof payload.chart === "object" && Array.isArray(payload.chart.nodes)) {
      candidateArrays.push(payload.chart.nodes);
    }
  }

  const seen = new Set();
  for (const nodes of candidateArrays) {
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        continue;
      }
      const nodeType = typeof node.type === "string" ? node.type.trim() : "";
      if (nodeType) {
        seen.add(nodeType);
      }
    }
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function extractFlowChartNodes(payload) {
  const nodes = [];
  const directItems = extractItems(payload);
  if (directItems.length) {
    nodes.push(...directItems);
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.nodes)) {
    nodes.push(...payload.nodes);
  }
  if (payload && typeof payload === "object" && payload.chart && typeof payload.chart === "object") {
    if (Array.isArray(payload.chart.nodes)) {
      nodes.push(...payload.chart.nodes);
    }
  }
  return nodes.filter((node) => node && typeof node === "object");
}

async function listFlowNodeTypes({ flowId }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");

  if (!flowId) {
    throw new Error("Flow ID is required to list node types.");
  }

  const candidatePaths = [`/v2.0/flows/${flowId}/chart/nodes`, `/v2.0/flows/${flowId}/chart`];
  const errors = [];
  const collectedTypes = new Set();

  for (const candidatePath of candidatePaths) {
    try {
      const payload = await fetchCognigyJson(new URL(`${baseUrl}${candidatePath}`), apiKey);
      const items = extractNodeTypesFromPayload(payload);
      for (const item of items) {
        collectedTypes.add(item);
      }
      if (!items.length) {
        errors.push(`${candidatePath}: no node types found`);
      }
    } catch (error) {
      errors.push(`${candidatePath}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (collectedTypes.size) {
    const items = Array.from(collectedTypes).sort((a, b) => a.localeCompare(b));
    return {
      flowId,
      count: items.length,
      items
    };
  }

  throw new Error(`Unable to load node types for flow. ${errors.join(" | ")}`);
}

async function searchFlowNodes({ flowId, query = "", nodeType = "" }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const normalizedQuery = String(query).trim();
  const normalizedNodeType = String(nodeType).trim();
  const hasQuery = Boolean(normalizedQuery);
  const hasNodeType = Boolean(normalizedNodeType);

  if (!flowId) {
    throw new Error("Flow ID is required for node search.");
  }

  if (hasQuery === hasNodeType) {
    throw new Error("Provide exactly one of query or nodeType for flow node search.");
  }

  let matchPayload = {};
  let allItems = [];

  if (hasNodeType) {
    const chartUrl = new URL(`${baseUrl}/v2.0/flows/${flowId}/chart`);
    const chartPayload = await fetchCognigyJson(chartUrl, apiKey);
    const chartNodes = extractFlowChartNodes(chartPayload);
    const matchingChartNodes = chartNodes.filter((node) => {
      const nodeTypeValue = typeof node.type === "string" ? node.type.trim().toLowerCase() : "";
      return nodeTypeValue === normalizedNodeType.toLowerCase();
    });

    const detailPromises = matchingChartNodes.map(async (node) => {
      const nodeId = String(node._id || "");
      if (!nodeId) {
        throw new Error("Flow chart node is missing _id.");
      }
      const nodeUrl = new URL(`${baseUrl}/v2.0/flows/${flowId}/chart/nodes/${nodeId}`);
      const fullNode = await fetchCognigyJson(nodeUrl, apiKey);
      return {
        nodeId,
        nodeReferenceId: node.referenceId || "",
        matches: [],
        node: fullNode
      };
    });

    allItems = await Promise.all(detailPromises);
    matchPayload = { items: matchingChartNodes };
  } else {
    const searchUrl = new URL(`${baseUrl}/v2.0/flows/${flowId}/chart/nodes/search`);
    searchUrl.searchParams.set("filter", normalizedQuery);
    matchPayload = await fetchCognigyJson(searchUrl, apiKey);
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

    allItems = await Promise.all(detailPromises);
  }

  const items = hasNodeType ? filterFlowNodesByType(allItems, normalizedNodeType) : allItems;
  return {
    mode: "flow-node-search",
    flowId,
    query: normalizedQuery,
    nodeType: normalizedNodeType,
    count: items.length,
    upstreamCount: allItems.length,
    items,
    raw: matchPayload
  };
}

async function searchAllFlowNodes({ projectId, query, limit, nodeType }) {
  if (!projectId) {
    throw new Error("Project ID is required to search all flows.");
  }
  const normalizedQuery = String(query || "").trim();
  const normalizedNodeType = String(nodeType || "").trim();
  const hasQuery = Boolean(normalizedQuery);
  const hasNodeType = Boolean(normalizedNodeType);

  if (hasQuery === hasNodeType) {
    throw new Error("Provide exactly one of query or nodeType for all-flows search.");
  }

  const flowsResult = await listCognigyFlows({ projectId });

  const settled = await Promise.allSettled(
    flowsResult.items.map(async (flow) => {
      const result = hasNodeType
        ? await searchFlowNodes({ flowId: flow.id, nodeType: normalizedNodeType })
        : await searchFlowNodes({ flowId: flow.id, query: normalizedQuery });
      return { flow, items: result.items };
    })
  );

  const allItems = [];
  const flowErrors = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const flow = flowsResult.items[i];
    if (outcome.status === "fulfilled") {
      for (const item of outcome.value.items) {
        allItems.push({
          ...item,
          flowId: flow.id,
          flowReferenceId: flow.referenceId || "",
          flowName: flow.name
        });
      }
    } else {
      flowErrors.push({
        flowId: flow.id,
        flowName: flow.name,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      });
    }
  }

  const limited = allItems.slice(0, limit);

  return {
    mode: "all-flows-node-search",
    projectId,
    query: normalizedQuery,
    nodeType: normalizedNodeType,
    flowCount: flowsResult.count,
    count: limited.length,
    flowErrors: flowErrors.length > 0 ? flowErrors : [],
    items: limited
  };
}

function scanNodeForFlowReference(value, targetId, targetReferenceId, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") {
    return value === targetId || Boolean(targetReferenceId && value === targetReferenceId);
  }
  if (Array.isArray(value)) {
    return value.some((item) => scanNodeForFlowReference(item, targetId, targetReferenceId, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value).some((v) => scanNodeForFlowReference(v, targetId, targetReferenceId, depth + 1));
  }
  return false;
}

async function findFlowCallers({ targetFlowId, projectId }) {
  if (!targetFlowId) throw new Error("targetFlowId is required.");
  if (!projectId) throw new Error("projectId is required.");

  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");

  const flowsResult = await listCognigyFlows({ projectId });
  const targetFlow = flowsResult.items.find((f) => f.id === targetFlowId);
  const targetReferenceId = targetFlow ? targetFlow.referenceId : "";
  const otherFlows = flowsResult.items.filter((f) => f.id !== targetFlowId);

  const limitedFetch = makeConcurrentFetcher(apiKey, 8);

  // For each other flow: fetch the chart (all nodes with basic metadata), then
  // fetch each node's full config and scan it recursively for the target flow's
  // _id or referenceId. The text-search endpoint does not index config fields
  // where flow references are stored, so a full scan is required.
  const settled = await Promise.allSettled(
    otherFlows.map(async (flow) => {
      const chartUrl = new URL(`${baseUrl}/v2.0/flows/${flow.id}/chart`);
      const chartPayload = await limitedFetch(chartUrl);
      const chartNodes = extractFlowChartNodes(chartPayload);

      // Only scan node types that can reference another flow — skip say/question/etc.
      const candidateNodes = chartNodes.filter((node) =>
        CALLER_NODE_TYPES.has(normalizeNodeType(node.type || ""))
      );

      const nodeDetailResults = await Promise.allSettled(
        candidateNodes.map(async (node) => {
          const nodeId = String(node._id || "");
          if (!nodeId) return null;
          const nodeUrl = new URL(`${baseUrl}/v2.0/flows/${flow.id}/chart/nodes/${nodeId}`);
          const fullNode = await limitedFetch(nodeUrl);
          return { node, fullNode, nodeId };
        })
      );

      const matchingNodes = [];
      for (const outcome of nodeDetailResults) {
        if (outcome.status !== "fulfilled" || !outcome.value) continue;
        const { node, fullNode, nodeId } = outcome.value;
        if (scanNodeForFlowReference(fullNode, targetFlowId, targetReferenceId)) {
          matchingNodes.push({
            nodeId,
            nodeReferenceId: String(node.referenceId || ""),
            nodeType: typeof fullNode.type === "string" ? fullNode.type : "",
            nodeLabel: typeof fullNode.label === "string" ? fullNode.label : ""
          });
        }
      }

      return { flow, matchingNodes };
    })
  );

  const callers = [];
  const callerErrors = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const flow = otherFlows[i];
    if (outcome.status === "fulfilled") {
      if (outcome.value.matchingNodes.length > 0) {
        callers.push({ flow, nodes: outcome.value.matchingNodes });
      }
    } else {
      callerErrors.push({
        flowId: flow.id,
        flowName: flow.name,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      });
    }
  }

  const nodeCount = callers.reduce((sum, c) => sum + c.nodes.length, 0);

  return {
    targetFlowId,
    targetReferenceId,
    projectId,
    count: callers.length,
    nodeCount,
    callerErrors: callerErrors.length > 0 ? callerErrors : [],
    callers
  };
}

async function searchProjectIntents({ projectId, query }) {
  if (!projectId) throw new Error("projectId is required.");
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) throw new Error("query is required.");

  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const queryLower = normalizedQuery.toLowerCase();

  const flowsResult = await listCognigyFlows({ projectId });
  const flows = flowsResult.items;

  const limitedFetch = makeConcurrentFetcher(apiKey, 8);

  const nameMatches = [];
  const sentenceMatches = [];
  const errors = [];

  const settled = await Promise.allSettled(
    flows.map(async (flow) => {
      const intentsUrl = new URL(`${baseUrl}/v2.0/flows/${flow.id}/intents`);
      intentsUrl.searchParams.set("limit", "100");
      const intentsPayload = await limitedFetch(intentsUrl);
      const intents = extractItems(intentsPayload);

      const flowNameMatches = [];
      const flowSentenceMatches = [];

      await Promise.allSettled(
        intents.map(async (intent) => {
          const intentId = (typeof intent._id === "string" && intent._id) ||
            extractIdFromHref(
              intent._links && intent._links.self ? intent._links.self.href : ""
            );
          const intentName = typeof intent.name === "string" ? intent.name : "";
          const intentInfo = {
            id: intentId,
            name: intentName,
            referenceId: typeof intent.referenceId === "string" ? intent.referenceId : "",
            isDisabled: Boolean(intent.isDisabled)
          };

          // Name match — simple case-insensitive substring check
          if (intentName.toLowerCase().includes(queryLower)) {
            flowNameMatches.push({ flow, intent: intentInfo });
          }

          // Sentence match — fetch all training phrases for this intent
          if (!intentId) return;
          const sentencesUrl = new URL(
            `${baseUrl}/v2.0/flows/${flow.id}/intents/${intentId}/sentences`
          );
          sentencesUrl.searchParams.set("limit", "100");
          const sentencesPayload = await limitedFetch(sentencesUrl);
          const sentences = extractItems(sentencesPayload);

          const matchedSentences = sentences
            .map((s) => (typeof s.text === "string" ? s.text : ""))
            .filter((text) => text && text.toLowerCase().includes(queryLower));

          if (matchedSentences.length > 0) {
            flowSentenceMatches.push({ flow, intent: intentInfo, matchedSentences });
          }
        })
      );

      return { flowNameMatches, flowSentenceMatches };
    })
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const flow = flows[i];
    if (outcome.status === "fulfilled") {
      nameMatches.push(...outcome.value.flowNameMatches);
      sentenceMatches.push(...outcome.value.flowSentenceMatches);
    } else {
      errors.push({
        flowId: flow.id,
        flowName: flow.name,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      });
    }
  }

  return {
    query: normalizedQuery,
    projectId,
    nameMatches,
    sentenceMatches,
    errors: errors.length > 0 ? errors : []
  };
}

module.exports = {
  searchCognigy,
  searchAllFlowNodes,
  listCognigyProjects,
  listCognigyFlows,
  listFlowNodeTypes,
  searchFlowNodes,
  findFlowCallers,
  searchProjectIntents
};
