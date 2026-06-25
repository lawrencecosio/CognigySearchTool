require("dotenv").config();

const express = require("express");
const path = require("path");
const {
  listCognigyFlows,
  listCognigyProjects,
  listFlowNodeTypes,
  searchCognigy,
  searchFlowNodes
} = require("./src/cognigyClient");

const PORT = Number(process.env.PORT || 3000);

function createApp(deps = {}) {
  const api = {
    listCognigyFlows: deps.listCognigyFlows || listCognigyFlows,
    listCognigyProjects: deps.listCognigyProjects || listCognigyProjects,
    listFlowNodeTypes: deps.listFlowNodeTypes || listFlowNodeTypes,
    searchCognigy: deps.searchCognigy || searchCognigy,
    searchFlowNodes: deps.searchFlowNodes || searchFlowNodes
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

    if (hasNodeType && !flowId) {
      return res.status(400).json({ error: "Query parameter 'flowId' is required for nodeType search." });
    }

    if (Number.isNaN(limit) || limit < 1) {
      return res.status(400).json({ error: "Query parameter 'limit' must be a positive number." });
    }

    try {
      if (flowId) {
        const result = await api.searchFlowNodes({ flowId, query, nodeType });
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

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Cognigy search tool running at http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
