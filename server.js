require("dotenv").config();

const express = require("express");
const path = require("path");
const { listCognigyFlows, listCognigyProjects, searchCognigy, searchFlowNodes } = require("./src/cognigyClient");

const app = express();
const PORT = Number(process.env.PORT || 3000);

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

  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }

  if (Number.isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: "Query parameter 'limit' must be a positive number." });
  }

  try {
    if (flowId) {
      const result = await searchFlowNodes({ flowId, query });
      return res.json(result);
    }

    const result = await searchCognigy({ query, limit, projectId });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    return res.status(502).json({ error: `Cognigy search failed: ${message}` });
  }
});

app.get("/api/projects", async (_req, res) => {
  try {
    const result = await listCognigyProjects();
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown project listing error";
    return res.status(502).json({ error: `Cognigy project list failed: ${message}` });
  }
});

app.get("/api/flows", async (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  try {
    const result = await listCognigyFlows({ projectId });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown flow listing error";
    return res.status(502).json({ error: `Cognigy flow list failed: ${message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Cognigy search tool running at http://localhost:${PORT}`);
});
