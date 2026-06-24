const form = document.getElementById("search-form");
const statusEl = document.getElementById("status");
const resultsPanelEl = document.getElementById("results-panel");
const processedResultsEl = document.getElementById("processed-results");
const jsonResultsEl = document.getElementById("json-results");
const processedViewButtonEl = document.getElementById("processed-view-btn");
const jsonViewButtonEl = document.getElementById("json-view-btn");
const projectSelectEl = document.getElementById("projectId");
const refreshProjectsButtonEl = document.getElementById("refresh-projects");
const flowSelectEl = document.getElementById("flowId");
const refreshFlowsButtonEl = document.getElementById("refresh-flows");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
}

function clearResults() {
  processedResultsEl.innerHTML = "";
  jsonResultsEl.textContent = "";
  resultsPanelEl.classList.add("hidden");
}

function switchView(mode) {
  const showProcessed = mode === "processed";
  processedResultsEl.classList.toggle("hidden", !showProcessed);
  jsonResultsEl.classList.toggle("hidden", showProcessed);
  processedViewButtonEl.classList.toggle("active", showProcessed);
  jsonViewButtonEl.classList.toggle("active", !showProcessed);
}

function addDetailRow(container, label, value) {
  if (!value) {
    return;
  }
  const rowEl = document.createElement("div");
  rowEl.className = "detail-row";

  const labelEl = document.createElement("span");
  labelEl.className = "detail-label";
  labelEl.textContent = label;
  rowEl.appendChild(labelEl);

  const valueEl = document.createElement("span");
  valueEl.className = "detail-value";
  valueEl.textContent = value;
  rowEl.appendChild(valueEl);

  container.appendChild(rowEl);
}

function buildConfigHighlights(node) {
  const config = node && typeof node === "object" ? node.config : null;
  if (!config || typeof config !== "object") {
    return { keys: [], codePreview: "", conditionPreview: "", textPreview: "" };
  }

  const keys = Object.keys(config).slice(0, 8);
  const codePreview = typeof config.code === "string" ? config.code.trim().slice(0, 220) : "";
  const conditionPreview = typeof config.condition === "string" ? config.condition.trim().slice(0, 220) : "";
  const textPreview = typeof config.text === "string" ? config.text.trim().slice(0, 220) : "";

  return { keys, codePreview, conditionPreview, textPreview };
}

function renderProcessedNodes(items) {
  processedResultsEl.innerHTML = "";

  if (!Array.isArray(items) || !items.length) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty-results";
    emptyEl.textContent = "No matching nodes found.";
    processedResultsEl.appendChild(emptyEl);
    return;
  }

  for (const item of items) {
    const node = item.node || {};
    const cardEl = document.createElement("article");
    cardEl.className = "node-card";

    const titleEl = document.createElement("h3");
    titleEl.className = "node-title";
    titleEl.textContent = node.label || "(No label)";
    cardEl.appendChild(titleEl);

    const metaEl = document.createElement("p");
    metaEl.className = "node-meta";
    metaEl.textContent = `Type: ${node.type || "unknown"} | Node ID: ${item.nodeId || "n/a"}`;
    cardEl.appendChild(metaEl);

    const detailsEl = document.createElement("div");
    detailsEl.className = "details-grid";
    addDetailRow(detailsEl, "Reference ID", item.nodeReferenceId || "");
    addDetailRow(detailsEl, "Extension", node.extension || "");
    addDetailRow(detailsEl, "Entry Point", node.isEntryPoint ? "Yes" : "");
    addDetailRow(detailsEl, "Disabled", node.isDisabled ? "Yes" : "No");
    cardEl.appendChild(detailsEl);

    const matches = Array.isArray(item.matches) ? item.matches : [];
    if (matches.length) {
      const matchesWrapEl = document.createElement("div");
      matchesWrapEl.className = "matches-wrap";
      const matchesTitleEl = document.createElement("p");
      matchesTitleEl.className = "matches-title";
      matchesTitleEl.textContent = "Matched fields:";
      matchesWrapEl.appendChild(matchesTitleEl);

      for (const match of matches) {
        const badgeEl = document.createElement("span");
        badgeEl.className = "match-badge";
        const fieldType = match.fieldType || "unknown";
        const matchPath = match.matchPath || "unknown";
        badgeEl.textContent = `${fieldType} -> ${matchPath}`;
        matchesWrapEl.appendChild(badgeEl);
      }
      cardEl.appendChild(matchesWrapEl);
    }

    const highlights = buildConfigHighlights(node);
    if (highlights.keys.length || highlights.codePreview || highlights.conditionPreview || highlights.textPreview) {
      const highlightsEl = document.createElement("div");
      highlightsEl.className = "highlights-wrap";

      const highlightsTitleEl = document.createElement("p");
      highlightsTitleEl.className = "matches-title";
      highlightsTitleEl.textContent = "Config highlights";
      highlightsEl.appendChild(highlightsTitleEl);

      if (highlights.keys.length) {
        const keyListEl = document.createElement("div");
        keyListEl.className = "chip-list";
        for (const key of highlights.keys) {
          const chipEl = document.createElement("span");
          chipEl.className = "key-chip";
          chipEl.textContent = key;
          keyListEl.appendChild(chipEl);
        }
        highlightsEl.appendChild(keyListEl);
      }

      const previewItems = [
        { label: "Code", value: highlights.codePreview },
        { label: "Condition", value: highlights.conditionPreview },
        { label: "Text", value: highlights.textPreview }
      ].filter((entry) => entry.value);

      for (const preview of previewItems) {
        const blockEl = document.createElement("div");
        blockEl.className = "preview-block";

        const blockTitleEl = document.createElement("p");
        blockTitleEl.className = "preview-title";
        blockTitleEl.textContent = preview.label;
        blockEl.appendChild(blockTitleEl);

        const blockTextEl = document.createElement("p");
        blockTextEl.className = "preview-text";
        blockTextEl.textContent = preview.value;
        blockEl.appendChild(blockTextEl);

        highlightsEl.appendChild(blockEl);
      }

      cardEl.appendChild(highlightsEl);
    }

    processedResultsEl.appendChild(cardEl);
  }
}

