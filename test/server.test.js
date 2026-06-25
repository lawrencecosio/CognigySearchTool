const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server");

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("GET /api/search returns 400 when q and nodeType are both provided", async () => {
  const app = createApp();
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?q=test&nodeType=say&flowId=flow-1`);
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, "Provide exactly one of query parameter 'q' or 'nodeType'.");
  } finally {
    await closeServer(server);
  }
});

test("GET /api/search calls searchAllFlowNodes when projectId is set and flowId is not", async () => {
  let called = false;
  const app = createApp({
    searchAllFlowNodes: async ({ projectId, query, limit }) => {
      called = true;
      assert.equal(projectId, "project-1");
      assert.equal(query, "welcome");
      assert.equal(limit, 15);
      return {
        mode: "all-flows-node-search",
        projectId,
        query,
        flowCount: 2,
        count: 1,
        items: [{ nodeId: "n-1", flowId: "flow-1", flowName: "Main Flow", node: { type: "say" } }]
      };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?q=welcome&limit=15&projectId=project-1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "all-flows-node-search");
    assert.equal(payload.flowCount, 2);
    assert.equal(payload.count, 1);
    assert.equal(payload.items[0].flowName, "Main Flow");
    assert.equal(called, true);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/search falls back to searchCognigy when no projectId", async () => {
  let called = false;
  const app = createApp({
    searchCognigy: async ({ query, limit, projectId }) => {
      called = true;
      assert.equal(query, "welcome");
      assert.equal(limit, 15);
      assert.equal(projectId, "");
      return { count: 0, items: [] };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?q=welcome&limit=15`);
    assert.equal(response.status, 200);
    assert.equal(called, true);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/search calls flow node search handler for nodeType mode", async () => {
  let called = false;
  const app = createApp({
    searchFlowNodes: async ({ flowId, query, nodeType }) => {
      called = true;
      assert.equal(flowId, "flow-1");
      assert.equal(query, "");
      assert.equal(nodeType, "say");
      return {
        mode: "flow-node-search",
        flowId,
        nodeType,
        count: 1,
        items: [{ nodeId: "node-1", node: { type: "say", label: "Rating say node" } }]
      };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?nodeType=say&flowId=flow-1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "flow-node-search");
    assert.equal(payload.nodeType, "say");
    assert.equal(payload.items[0].node.type, "say");
    assert.equal(payload.items[0].node.label, "Rating say node");
    assert.equal(payload.items.length, 1);
    assert.equal(called, true);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/search routes nodeType+projectId (no flowId) to searchAllFlowNodes with nodeType", async () => {
  let called = false;
  const app = createApp({
    searchAllFlowNodes: async ({ projectId, nodeType, limit }) => {
      called = true;
      assert.equal(projectId, "project-1");
      assert.equal(nodeType, "say");
      assert.equal(limit, 20);
      return {
        mode: "all-flows-node-search",
        projectId,
        query: "",
        nodeType,
        flowCount: 3,
        count: 2,
        items: [
          { nodeId: "n-1", flowId: "flow-a", flowName: "Alpha Flow", node: { type: "say", label: "Welcome say" } },
          { nodeId: "n-2", flowId: "flow-b", flowName: "Beta Flow", node: { type: "say", label: "Goodbye say" } }
        ]
      };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?nodeType=say&projectId=project-1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "all-flows-node-search");
    assert.equal(payload.flowCount, 3);
    assert.equal(payload.count, 2);
    // Both items are "say" — irrelevant types absent
    assert.ok(payload.items.every(i => i.node.type === "say"), "All items must have type 'say'");
    assert.equal(payload.items[0].flowName, "Alpha Flow");
    assert.equal(payload.items[0].node.label, "Welcome say");
    assert.equal(payload.items[1].flowName, "Beta Flow");
    assert.equal(called, true);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/node-types returns 400 when flowId is missing", async () => {
  const app = createApp();
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/node-types`);
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, "Query parameter 'flowId' is required.");
  } finally {
    await closeServer(server);
  }
});

test("GET /api/node-types returns node types from dependency", async () => {
  const app = createApp({
    listFlowNodeTypes: async ({ flowId }) => {
      assert.equal(flowId, "flow-99");
      return { flowId, count: 2, items: ["question", "say"] };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/node-types?flowId=flow-99`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.items, ["question", "say"]);
    assert.equal(payload.count, 2);
  } finally {
    await closeServer(server);
  }
});

test("GET /api/config returns { uiBaseUrl: null } when COGNIGY_UI_BASE_URL is not set", async () => {
  const saved = process.env.COGNIGY_UI_BASE_URL;
  delete process.env.COGNIGY_UI_BASE_URL;

  const app = createApp();
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/config`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.uiBaseUrl, null, "uiBaseUrl must be null (not undefined or empty string) when env var is absent");
    assert.ok(Object.prototype.hasOwnProperty.call(payload, "uiBaseUrl"), "uiBaseUrl key must be present");
  } finally {
    await closeServer(server);
    if (saved !== undefined) process.env.COGNIGY_UI_BASE_URL = saved;
  }
});

test("GET /api/config returns exact uiBaseUrl value when COGNIGY_UI_BASE_URL is set", async () => {
  const saved = process.env.COGNIGY_UI_BASE_URL;
  process.env.COGNIGY_UI_BASE_URL = "https://app.cognigy.example.com";

  const app = createApp();
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/config`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.uiBaseUrl, "https://app.cognigy.example.com", "uiBaseUrl must be the exact env var value, unmodified");
  } finally {
    await closeServer(server);
    if (saved !== undefined) {
      process.env.COGNIGY_UI_BASE_URL = saved;
    } else {
      delete process.env.COGNIGY_UI_BASE_URL;
    }
  }
});
