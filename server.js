require("dotenv").config();

const express = require("express");
const path = require("path");
const {
  listCognigyFlows,
  listCognigyProjects,
  listFlowNodeTypes,
  searchAllFlowNodes,
  searchCognigy,
  searchFlowNodes,
  findFlowCallers,
  searchProjectIntents
} = require("./src/cognigyClient");

const PORT = Number(process.env.PORT || 3000);

function createApp(deps = {}) {
  const api = {
    listCognigyFlows: deps.listCognigyFlows || listCognigyFlows,
    listCognigyProjects: deps.listCognigyProjects || listCognigyProjects,
    listFlowNodeTypes: deps.listFlowNodeTypes || listFlowNodeTypes,
    searchAllFlowNodes: deps.searchAllFlowNodes || searchAllFlowNodes,
    searchCognigy: deps.searchCognigy || searchCognigy,
    searchFlowNodes: deps.searchFlowNodes || searchFlowNodes,
    findFlowCallers: deps.findFlowCallers || findFlowCallers,
    searchProjectIntents: deps.searchProjectIntents || searchProjectIntents
  };
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/search", async (req, res) => {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const projectId = String(req.query.projectId || "").trim();
    const flowId = String(req.query.flowId || "").trim();
    const nodeType = String(req.query.nodeType || "").trim();
    const hasQuery = Boolean(query);
    const hasNodeType = Boolean(nodeType);

    if (hasQuery === hasNodeType) {
      return res.status(400).json({ error: "Provide exactly one of query parameter 'q' or 'nodeType'." });
    }

    if (hasNodeType && !flowId && !projectId) {
      return res.status(400).json({ error: "Query parameter 'projectId' or 'flowId' is required for nodeType search." });
    }

    if (Number.isNaN(limit) || limit < 1) {
      return res.status(400).json({ error: "Query parameter 'limit' must be a positive number." });
    }

    try {
      if (flowId) {
        const result = await api.searchFlowNodes({ flowId, query, nodeType });
        return res.json(result);
      }

      if (hasNodeType && projectId) {
        const result = await api.searchAllFlowNodes({ projectId, nodeType, limit });
        return res.json(result);
      }

      if (hasQuery && projectId) {
        const result = await api.searchAllFlowNodes({ projectId, query, limit });
        return res.json(result);
      }

      const result = await api.searchCognigy({ query, limit, projectId });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown search error";
      return res.status(502).json({ error: `Cognigy search failed: ${message}` });
    }
  });

  app.get("/api/node-types", async (req, res) => {
    const flowId = String(req.query.flowId || "").trim();

    if (!flowId) {
      return res.status(400).json({ error: "Query parameter 'flowId' is required." });
    }

    try {
      const result = await api.listFlowNodeTypes({ flowId });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown node type listing error";
      return res.status(502).json({ error: `Cognigy node type list failed: ${message}` });
    }
  });

  app.get("/api/projects", async (_req, res) => {
    try {
      const result = await api.listCognigyProjects();
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown project listing error";
      return res.status(502).json({ error: `Cognigy project list failed: ${message}` });
    }
  });

  app.get("/api/flows", async (req, res) => {
    const projectId = String(req.query.projectId || "").trim();
    try {
      const result = await api.listCognigyFlows({ projectId });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown flow listing error";
      return res.status(502).json({ error: `Cognigy flow list failed: ${message}` });
    }
  });

  app.get("/api/flow-callers", async (req, res) => {
    const targetFlowId = String(req.query.targetFlowId || "").trim();
    const projectId = String(req.query.projectId || "").trim();

    if (!targetFlowId) {
      return res.status(400).json({ error: "Query parameter 'targetFlowId' is required." });
    }
    if (!projectId) {
      return res.status(400).json({ error: "Query parameter 'projectId' is required." });
    }

    try {
      const result = await api.findFlowCallers({ targetFlowId, projectId });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown flow callers error";
      return res.status(502).json({ error: `Cognigy flow callers failed: ${message}` });
    }
  });

  app.get("/api/intent-search", async (req, res) => {
    const query = String(req.query.q || "").trim();
    const projectId = String(req.query.projectId || "").trim();

    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required." });
    }
    if (!projectId) {
      return res.status(400).json({ error: "Query parameter 'projectId' is required." });
    }

    try {
      const result = await api.searchProjectIntents({ projectId, query });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown intent search error";
      return res.status(502).json({ error: `Cognigy intent search failed: ${message}` });
    }
  });

  app.get("/api/config", (_req, res) => {
    const uiBaseUrl = process.env.COGNIGY_UI_BASE_URL || null;
    return res.json({ uiBaseUrl });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Cognigy search tool running at http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
