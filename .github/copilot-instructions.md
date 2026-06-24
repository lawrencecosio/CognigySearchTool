# Copilot Instructions for CognigySearchTool

## Build, test, and lint commands

This repository currently defines only one npm script:

```bash
npm start
```

- Starts the Express server (`server.js`) and serves the UI at `http://localhost:3000` by default.
- Uses `.env` values at runtime (`dotenv` is loaded in `server.js`).

There are currently no configured npm scripts for build, lint, or tests in `package.json`, so there is no built-in full-suite or single-test command yet.

## High-level architecture

This is a small Node/Express + vanilla frontend app:

1. `server.js` hosts static files from `public/` and exposes API routes:
   - `GET /api/projects`
   - `GET /api/flows?projectId=...`
   - `GET /api/search?q=...&limit=...&projectId=...&flowId=...`
2. `src/cognigyClient.js` contains all Cognigy API integration logic (request construction, auth header, payload parsing, filtering/ranking, and response shaping).
3. `public/app.js` is the only frontend controller; it:
   - loads projects and flows from backend APIs,
   - submits search requests,
   - renders either processed cards or raw JSON.

Important backend branching:

- `/api/search` switches behavior by `flowId`:
  - with `flowId`: node-level search (`searchFlowNodes`) using `/v2.0/flows/{flowId}/chart/nodes/search`, then fetches each matching node detail.
  - without `flowId`: generic Cognigy search (`searchCognigy`) against configured search path.

## Key conventions in this codebase

- **Environment-first integration config:** Cognigy endpoints and query parameter names are configurable via `.env` (`COGNIGY_SEARCH_PATH`, `COGNIGY_QUERY_PARAM`, `COGNIGY_PROJECTS_PATH`, `COGNIGY_FLOWS_PATH`) with defaults in `src/cognigyClient.js`.
- **Required env handling:** `COGNIGY_API_BASE_URL` and `COGNIGY_API_KEY` are required and enforced through `getRequiredEnv`.
- **Tolerant payload normalization:** upstream payloads are normalized via `extractItems`, accepting array payloads or `items`/`results`/`data` envelopes.
- **Consistent API error mapping:** Cognigy client throws explicit errors; `server.js` converts them to 502 responses with endpoint-specific prefixes.
- **Search behavior guardrails:** `limit` is clamped to max 100 in `server.js`; optional strict local filtering is controlled by `COGNIGY_STRICT_LOCAL_FILTER=true`.
- **Frontend expectations of API shape:** UI rendering expects `data.items` arrays from backend responses, and status text is derived from `data.count`.
- **Project/flow selection UX coupling:** frontend loads flows based on selected project and blocks submit if no project is selected.
