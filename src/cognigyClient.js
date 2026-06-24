const DEFAULT_SEARCH_PATH = "/search";

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

async function searchCognigy({ query, limit }) {
  const baseUrl = normalizeBaseUrl(getRequiredEnv("COGNIGY_API_BASE_URL"));
  const apiKey = getRequiredEnv("COGNIGY_API_KEY");
  const searchPath = normalizePath(process.env.COGNIGY_SEARCH_PATH || DEFAULT_SEARCH_PATH);

  const url = new URL(`${baseUrl}${searchPath}`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey
    }
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw new Error("Cognigy API returned non-JSON response");
    }
  }

  if (!response.ok) {
    const upstreamMessage =
      payload && typeof payload === "object" && payload.error
        ? String(payload.error)
        : `HTTP ${response.status}`;
    throw new Error(upstreamMessage);
  }

  const items = extractItems(payload);
  return {
    query,
    count: items.length,
    items,
    raw: payload
  };
}

module.exports = {
  searchCognigy
};
