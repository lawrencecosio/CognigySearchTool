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

test("GET /api/search calls text search handler for project search", async () => {
  let called = false;
  const app = createApp({
    searchCognigy: async ({ query, limit, projectId }) => {
      called = true;
      assert.equal(query, "welcome");
      assert.equal(limit, 15);
      assert.equal(projectId, "project-1");
      return { mode: "text", count: 1, items: [{ _id: "1", name: "Welcome" }] };
    }
  });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?q=welcome&limit=15&projectId=project-1`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, "text");
    assert.equal(payload.count, 1);
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
        items: [{ nodeId: "node-1", node: { type: "say" } }]
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