function renderProcessedResources(items) {
  processedResultsEl.innerHTML = "";

  if (!Array.isArray(items) || !items.length) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty-results";
    emptyEl.textContent = "No matching resources found.";
    processedResultsEl.appendChild(emptyEl);
    return;
  }

  for (const item of items) {
    const cardEl = document.createElement("article");
    cardEl.className = "node-card";

    const titleEl = document.createElement("h3");
    titleEl.className = "node-title";
    titleEl.textContent = item.name || "(No name)";
    cardEl.appendChild(titleEl);

    const metaEl = document.createElement("p");
    metaEl.className = "node-meta";
    metaEl.textContent = `Type: ${item.type || "unknown"} | ID: ${item._id || "n/a"}`;
    cardEl.appendChild(metaEl);

    if (item.projectId) {
      const projectEl = document.createElement("p");
      projectEl.className = "node-meta";
      projectEl.textContent = `Project ID: ${item.projectId}`;
      cardEl.appendChild(projectEl);
    }

    processedResultsEl.appendChild(cardEl);
  }
}

function renderProjects(items, defaultProjectId) {
  const previousSelection = projectSelectEl.value;
  projectSelectEl.innerHTML = "";

  const allProjectsOption = document.createElement("option");
  allProjectsOption.value = "";
  allProjectsOption.textContent = "All projects";
  projectSelectEl.appendChild(allProjectsOption);

  for (const project of items) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelectEl.appendChild(option);
  }

  if (previousSelection && items.some((project) => project.id === previousSelection)) {
    projectSelectEl.value = previousSelection;
    return;
  }

  if (defaultProjectId && items.some((project) => project.id === defaultProjectId)) {
    projectSelectEl.value = defaultProjectId;
  }
}

function renderFlows(items) {
  const previousSelection = flowSelectEl.value;
  flowSelectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "All flows (project-wide search)";
  flowSelectEl.appendChild(defaultOption);

  for (const flow of items) {
    const option = document.createElement("option");
    option.value = flow.id;
    option.textContent = flow.name;
    flowSelectEl.appendChild(option);
  }

  if (previousSelection && items.some((flow) => flow.id === previousSelection)) {
    flowSelectEl.value = previousSelection;
  }
}

async function loadFlows() {
  const projectId = projectSelectEl.value;
  if (!projectId) {
    renderFlows([]);
    return;
  }

  try {
    const response = await fetch(`/api/flows?projectId=${encodeURIComponent(projectId)}`);
    const data = await response.json();
    if (!response.ok) {
      const message = data && data.error ? data.error : "Failed to load flows";
      throw new Error(message);
    }

    renderFlows(data.items || []);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to load flows", true);
  }
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const data = await response.json();
    if (!response.ok) {
      const message = data && data.error ? data.error : "Failed to load projects";
      throw new Error(message);
    }

    renderProjects(data.items || [], data.defaultProjectId || "");
    await loadFlows();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to load projects", true);
  }
}

refreshProjectsButtonEl.addEventListener("click", () => {
  loadProjects();
});

projectSelectEl.addEventListener("change", () => {
  loadFlows();
});

refreshFlowsButtonEl.addEventListener("click", () => {
  loadFlows();
});

processedViewButtonEl.addEventListener("click", () => switchView("processed"));
jsonViewButtonEl.addEventListener("click", () => switchView("json"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = form.query.value.trim();
  const limit = form.limit.value;
  const projectId = projectSelectEl.value;
  const flowId = flowSelectEl.value;

  if (!query) {
    setStatus("Please enter a search query.", true);
    clearResults();
    return;
  }

  if (!projectId) {
    setStatus("Please select a project.", true);
    clearResults();
    return;
  }

  setStatus("Searching...");
  clearResults();

  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit)
    });
    if (projectId) {
      params.set("projectId", projectId);
    }
    params.set("flowId", flowId);

    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      const message = data && data.error ? data.error : "Search failed";
      throw new Error(message);
    }

    if (flowId) {
      setStatus(`Found ${data.count} matching node(s) in selected flow.`);
      renderProcessedNodes(data.items || []);
    } else {
      setStatus(`Found ${data.count} matching resource(s) in selected project.`);
      renderProcessedResources(data.items || []);
    }
    jsonResultsEl.textContent = JSON.stringify(data.items || [], null, 2);
    resultsPanelEl.classList.remove("hidden");
    switchView("processed");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Search failed", true);
    clearResults();
  }
});

loadProjects();
