const test = require("node:test");
const assert = require("node:assert/strict");
const { listFlowNodeTypes, searchAllFlowNodes, searchFlowNodes } = require("../src/cognigyClient");

function makeJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name && name.toLowerCase() === "content-type") {
          return "application/json";
        }
        return null;
      }
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("listFlowNodeTypes merges node types across chart endpoints", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/v2.0/flows/flow-1/chart/nodes")) {
      return makeJsonResponse({
        items: [{ type: "code" }, { type: "switch" }]
      });
    }
    if (String(url).endsWith("/v2.0/flows/flow-1/chart")) {
      return makeJsonResponse({
        chart: {
          nodes: [{ type: "overwriteAnalytics" }, { type: "switch" }]
        }
      });
    }
    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const result = await listFlowNodeTypes({ flowId: "flow-1" });
    assert.deepEqual(result.items, ["code", "overwriteAnalytics", "switch"]);
    assert.equal(result.count, 3);
    assert.deepEqual(calls, [
      "https://example.test/v2.0/flows/flow-1/chart/nodes",
      "https://example.test/v2.0/flows/flow-1/chart"
    ]);
  } finally {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.COGNIGY_API_BASE_URL;
    } else {
      process.env.COGNIGY_API_BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.COGNIGY_API_KEY;
    } else {
      process.env.COGNIGY_API_KEY = originalApiKey;
    }
  }
});

test("searchFlowNodes returns overwriteAnalytics nodes via nodeType mode", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  global.fetch = async (url) => {
    const stringUrl = String(url);
    if (stringUrl.endsWith("/v2.0/flows/flow-1/chart")) {
      return makeJsonResponse({
        nodes: [
          { _id: "n-1", referenceId: "r-1", type: "overwriteAnalytics" },
          { _id: "n-2", referenceId: "r-2", type: "code" }
        ]
      });
    }
    if (stringUrl.endsWith("/v2.0/flows/flow-1/chart/nodes/n-1")) {
      return makeJsonResponse({
        _id: "n-1",
        referenceId: "r-1",
        type: "overwriteAnalytics",
        label: "Overwrite analytics"
      });
    }
    if (stringUrl.includes("/chart/nodes/search")) {
      throw new Error("nodeType mode should not call text search endpoint");
    }
    throw new Error(`Unexpected URL: ${stringUrl}`);
  };

  try {
    const result = await searchFlowNodes({
      flowId: "flow-1",
      nodeType: "overwriteAnalytics"
    });

    assert.equal(result.count, 1);
    assert.equal(result.upstreamCount, 1);
    assert.equal(result.items[0].node.type, "overwriteAnalytics");
    assert.equal(result.items[0].nodeId, "n-1");
  } finally {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.COGNIGY_API_BASE_URL;
    } else {
      process.env.COGNIGY_API_BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.COGNIGY_API_KEY;
    } else {
      process.env.COGNIGY_API_KEY = originalApiKey;
    }
  }
});

test("searchAllFlowNodes fans out to each flow and aggregates results with flowName", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  global.fetch = async (url) => {
    const s = String(url);
    if (s.includes("/v2.0/flows?")) {
      return makeJsonResponse({
        items: [
          { _id: "flow-a", name: "Alpha Flow" },
          { _id: "flow-b", name: "Beta Flow" }
        ]
      });
    }
    if (s.includes("/v2.0/flows/flow-a/chart/nodes/search")) {
      return makeJsonResponse({ items: [{ nodeId: "n-1", nodeReferenceId: "r-1", matches: [] }] });
    }
    if (s.endsWith("/v2.0/flows/flow-a/chart/nodes/n-1")) {
      return makeJsonResponse({ _id: "n-1", type: "say", label: "Rating question" });
    }
    if (s.includes("/v2.0/flows/flow-b/chart/nodes/search")) {
      return makeJsonResponse({ items: [] });
    }
    throw new Error(`Unexpected URL: ${s}`);
  };

  try {
    const result = await searchAllFlowNodes({ projectId: "proj-1", query: "On a scale of 1-5", limit: 20 });

    assert.equal(result.mode, "all-flows-node-search");
    assert.equal(result.flowCount, 2);
    assert.equal(result.count, 1);
    assert.equal(result.items[0].nodeId, "n-1");
    assert.equal(result.items[0].flowId, "flow-a");
    assert.equal(result.items[0].flowName, "Alpha Flow");
    assert.equal(result.items[0].node.label, "Rating question");
  } finally {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.COGNIGY_API_BASE_URL;
    } else {
      process.env.COGNIGY_API_BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.COGNIGY_API_KEY;
    } else {
      process.env.COGNIGY_API_KEY = originalApiKey;
    }
  }
});

test("searchAllFlowNodes with nodeType: returns only matching-type nodes; non-matching type absent", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  global.fetch = async (url) => {
    const s = String(url);
    // List flows
    if (s.includes("/v2.0/flows?")) {
      return makeJsonResponse({
        items: [
          { _id: "flow-a", name: "Alpha Flow" },
          { _id: "flow-b", name: "Beta Flow" }
        ]
      });
    }
    // flow-a chart: has a say node (n-1) and a question node (n-2)
    if (s.endsWith("/v2.0/flows/flow-a/chart")) {
      return makeJsonResponse({
        nodes: [
          { _id: "n-1", referenceId: "r-1", type: "say" },
          { _id: "n-2", referenceId: "r-2", type: "question" }
        ]
      });
    }
    // flow-a say node detail
    if (s.endsWith("/v2.0/flows/flow-a/chart/nodes/n-1")) {
      return makeJsonResponse({ _id: "n-1", type: "say", label: "Welcome message" });
    }
    // flow-b chart: only has a question node (n-3) — no say nodes
    if (s.endsWith("/v2.0/flows/flow-b/chart")) {
      return makeJsonResponse({
        nodes: [{ _id: "n-3", referenceId: "r-3", type: "question" }]
      });
    }
    throw new Error(`Unexpected URL: ${s}`);
  };

  try {
    const result = await searchAllFlowNodes({ projectId: "proj-1", nodeType: "say", limit: 20 });

    assert.equal(result.mode, "all-flows-node-search");
    assert.equal(result.flowCount, 2);
    assert.equal(result.count, 1, "Only one say node across both flows");
    assert.equal(result.items[0].nodeId, "n-1");
    assert.equal(result.items[0].node.type, "say");
    assert.equal(result.items[0].flowId, "flow-a");
    assert.equal(result.items[0].flowName, "Alpha Flow");
    // question nodes must be entirely absent
    assert.ok(result.items.every(i => i.node.type === "say"), "All items must be type 'say'");
    assert.ok(!result.items.some(i => i.node.type === "question"), "question nodes must be absent");
  } finally {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) {
      delete process.env.COGNIGY_API_BASE_URL;
    } else {
      process.env.COGNIGY_API_BASE_URL = originalBaseUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.COGNIGY_API_KEY;
    } else {
      process.env.COGNIGY_API_KEY = originalApiKey;
    }
  }
});
