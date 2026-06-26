// ─── DOM refs ──────────────────────────────────────────────────────────────
const statusEl            = document.getElementById("status");
const resultsPanelEl      = document.getElementById("results-panel");
const processedResultsEl  = document.getElementById("processed-results");
const jsonResultsEl       = document.getElementById("json-results");
const processedViewBtn    = document.getElementById("processed-view-btn");
const jsonViewBtn         = document.getElementById("json-view-btn");

const searchFormEl        = document.getElementById("search-form");
const projectSelectEl     = document.getElementById("projectId");
const flowSelectEl        = document.getElementById("flowId");
const queryInputEl        = document.getElementById("text-query");
const nodeTypeInputEl     = document.getElementById("nodeType");
const nodeTypeListEl      = document.getElementById("nodeTypeList");
const limitInputEl        = document.getElementById("text-limit");
const submitBtnEl         = document.getElementById("submit-btn");
const formHintEl          = document.getElementById("form-hint");

const refreshProjectsBtnEl = document.getElementById("refresh-projects");
const refreshFlowsBtnEl    = document.getElementById("refresh-flows");

const filterBarEl          = document.getElementById("filter-bar");
const filterNodeTypeEl     = document.getElementById("filter-node-type");
const filterFlowNameEl     = document.getElementById("filter-flow-name");
const filterCountEl        = document.getElementById("filter-count");
const clearFiltersBtnEl    = document.getElementById("clear-filters");

const tabBtns              = document.querySelectorAll(".tab-btn");
const searchTabPanelEl     = document.getElementById("search-tab-panel");
const callersTabPanelEl    = document.getElementById("callers-tab-panel");
const callersBtnEl         = document.getElementById("callers-btn");
const callersHintEl        = document.getElementById("callers-hint");
const callersStatusEl      = document.getElementById("callers-status");
const callersResultsEl     = document.getElementById("callers-results");
const callersProcessedEl   = document.getElementById("callers-processed");

// ─── State ─────────────────────────────────────────────────────────────────
let uiBaseUrl = null;
let currentAllItems = [];
let currentSearchContext = { projectId: "", localeId: "", flowId: "" };

// ─── Utilities ─────────────────────────────────────────────────────────────
function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
}

function clearResults() {
  processedResultsEl.innerHTML = "";
  jsonResultsEl.textContent = "";
  resultsPanelEl.classList.add("hidden");
  filterBarEl.classList.add("hidden");
  currentAllItems = [];
}

function switchView(mode) {
  const showProcessed = mode === "processed";
  processedResultsEl.classList.toggle("hidden", !showProcessed);
  jsonResultsEl.classList.toggle("hidden", showProcessed);
  processedViewBtn.classList.toggle("active", showProcessed);
  jsonViewBtn.classList.toggle("active", !showProcessed);
}

