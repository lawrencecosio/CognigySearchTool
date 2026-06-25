# Cognigy Search Tool

This is a local web app to search Cognigy projects, flows, and flow nodes.

## Quick start

### 1. Install Node.js (one time)

1. Go to: https://nodejs.org
2. Download **Node.js LTS** and install it.
3. Open Terminal (Mac) or Command Prompt/PowerShell (Windows).
4. Check install:
   ```bash
   node -v
   npm -v
   ```

### 2. Open this project folder in your terminal

Run commands from the project folder (the folder that contains `package.json`).

### 3. Install the app dependencies

```bash
npm install
```

### 4. Create your local settings file

Copy `.env.example` and name the copy `.env`.

Then open `.env` and set these values:

- `COGNIGY_API_KEY` = your Cognigy API key
- `COGNIGY_API_BASE_URL` = your Cognigy API URL (see below)

You usually do not need to change the other values.

## How to get your Cognigy API key

In Cognigy UI, this is usually under **Settings** or **Admin**:

1. Open your Cognigy instance.
2. Go to **Settings/Admin**.
3. Find **API Keys** (or **Access Tokens**).
4. Create a new key with the required permissions.
5. Copy it and paste it into `.env` as `COGNIGY_API_KEY`.

If you cannot see API keys, ask your Cognigy admin for access or for a key.

## How to set the Cognigy URL

Set `COGNIGY_API_BASE_URL` to the **API host**, not the normal browser UI URL.

Example:

- UI URL: `https://your-company-chat.example.com/...`
- API URL: `https://your-company-api.example.com`

If you are unsure, ask your Cognigy admin for the exact API base URL.

## Run the app

```bash
npm start
```

Then open:

`http://localhost:3000`

## Search

Select a **project**, then optionally a **flow**. Enter a search query, a node type, or both:

- **Search text** — finds nodes whose content (labels, button text, conditions, code, etc.) contains the query. Works across all flows in the project or within a single selected flow.
- **Node type** — finds all nodes of that type (e.g. `say`, `question`, `code`). Works across all flows or a single flow. When a flow is selected, the field autocompletes with known node types.
- **Both** — text search runs server-side; node type becomes a client-side filter on the results.

After results load, use the **filter bar** to narrow by node type or flow without re-querying. The result count updates live.

Each result card shows the **matched field and a highlighted excerpt** of the content where the query was found.

If `COGNIGY_UI_BASE_URL` is set in `.env`, each card shows an **"Open in Cognigy ↗"** link that opens the exact node in the Cognigy UI. If not set, a copyable reference ID is shown instead.

## Stop the app

In the terminal where it is running, press:

`Ctrl + C`
