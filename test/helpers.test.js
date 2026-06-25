const test = require("node:test");
const assert = require("node:assert/strict");
const { extractMatchExcerpt, filterResults, buildCognigyDeepLink } = require("../public/helpers.js");

// ─── extractMatchExcerpt ───────────────────────────────────────────────────

test("extractMatchExcerpt: returns excerpt with <mark> wrapping the query term", () => {
  const node = { config: { text: "On a scale of 1 to 5, how was your experience?" } };
  const result = extractMatchExcerpt(node, "config.text", "scale of 1");
  assert.ok(result.includes("<mark>scale of 1</mark>"), `Expected <mark>scale of 1</mark> in: ${result}`);
  assert.ok(result.includes("On a"), "Expected surrounding context before match");
  assert.ok(result.includes("to 5"), "Expected surrounding context after match");
});

test("extractMatchExcerpt: traverses nested array path correctly", () => {
  const node = { config: { buttons: [{ title: "No" }, { title: "Good experience" }] } };
  const result = extractMatchExcerpt(node, "config.buttons[1].title", "Good");
  assert.ok(result !== null, "Expected non-null result for existing path");
  assert.ok(result.includes("<mark>Good</mark>"), `Expected <mark>Good</mark> in: ${result}`);
});

test("extractMatchExcerpt: returns null when path does not exist in node", () => {
  const node = { config: {} };
  const result = extractMatchExcerpt(node, "config.text", "hello");
  assert.equal(result, null);
});

test("extractMatchExcerpt: returns raw value (no mark) when query not found in value", () => {
  const node = { config: { text: "Something completely different" } };
  const result = extractMatchExcerpt(node, "config.text", "hello");
  assert.ok(result !== null, "Expected non-null result when path exists");
  assert.ok(!result.includes("<mark>"), "Expected no <mark> when query is absent from value");
  assert.ok(result.includes("Something completely different"), "Expected raw value to be returned");
});

test("extractMatchExcerpt: handles top-level node property (e.g. label)", () => {
  const node = { label: "Ask for rating", config: {} };
  const result = extractMatchExcerpt(node, "label", "rating");
  assert.ok(result !== null);
  assert.ok(result.includes("<mark>rating</mark>"), `Expected <mark>rating</mark> in: ${result}`);
});

test("extractMatchExcerpt: returns null for null node", () => {
  assert.equal(extractMatchExcerpt(null, "config.text", "hello"), null);
});

// ─── filterResults ─────────────────────────────────────────────────────────

const makeItem = (nodeType, flowName) => ({
  node: { type: nodeType },
  flowName
});

test("filterResults: nodeType filter returns only matching items; non-matching are absent", () => {
  const items = [makeItem("say", "Alpha"), makeItem("say", "Beta"), makeItem("question", "Alpha")];
  const result = filterResults(items, { nodeType: "say" });
  assert.equal(result.length, 2);
  assert.ok(result.every(i => i.node.type === "say"), "All returned items must be type 'say'");
  assert.ok(!result.some(i => i.node.type === "question"), "question item must be absent");
});

test("filterResults: flowName filter returns only matching items; other flows absent", () => {
  const items = [makeItem("say", "Alpha"), makeItem("question", "Beta"), makeItem("code", "Alpha")];
  const result = filterResults(items, { flowName: "Alpha" });
  assert.equal(result.length, 2);
  assert.ok(result.every(i => i.flowName === "Alpha"), "All returned items must be from Alpha");
  assert.ok(!result.some(i => i.flowName === "Beta"), "Beta item must be absent");
});

test("filterResults: combined filter excludes items matching only one criterion", () => {
  const items = [
    makeItem("say", "Alpha"),  // ✓ matches both
    makeItem("say", "Beta"),   // ✗ wrong flow
    makeItem("question", "Alpha")  // ✗ wrong type
  ];
  const result = filterResults(items, { nodeType: "say", flowName: "Alpha" });
  assert.equal(result.length, 1);
  assert.equal(result[0].node.type, "say");
  assert.equal(result[0].flowName, "Alpha");
});

test("filterResults: empty filter object returns all items unchanged", () => {
  const items = [makeItem("say", "Alpha"), makeItem("question", "Beta")];
  const result = filterResults(items, {});
  assert.equal(result.length, 2);
  assert.deepEqual(result, items);
});

test("filterResults: filter value not present in any item returns empty array", () => {
  const items = [makeItem("say", "Alpha"), makeItem("question", "Beta")];
  const result = filterResults(items, { nodeType: "if" });
  assert.equal(result.length, 0);
});

// ─── buildCognigyDeepLink ──────────────────────────────────────────────────

test("buildCognigyDeepLink: returns exact URL when all params present", () => {
  const url = buildCognigyDeepLink(
    "https://app.cognigy.example.com",
    "proj-1",
    "flow-1",
    "ref-uuid-1"
  );
  assert.equal(url, "https://app.cognigy.example.com/agent/proj-1/flows/flow-1?nodeId=ref-uuid-1");
});

test("buildCognigyDeepLink: strips trailing slash from uiBaseUrl to avoid double slash", () => {
  const url = buildCognigyDeepLink(
    "https://app.cognigy.example.com/",
    "proj-1",
    "flow-1",
    "ref-uuid-1"
  );
  assert.equal(url, "https://app.cognigy.example.com/agent/proj-1/flows/flow-1?nodeId=ref-uuid-1");
});

test("buildCognigyDeepLink: returns null when uiBaseUrl is null", () => {
  assert.equal(buildCognigyDeepLink(null, "proj-1", "flow-1", "ref-uuid-1"), null);
});

test("buildCognigyDeepLink: returns null when uiBaseUrl is empty string", () => {
  assert.equal(buildCognigyDeepLink("", "proj-1", "flow-1", "ref-uuid-1"), null);
});