// ─── Render helpers ────────────────────────────────────────────────────────
function addDetailRow(container, label, value) {
  if (!value) return;
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

function renderExcerpt(container, fieldType, excerptHtml) {
  const blockEl = document.createElement("div");
  blockEl.className = "excerpt-block";

  const titleEl = document.createElement("span");
  titleEl.className = "excerpt-field";
  titleEl.textContent = fieldType ? `${fieldType}: ` : "Matched: ";
  blockEl.appendChild(titleEl);

  const textEl = document.createElement("span");
  textEl.className = "excerpt-text";
  // excerptHtml contains <mark> tags from our own helper — internal use only
  textEl.innerHTML = excerptHtml;
  blockEl.appendChild(textEl);

  container.appendChild(blockEl);
}

function renderProcessedNodes(items, query) {
  processedResultsEl.innerHTML = "";

  // Setup hint when deep links aren't configured
  if (!uiBaseUrl) {
    const hintEl = document.createElement("p");
    hintEl.className = "deep-link-hint";
    hintEl.textContent = "\uD83D\uDCA1 Add COGNIGY_UI_BASE_URL to your .env to enable \u2018Open in Cognigy\u2019 links on each result.";
    processedResultsEl.appendChild(hintEl);
  }

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

    // Deep link — Cognigy needs the node reference ID for chart routing
    const projectId = currentSearchContext.projectId;
    const localeId = item.node.localeReference || currentSearchContext.localeId;
    const flowId = item.flowId || currentSearchContext.flowId;
    const nodeId = item.nodeId || "";
    const deepLink = uiBaseUrl ? buildCognigyDeepLink(uiBaseUrl, projectId, localeId, flowId, nodeId) : null;

    // Title — make it a link when we have a deep link, otherwise plain text
    const titleEl = document.createElement(deepLink ? "a" : "h3");
    titleEl.className = "node-title";
    titleEl.textContent = node.label || "(No label)";
    if (deepLink) {
      titleEl.href = deepLink;
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
    }
    cardEl.appendChild(titleEl);

    // Meta row
    const metaEl = document.createElement("p");
    metaEl.className = "node-meta";
    metaEl.textContent = `Type: ${node.type || "unknown"} | Node ID: ${item.nodeId || "n/a"}`;
    cardEl.appendChild(metaEl);

    if (item.flowName) {
      const flowEl = document.createElement("p");
      flowEl.className = "node-meta";
      flowEl.textContent = `Flow: ${item.flowName}`;
      cardEl.appendChild(flowEl);
    }

    // Show "Open in Cognigy" link explicitly below meta (in addition to title link)
    // so it's easy to spot even when the title is long
    if (deepLink) {
      const linkEl = document.createElement("a");
      linkEl.className = "deep-link";
      linkEl.href = deepLink;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = "Open in Cognigy \u2197";
      cardEl.appendChild(linkEl);
    } else if (item.nodeId || item.nodeReferenceId) {
      // Deep links not configured — show copyable ref ID as fallback
      const refEl = document.createElement("p");
      refEl.className = "node-meta ref-id";
      refEl.textContent = `Ref: ${item.nodeId || item.nodeReferenceId}`;
      refEl.title = "Click to copy reference ID";
      refEl.style.cursor = "pointer";
      refEl.addEventListener("click", () => {
        navigator.clipboard.writeText(item.nodeId || item.nodeReferenceId).catch(() => {});
        refEl.textContent = "Copied!";
        setTimeout(() => { refEl.textContent = `Ref: ${item.nodeId || item.nodeReferenceId}`; }, 1500);
      });
      cardEl.appendChild(refEl);
    }

    // Details
    const detailsEl = document.createElement("div");
    detailsEl.className = "details-grid";
    addDetailRow(detailsEl, "Extension", node.extension || "");
    addDetailRow(detailsEl, "Analytics step", node.analyticsLabel || "");
    addDetailRow(detailsEl, "Comment", node.comment || "");
    addDetailRow(detailsEl, "Disabled", node.isDisabled ? "Yes" : "");
    cardEl.appendChild(detailsEl);

    // Match excerpts (using matchPath + extractMatchExcerpt)
    const matches = Array.isArray(item.matches) ? item.matches : [];
    if (matches.length) {
      const matchesWrapEl = document.createElement("div");
      matchesWrapEl.className = "matches-wrap";
      const matchesTitleEl = document.createElement("p");
      matchesTitleEl.className = "matches-title";
      matchesTitleEl.textContent = "Matched fields:";
      matchesWrapEl.appendChild(matchesTitleEl);

      for (const match of matches) {
        const excerpt = match.matchPath ? extractMatchExcerpt(node, match.matchPath, query) : null;
        if (excerpt) {
          renderExcerpt(matchesWrapEl, match.fieldType || match.matchPath, excerpt);
        } else {
          // Fallback: show badge only
          const badgeEl = document.createElement("span");
          badgeEl.className = "match-badge";
          badgeEl.textContent = `${match.fieldType || "?"} \u2192 ${match.matchPath || "unknown"}`;
          matchesWrapEl.appendChild(badgeEl);
        }
      }
      cardEl.appendChild(matchesWrapEl);
    }

    processedResultsEl.appendChild(cardEl);
  }
}

