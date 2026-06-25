function getValueAtPath(obj, path) {
  // Converts "config.buttons[1].title" → ["config", "buttons", "1", "title"]
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current = obj;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function extractMatchExcerpt(node, matchPath, query) {
  if (!node || !matchPath) return null;

  const value = getValueAtPath(node, matchPath);
  if (value == null || typeof value !== "string") return null;

  const normalizedQuery = String(query || "").toLowerCase();
  if (!normalizedQuery) return value.slice(0, 220);

  const lowerValue = value.toLowerCase();
  const matchIndex = lowerValue.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return value.slice(0, 220);
  }

  const contextSize = 80;
  const start = Math.max(0, matchIndex - contextSize);
  const end = Math.min(value.length, matchIndex + query.length + contextSize);
  const excerpt = value.slice(start, end);
  const excerptLower = excerpt.toLowerCase();
  const markStart = excerptLower.indexOf(normalizedQuery);

  if (markStart === -1) return excerpt;

  const before = excerpt.slice(0, markStart);
  const matched = excerpt.slice(markStart, markStart + query.length);
  const after = excerpt.slice(markStart + query.length);
  const prefix = start > 0 ? "\u2026" : "";
  const suffix = end < value.length ? "\u2026" : "";

  return `${prefix}${before}<mark>${matched}</mark>${after}${suffix}`;
}

function filterResults(items, filters) {
  if (!filters || (typeof filters === "object" && Object.keys(filters).length === 0)) {
    return items;
  }
  const { nodeType, flowName } = filters;
  return items.filter((item) => {
    if (nodeType && !(item.node && item.node.type === nodeType)) return false;
    if (flowName && item.flowName !== flowName) return false;
    return true;
  });
}

function buildCognigyDeepLink(uiBaseUrl, projectId, flowId, referenceId) {
  if (!uiBaseUrl) return null;
  const base = uiBaseUrl.replace(/\/+$/, "");
  return `${base}/agent/${projectId}/flows/${flowId}?nodeId=${referenceId}`;
}

if (typeof module !== "undefined") {
  module.exports = { extractMatchExcerpt, filterResults, buildCognigyDeepLink };
}
