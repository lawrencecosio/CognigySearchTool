const test = require("node:test");
const assert = require("node:assert/strict");
const { listCognigyFlows, listFlowNodeTypes, searchAllFlowNodes, searchFlowNodes, findFlowCallers } = require("../src/cognigyClient");

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

test("listCognigyFlows returns primaryLocaleId and referenceId from project details", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/new/v2.0/projects/project-1")) {
      return makeJsonResponse({ _id: "project-1", primaryLocaleReference: "locale-en-1" });
    }
    if (String(url).includes("/v2.0/flows?projectId=project-1")) {
      return makeJsonResponse({
        _embedded: {
          flows: [
            {
              _links: { self: { href: "https://example.test/v2.0/flows/flow-1" } },
              properties: {
                referenceId: "flow-ref-1",
                name: "Main Flow",
                description: "Primary flow"
              }
            }
          ]
        }
      });
    }
    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const result = await listCognigyFlows({ projectId: "project-1" });
    assert.equal(result.projectId, "project-1");
    assert.equal(result.primaryLocaleId, "locale-en-1");
    assert.equal(result.count, 1);
    assert.equal(result.items[0].id, "flow-1");
    assert.equal(result.items[0].referenceId, "flow-ref-1");
    assert.deepEqual(calls, [
      "https://example.test/new/v2.0/projects/project-1",
      "https://example.test/v2.0/flows?projectId=project-1&limit=100"
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
    if (s.endsWith("/new/v2.0/projects/proj-1")) {
      return makeJsonResponse({ _id: "proj-1", primaryLocaleReference: "locale-1" });
    }
    if (s.includes("/v2.0/flows?")) {
      return makeJsonResponse({
        items: [
          { _id: "flow-a", referenceId: "flow-ref-a", name: "Alpha Flow" },
          { _id: "flow-b", referenceId: "flow-ref-b", name: "Beta Flow" }
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
    assert.equal(result.items[0].flowReferenceId, "flow-ref-a");
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
    if (s.endsWith("/new/v2.0/projects/proj-1")) {
      return makeJsonResponse({ _id: "proj-1", primaryLocaleReference: "locale-1" });
    }
    // List flows
    if (s.includes("/v2.0/flows?")) {
      return makeJsonResponse({
        items: [
          { _id: "flow-a", referenceId: "flow-ref-a", name: "Alpha Flow" },
          { _id: "flow-b", referenceId: "flow-ref-b", name: "Beta Flow" }
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
    assert.equal(result.items[0].flowReferenceId, "flow-ref-a");
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

test("searchAllFlowNodes: surfaces per-flow errors in response; partial results still returned", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  global.fetch = async (url) => {
    const s = String(url);
    if (s.endsWith("/new/v2.0/projects/proj-1")) {
      return makeJsonResponse({ _id: "proj-1", primaryLocaleReference: "locale-1" });
    }
    if (s.includes("/v2.0/flows?")) {
      return makeJsonResponse({
        items: [
          { _id: "flow-ok", referenceId: "flow-ref-ok", name: "Good Flow" },
          { _id: "flow-err", referenceId: "flow-ref-err", name: "Error Flow" }
        ]
      });
    }
    if (s.includes("/v2.0/flows/flow-ok/chart/nodes/search")) {
      return makeJsonResponse({ items: [{ nodeId: "n-1", nodeReferenceId: "r-1", matches: [] }] });
    }
    if (s.endsWith("/v2.0/flows/flow-ok/chart/nodes/n-1")) {
      return makeJsonResponse({ _id: "n-1", type: "say", label: "Hello" });
    }
    // flow-err returns HTTP 403
    if (s.includes("/v2.0/flows/flow-err/chart/nodes/search")) {
      return {
        ok: false,
        status: 403,
        headers: { get: () => "application/json" },
        async text() { return JSON.stringify({ error: "Forbidden" }); }
      };
    }
    throw new Error(`Unexpected URL: ${s}`);
  };

  try {
    const result = await searchAllFlowNodes({ projectId: "proj-1", query: "hello", limit: 20 });

    assert.equal(result.count, 1);
    assert.equal(result.items[0].flowName, "Good Flow");
    assert.equal(result.items[0].flowReferenceId, "flow-ref-ok");

    // Error flow is captured — not silently dropped
    assert.ok(Array.isArray(result.flowErrors), "flowErrors must be an array");
    assert.equal(result.flowErrors.length, 1);
    assert.equal(result.flowErrors[0].flowName, "Error Flow");
    assert.ok(typeof result.flowErrors[0].error === "string", "error must be a string");
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

// ─── findFlowCallers tests ─────────────────────────────────────────────────

function makeProjectsPayload() {
  return { primaryLocaleReference: "en-US" };
}

function makeFlowsPayload(flows) {
  return {
    items: flows.map((f) => ({
      _id: f.id,
      name: f.name,
      referenceId: f.referenceId || ""
    }))
  };
}

function makeChartPayload(nodes) {
  return { nodes };
}

test("findFlowCallers returns flows whose nodes reference the target flow by scanning full node details", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const TARGET_FLOW_ID = "flow-target";
  const PROJECT_ID = "proj-1";

  global.fetch = async (urlObj) => {
    const url = String(urlObj);
    if (url.includes(`/new/v2.0/projects/${PROJECT_ID}`)) {
      return makeJsonResponse(makeProjectsPayload());
    }
    if (url.includes("/v2.0/flows") && url.includes(`projectId=${PROJECT_ID}`)) {
      return makeJsonResponse(makeFlowsPayload([
        { id: TARGET_FLOW_ID, name: "Target Flow", referenceId: "ref-target" },
        { id: "flow-caller", name: "Caller Flow", referenceId: "ref-caller" },
        { id: "flow-unrelated", name: "Unrelated Flow", referenceId: "ref-unrelated" }
      ]));
    }
    if (url === "https://example.test/v2.0/flows/flow-caller/chart") {
      return makeJsonResponse(makeChartPayload([{ _id: "node-1", type: "executeFlow", referenceId: "ref-node-1" }]));
    }
    if (url === "https://example.test/v2.0/flows/flow-unrelated/chart") {
      return makeJsonResponse(makeChartPayload([{ _id: "node-2", type: "say", referenceId: "ref-node-2" }]));
    }
    // node-1 full details — contains a reference to the target flow's referenceId
    if (url === "https://example.test/v2.0/flows/flow-caller/chart/nodes/node-1") {
      return makeJsonResponse({ _id: "node-1", type: "executeFlow", label: "Call Target", data: { childFlowReferenceId: "ref-target" } });
    }
    // node-2 full details — no reference to target
    if (url === "https://example.test/v2.0/flows/flow-unrelated/chart/nodes/node-2") {
      return makeJsonResponse({ _id: "node-2", type: "say", label: "Hello", data: { text: "Hello world" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await findFlowCallers({ targetFlowId: TARGET_FLOW_ID, projectId: PROJECT_ID });
    assert.equal(result.count, 1);
    assert.equal(result.nodeCount, 1);
    assert.equal(result.callers[0].flow.name, "Caller Flow");
    assert.equal(result.callers[0].nodes[0].nodeId, "node-1");
    assert.equal(result.callers[0].nodes[0].nodeType, "executeFlow");
    assert.equal(result.callers[0].nodes[0].nodeLabel, "Call Target");
    assert.deepEqual(result.callerErrors, []);
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

test("findFlowCallers excludes the target flow itself from scanning", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const TARGET_FLOW_ID = "flow-target";
  const PROJECT_ID = "proj-1";
  const scannedFlows = [];

  global.fetch = async (urlObj) => {
    const url = String(urlObj);
    if (url.includes(`/new/v2.0/projects/${PROJECT_ID}`)) {
      return makeJsonResponse(makeProjectsPayload());
    }
    if (url.includes("/v2.0/flows") && url.includes(`projectId=${PROJECT_ID}`)) {
      return makeJsonResponse(makeFlowsPayload([
        { id: TARGET_FLOW_ID, name: "Target Flow", referenceId: "ref-target" },
        { id: "flow-other", name: "Other Flow", referenceId: "ref-other" }
      ]));
    }
    const chartMatch = url.match(/\/v2\.0\/flows\/([^/]+)\/chart$/);
    if (chartMatch) {
      scannedFlows.push(chartMatch[1]);
      return makeJsonResponse(makeChartPayload([]));
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await findFlowCallers({ targetFlowId: TARGET_FLOW_ID, projectId: PROJECT_ID });
    assert.ok(!scannedFlows.includes(TARGET_FLOW_ID), "Should not scan the target flow itself");
    assert.equal(result.count, 0);
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

test("findFlowCallers records callerErrors when chart fetch fails", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const TARGET_FLOW_ID = "flow-target";
  const PROJECT_ID = "proj-1";

  global.fetch = async (urlObj) => {
    const url = String(urlObj);
    if (url.includes(`/new/v2.0/projects/${PROJECT_ID}`)) {
      return makeJsonResponse(makeProjectsPayload());
    }
    if (url.includes("/v2.0/flows") && url.includes(`projectId=${PROJECT_ID}`)) {
      return makeJsonResponse(makeFlowsPayload([
        { id: TARGET_FLOW_ID, name: "Target Flow", referenceId: "ref-target" },
        { id: "flow-broken", name: "Broken Flow", referenceId: "ref-broken" }
      ]));
    }
    // Chart fetch fails for the broken flow
    if (url.endsWith("/v2.0/flows/flow-broken/chart")) {
      return { ok: false, status: 403, headers: { get: () => "application/json" }, async text() { return JSON.stringify({ error: "Forbidden" }); } };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await findFlowCallers({ targetFlowId: TARGET_FLOW_ID, projectId: PROJECT_ID });
    assert.equal(result.callerErrors.length, 1);
    assert.equal(result.callerErrors[0].flowId, "flow-broken");
    assert.equal(result.count, 0);
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

test("findFlowCallers returns empty callers when no flow references the target", async () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.COGNIGY_API_BASE_URL;
  const originalApiKey = process.env.COGNIGY_API_KEY;

  process.env.COGNIGY_API_BASE_URL = "https://example.test";
  process.env.COGNIGY_API_KEY = "test-key";

  const TARGET_FLOW_ID = "flow-target";
  const PROJECT_ID = "proj-1";

  global.fetch = async (urlObj) => {
    const url = String(urlObj);
    if (url.includes(`/new/v2.0/projects/${PROJECT_ID}`)) {
      return makeJsonResponse(makeProjectsPayload());
    }
    if (url.includes("/v2.0/flows") && url.includes(`projectId=${PROJECT_ID}`)) {
      return makeJsonResponse(makeFlowsPayload([
        { id: TARGET_FLOW_ID, name: "Target Flow", referenceId: "ref-target" },
        { id: "flow-a", name: "Flow A", referenceId: "ref-a" },
        { id: "flow-b", name: "Flow B", referenceId: "ref-b" }
      ]));
    }
    // All charts return empty node lists — no nodes to scan
    if (url.endsWith("/chart")) {
      return makeJsonResponse(makeChartPayload([]));
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await findFlowCallers({ targetFlowId: TARGET_FLOW_ID, projectId: PROJECT_ID });
    assert.equal(result.count, 0);
    assert.equal(result.nodeCount, 0);
    assert.deepEqual(result.callers, []);
    assert.deepEqual(result.callerErrors, []);
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
