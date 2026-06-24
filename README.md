# Cognigy Search Tool

A simple web tool for searching Cognigy data through an API endpoint.

## Requirements

- Node.js 18+
- A Cognigy API base URL and API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example` and set:
   - `COGNIGY_API_BASE_URL`
   - `COGNIGY_API_KEY`
   - Optional: `COGNIGY_SEARCH_PATH` (defaults to `/search`)
3. Start the app:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000`.

## API

`GET /api/search?q=<query>&limit=<number>`

- `q` is required
- `limit` defaults to `20` and maxes at `100`