// ─── Filter bar ────────────────────────────────────────────────────────────
function populateFilterBar(items) {
  const nodeTypes = Array.from(new Set(items.map(i => i.node && i.node.type).filter(Boolean))).sort();
  const flowNames = Array.from(new Set(items.map(i => i.flowName).filter(Boolean))).sort();

  filterNodeTypeEl.innerHTML = '<option value="">All node types</option>';
  for (const nt of nodeTypes) {
    const opt = document.createElement("option");
    opt.value = nt;
    opt.textContent = nt;
    filterNodeTypeEl.appendChild(opt);
  }

  filterFlowNameEl.innerHTML = '<option value="">All flows</option>';
  for (const fn of flowNames) {
    const opt = document.createElement("option");
    opt.value = fn;
    opt.textContent = fn;
    filterFlowNameEl.appendChild(opt);
  }

  // Hide flow filter if all results are from the same flow
  filterFlowNameEl.parentElement && (filterFlowNameEl.style.display = flowNames.length > 1 ? "" : "none");

  filterBarEl.classList.remove("hidden");
  updateFilterCount(items.length, items.length);
}

function updateFilterCount(visible, total) {
  filterCountEl.textContent = visible === total
    ? `${total} result${total !== 1 ? "s" : ""}`
    : `Showing ${visible} of ${total}`;
}

function applyFilters(query) {
  const nodeType = filterNodeTypeEl.value;
  const flowName = filterFlowNameEl.value;
  const filtered = filterResults(currentAllItems, { nodeType, flowName });
  renderProcessedNodes(filtered, query);
  updateFilterCount(filtered.length, currentAllItems.length);
  jsonResultsEl.textContent = JSON.stringify(filtered, null, 2);
}

// ─── Form state ────────────────────────────────────────────────────────────
function updateSubmitState() {
  const hasProject = Boolean(projectSelectEl.value);
  const hasQuery   = Boolean(queryInputEl.value.trim());
  const hasType    = Boolean(nodeTypeInputEl.value.trim());
  const canSubmit  = hasProject && (hasQuery || hasType);
  submitBtnEl.disabled = !canSubmit;
  formHintEl.textContent = !hasProject
    ? "Select a project to enable search."
    : (!hasQuery && !hasType)
    ? "Enter a search query or node type to search."
    : "";

  const hasFlow = Boolean(flowSelectEl.value);
  const canFindCallers = hasProject && hasFlow;
  callersBtnEl.disabled = !canFindCallers;
  callersHintEl.textContent = !hasProject
    ? "Select a project to find callers."
    : !hasFlow
    ? "Select a specific flow to find callers."
    : "";
}

// ─── Flow type datalist ────────────────────────────────────────────────────
async function loadNodeTypeDatalist(flowId) {
  nodeTypeListEl.innerHTML = "";
  if (!flowId) return;
  try {
    const response = await fetch(`/api/node-types?flowId=${encodeURIComponent(flowId)}`);
    const data = await response.json();
    if (!response.ok) return;
    for (const nt of (data.items || [])) {
      const opt = document.createElement("option");
      opt.value = nt;
      nodeTypeListEl.appendChild(opt);
    }
  } catch (_err) {
    // non-fatal — datalist suggestions just won't appear
  }
}

// ─── Project / flow loaders ────────────────────────────────────────────────
function renderProjects(items, defaultProjectId) {
  const prev = projectSelectEl.value;
  projectSelectEl.innerHTML = '<option value="">Select project</option>';
  for (const project of items) {
    const opt = document.createElement("option");
    opt.value = project.id;
    opt.textContent = project.name;
    projectSelectEl.appendChild(opt);
  }
  if (prev && items.some(p => p.id === prev)) {
    projectSelectEl.value = prev;
  } else if (defaultProjectId && items.some(p => p.id === defaultProjectId)) {
    projectSelectEl.value = defaultProjectId;
  }
}

function renderFlows(items) {
  const prev = flowSelectEl.value;
  flowSelectEl.innerHTML = '<option value="">All flows</option>';
  for (const flow of items) {
    const opt = document.createElement("option");
    opt.value = flow.id;
    opt.textContent = flow.name;
    flowSelectEl.appendChild(opt);
  }
  if (prev && items.some(f => f.id === prev)) {
    flowSelectEl.value = prev;
  }
}

