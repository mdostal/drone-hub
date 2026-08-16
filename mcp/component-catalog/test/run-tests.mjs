#!/usr/bin/env node
// Minimal, real end-to-end test: spawns server.js as a real child process
// over stdio (exactly how a Claude Code session launches it per .mcp.json)
// and drives it with the MCP SDK's own Client + StdioClientTransport —
// real JSON-RPC over stdio, not a mocked call into the handler functions.
// Run with: npm test (from mcp/component-catalog/)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "server.js");

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function firstText(result) {
  const block = result.content.find((c) => c.type === "text");
  return block ? block.text : "";
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // the running node binary
    args: [serverPath],
  });
  const client = new Client({ name: "component-catalog-test", version: "0.0.1" });
  await client.connect(transport);

  console.log("Connected to component-catalog MCP server.\n");

  // --- list_components ---
  console.log("list_components:");
  const listResult = await client.callTool({ name: "list_components", arguments: {} });
  const components = JSON.parse(firstText(listResult));
  console.log(`  ${components.length} components returned`);
  for (const c of components) {
    console.log(`    - ${c.slug}: ${c.description.slice(0, 70)}${c.description.length > 70 ? "…" : ""}`);
  }
  check("list_components is not an error", listResult.isError !== true);
  check("list_components returns exactly 12 components", components.length === 12, `got ${components.length}`);
  check(
    "every component has a non-empty slug/title/description",
    components.every((c) => c.slug && c.title && c.description),
  );
  check(
    "includes layer-viewer with a real description (not the no-blockquote fallback)",
    components.some(
      (c) => c.slug === "layer-viewer" && c.description.startsWith("Drape a"),
    ),
  );
  console.log();

  // --- get_component_docs: valid slug ---
  console.log("get_component_docs('layer-viewer'):");
  const docsResult = await client.callTool({
    name: "get_component_docs",
    arguments: { slug: "layer-viewer" },
  });
  const docsText = firstText(docsResult);
  console.log(`  ${docsText.length} chars returned, starts with: ${JSON.stringify(docsText.slice(0, 60))}`);
  check("get_component_docs is not an error", docsResult.isError !== true);
  check("get_component_docs returns the real full page", docsText.startsWith("# `<LayerViewer>`"));
  check("get_component_docs includes late-page content (full file, not truncated)", docsText.includes("### v2 update"));
  console.log();

  // --- get_component_docs: video-tour, second valid slug ---
  console.log("get_component_docs('video-tour'):");
  const videoDocsResult = await client.callTool({
    name: "get_component_docs",
    arguments: { slug: "video-tour" },
  });
  const videoDocsText = firstText(videoDocsResult);
  console.log(`  ${videoDocsText.length} chars returned, starts with: ${JSON.stringify(videoDocsText.slice(0, 60))}`);
  check("get_component_docs(video-tour) is not an error", videoDocsResult.isError !== true);
  check("get_component_docs(video-tour) returns the real full page", videoDocsText.startsWith("# `<VideoTour>`"));
  console.log();

  // --- get_component_usage: a doc with an explicit "## Usage" section ---
  console.log("get_component_usage('voxel-terrain'):");
  const usageResult = await client.callTool({
    name: "get_component_usage",
    arguments: { slug: "voxel-terrain" },
  });
  const usageText = firstText(usageResult);
  console.log(usageText.split("\n").map((l) => `    ${l}`).join("\n"));
  check("get_component_usage is not an error", usageResult.isError !== true);
  check("get_component_usage returns a fenced snippet, not the whole page", usageText.startsWith("```tsx"));
  check("get_component_usage is meaningfully shorter than the full doc", usageText.length < 2000);
  console.log();

  // --- get_component_usage: a doc with NO fenced usage snippet at all ---
  // layer-viewer.md only shows its type shape as a ```ts block and its API
  // as inline code — it deliberately has no fenced usage example. This
  // proves the tool errors clearly instead of crashing/returning undefined
  // when a doc genuinely lacks one.
  console.log("get_component_usage('layer-viewer') — expected clear error, no crash:");
  const noUsageResult = await client.callTool({
    name: "get_component_usage",
    arguments: { slug: "layer-viewer" },
  });
  console.log(`  isError=${noUsageResult.isError} text=${JSON.stringify(firstText(noUsageResult))}`);
  check("get_component_usage(layer-viewer) reports isError, not a crash", noUsageResult.isError === true);
  check(
    "get_component_usage(layer-viewer) gives a clear 'no usage snippet' message",
    firstText(noUsageResult).includes("No usage code snippet found"),
  );
  console.log();

  // --- invalid slug on all three tools ---
  console.log("invalid slug ('does-not-exist') on all three tools:");
  for (const toolName of ["get_component_docs", "get_component_usage"]) {
    const result = await client.callTool({
      name: toolName,
      arguments: { slug: "does-not-exist" },
    });
    console.log(`  ${toolName}: isError=${result.isError} text=${JSON.stringify(firstText(result))}`);
    check(`${toolName}(invalid slug) reports isError, not a crash`, result.isError === true);
    check(
      `${toolName}(invalid slug) gives a clear "Unknown component slug" message`,
      firstText(result).includes("Unknown component slug"),
    );
  }
  console.log();

  // --- path-traversal-shaped slug ---
  console.log("path-traversal-shaped slug ('../../../etc/passwd'):");
  const traversalResult = await client.callTool({
    name: "get_component_docs",
    arguments: { slug: "../../../etc/passwd" },
  });
  console.log(`  isError=${traversalResult.isError} text=${JSON.stringify(firstText(traversalResult))}`);
  check("path-traversal slug is rejected, not read", traversalResult.isError === true);
  console.log();

  await client.close();

  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test harness crashed:", err);
  process.exit(1);
});
