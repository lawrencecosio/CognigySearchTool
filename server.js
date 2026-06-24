const express = require("express");
const path = require("path");
const { searchCognigy } = require("./src/cognigyClient");

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

  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }

  if (Number.isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: "Query parameter 'limit' must be a positive number." });
  }

  try {
    const result = await searchCognigy({ query, limit });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    return res.status(502).json({ error: `Cognigy search failed: ${message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Cognigy search tool running at http://localhost:${PORT}`);
});