async function loadFlows() {
  const projectId = projectSelectEl.value;
  nodeTypeListEl.innerHTML = "";
  if (!projectId) {
    renderFlows([]);
    return;
  }
  try {
    const response = await fetch(`/api/flows?projectId=${encodeURIComponent(projectId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load flows");
    currentSearchContext = {
      ...currentSearchContext,
      projectId,
      localeId: data.primaryLocaleId || data.primaryLocaleReference || ""
    };
    renderFlows(data.items || []);
    await loadNodeTypeDatalist(flowSelectEl.value);
    updateSubmitState();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Failed to load flows", true);
  }
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load projects");
    renderProjects(data.items || [], data.defaultProjectId || "");
    await loadFlows();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Failed to load projects", true);
  }
}

async function fetchConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    uiBaseUrl = data.uiBaseUrl || null;
  } catch (_err) {
    // non-fatal
  }
}

// ─── Tab switching ─────────────────────────────────────────────────────────
function switchTab(tabName) {
  for (const btn of tabBtns) {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  }
  searchTabPanelEl.classList.toggle("hidden", tabName !== "search");
  callersTabPanelEl.classList.toggle("hidden", tabName !== "callers");
}

// ─── Callers feature ───────────────────────────────────────────────────────
function clearCallers() {
  callersProcessedEl.innerHTML = "";
  callersResultsEl.classList.add("hidden");
  callersStatusEl.textContent = "";
  callersStatusEl.className = "";
}

function setCallersStatus(message, isError = false) {
  callersStatusEl.textContent = message;
  callersStatusEl.className = isError ? "error" : "";
}

function renderCallers(data) {
  callersProcessedEl.innerHTML = "";

  if (!data.callers || data.callers.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty-results";
    emptyEl.textContent = "No flows found that reference this flow.";
    callersProcessedEl.appendChild(emptyEl);
    callersResultsEl.classList.remove("hidden");
    return;
  }

  for (const caller of data.callers) {
    const cardEl = document.createElement("article");
    cardEl.className = "caller-card";

    const titleEl = document.createElement("h3");
    titleEl.className = "caller-flow-title";
    titleEl.textContent = caller.flow.name;
    cardEl.appendChild(titleEl);

    const nodeCountEl = document.createElement("p");
    nodeCountEl.className = "node-meta";
    nodeCountEl.textContent = `${caller.nodes.length} referencing node${caller.nodes.length !== 1 ? "s" : ""}`;
    cardEl.appendChild(nodeCountEl);

    const nodeListEl = document.createElement("ul");
    nodeListEl.className = "caller-node-list";

    for (const node of caller.nodes) {
      const itemEl = document.createElement("li");
      itemEl.className = "caller-node-item";

      const projectId = currentSearchContext.projectId;
      const localeId = currentSearchContext.localeId;
      const deepLink = uiBaseUrl
        ? buildCognigyDeepLink(uiBaseUrl, projectId, localeId, caller.flow.id, node.nodeReferenceId)
        : null;

      const labelText = node.nodeLabel || "(No label)";
      const typeText = node.nodeType ? ` [${node.nodeType}]` : "";

      if (deepLink) {
        const linkEl = document.createElement("a");
        linkEl.href = deepLink;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.textContent = `${labelText}${typeText}`;
        itemEl.appendChild(linkEl);
      } else {
        itemEl.textContent = `${labelText}${typeText}`;
        if (node.nodeId || node.nodeReferenceId) {
          const refEl = document.createElement("span");
          refEl.className = "caller-node-ref";
          refEl.textContent = ` (${node.nodeId || node.nodeReferenceId})`;
          itemEl.appendChild(refEl);
        }
      }

      nodeListEl.appendChild(itemEl);
    }

    cardEl.appendChild(nodeListEl);
    callersProcessedEl.appendChild(cardEl);
  }

  callersResultsEl.classList.remove("hidden");
}

async function findCallers() {
  const projectId = projectSelectEl.value;
  const targetFlowId = flowSelectEl.value;

  if (!projectId || !targetFlowId) {
    setCallersStatus("Select a project and a specific flow first.", true);
    return;
  }

  clearCallers();
  setCallersStatus("Scanning flows for callers…");

  try {
    const params = new URLSearchParams({ targetFlowId, projectId });
    const response = await fetch(`/api/flow-callers?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Find callers failed");

    let statusMsg = `Found ${data.count} flow${data.count !== 1 ? "s" : ""} referencing this flow`;
    statusMsg += ` (${data.nodeCount} node${data.nodeCount !== 1 ? "s" : ""} total).`;

    const errs = Array.isArray(data.callerErrors) ? data.callerErrors : [];
    if (errs.length > 0) {
      statusMsg += ` ⚠ ${errs.length} flow(s) could not be scanned — check API permissions.`;
    }

    setCallersStatus(statusMsg, errs.length > 0 && data.count === 0);
    renderCallers(data);
  } catch (err) {
    setCallersStatus(err instanceof Error ? err.message : "Find callers failed", true);
  }
}

// ─── Event listeners ───────────────────────────────────────────────────────
refreshProjectsBtnEl.addEventListener("click", loadProjects);
refreshFlowsBtnEl.addEventListener("click", loadFlows);

for (const btn of tabBtns) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

callersBtnEl.addEventListener("click", findCallers);

projectSelectEl.addEventListener("change", async () => {
  await loadFlows();
  updateSubmitState();
});

flowSelectEl.addEventListener("change", async () => {
  await loadNodeTypeDatalist(flowSelectEl.value);
  clearCallers();
  updateSubmitState();
});

queryInputEl.addEventListener("input", updateSubmitState);
nodeTypeInputEl.addEventListener("input", updateSubmitState);

processedViewBtn.addEventListener("click", () => switchView("processed"));
jsonViewBtn.addEventListener("click", () => switchView("json"));

filterNodeTypeEl.addEventListener("change", () => applyFilters(queryInputEl.value.trim()));
filterFlowNameEl.addEventListener("change", () => applyFilters(queryInputEl.value.trim()));

clearFiltersBtnEl.addEventListener("click", () => {
  filterNodeTypeEl.value = "";
  filterFlowNameEl.value = "";
  applyFilters(queryInputEl.value.trim());
});

// ─── Search submit ─────────────────────────────────────────────────────────
searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query    = queryInputEl.value.trim();
  const nodeType = nodeTypeInputEl.value.trim();
  const projectId = projectSelectEl.value;
  const flowId   = flowSelectEl.value;
  const limit    = limitInputEl.value;

  if (!projectId) {
    setStatus("Please select a project.", true);
    clearResults();
    return;
  }
  if (!query && !nodeType) {
    setStatus("Enter a search query or select a node type.", true);
    clearResults();
    return;
  }

  // When both text and nodeType are provided, send text to server;
  // nodeType becomes a post-load client-side filter.
  const serverNodeType = query ? "" : nodeType;

  setStatus("Searching…");
  clearResults();

  currentSearchContext = { ...currentSearchContext, projectId, flowId };

  try {
    const params = new URLSearchParams({ limit: String(limit), projectId });
    if (flowId)          params.set("flowId", flowId);
    if (query)           params.set("q", query);
    else if (serverNodeType) params.set("nodeType", serverNodeType);

    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Search failed");

    currentAllItems = data.items || [];

    const isSingleFlow = Boolean(flowId);
    const isAllFlows   = data.mode === "all-flows-node-search";
    const isNodeType   = isSingleFlow && !query;

    let statusMsg;
    if (isNodeType)       statusMsg = `Found ${data.count} node(s) of type '${nodeType}' in selected flow.`;
    else if (isSingleFlow) statusMsg = `Found ${data.count} matching node(s) in selected flow.`;
    else                   statusMsg = `Found ${data.count} matching node(s) across ${data.flowCount} flow(s).`;

    const flowErrors = Array.isArray(data.flowErrors) ? data.flowErrors : [];
    if (flowErrors.length > 0) {
      const errNames = flowErrors.map(e => e.flowName).join(", ");
      statusMsg += ` ⚠ ${flowErrors.length} flow(s) could not be searched (${errNames}) — check API permissions.`;
    }

    setStatus(statusMsg, flowErrors.length > 0 && data.count === 0);

    // Apply initial client-side nodeType filter if text+nodeType were both provided
    const itemsToShow = (query && nodeType)
      ? filterResults(currentAllItems, { nodeType })
      : currentAllItems;

    renderProcessedNodes(itemsToShow, query);
    populateFilterBar(currentAllItems);

    // Pre-select the nodeType filter if it was combined with text
    if (query && nodeType) {
      filterNodeTypeEl.value = nodeType;
      updateFilterCount(itemsToShow.length, currentAllItems.length);
    }

    jsonResultsEl.textContent = JSON.stringify(itemsToShow, null, 2);
    resultsPanelEl.classList.remove("hidden");
    switchView("processed");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Search failed", true);
    clearResults();
  }
});

// ─── Init ──────────────────────────────────────────────────────────────────
updateSubmitState();
fetchConfig();
loadProjects();
