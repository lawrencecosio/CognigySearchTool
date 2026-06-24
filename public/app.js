const form = document.getElementById("search-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = form.query.value.trim();
  const limit = form.limit.value;

  if (!query) {
    setStatus("Please enter a search query.", true);
    resultsEl.textContent = "";
    return;
  }

  setStatus("Searching...");
  resultsEl.textContent = "";

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`);
    const data = await response.json();

    if (!response.ok) {
      const message = data && data.error ? data.error : "Search failed";
      throw new Error(message);
    }

    setStatus(`Found ${data.count} result(s).`);
    resultsEl.textContent = JSON.stringify(data.items, null, 2);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Search failed", true);
    resultsEl.textContent = "";
  }
});
