#!/usr/bin/env node
// Standalone MCP (Model Context Protocol) server exposing drone-hub's
// docs/components/*.md catalog over stdio. This package is never imported
// by the Next.js app and never enters the Vercel bundle — same discipline
// as /pipeline never being imported from app/, components/, or lib/. See
// this repo's root .mcp.json for how a Claude Code session picks it up.
//
// Three tools, all reading docs/components/ directly at request time (see
// lib/catalog.js's header comment for how each one derives its answer from
// the real, inconsistent doc structure — no content is duplicated here):
//   - list_components         -> every component's {slug, title, description}
//   - get_component_docs      -> one component's full raw markdown
//   - get_component_usage     -> just that doc's usage code snippet

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listComponents,
  getComponentDocs,
  getComponentUsage,
  UnknownSlugError,
  NoUsageSnippetError,
} from "./lib/catalog.js";

const server = new McpServer({
  name: "drone-hub-component-catalog",
  version: "0.1.0",
});

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Maps the catalog's typed errors to a clear tool-error result rather than letting them crash the server. */
function toErrorResult(err) {
  if (err instanceof UnknownSlugError || err instanceof NoUsageSnippetError) {
    return errorResult(err.message);
  }
  // Anything unexpected still surfaces as a tool error, not a server crash.
  return errorResult(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}

server.registerTool(
  "list_components",
  {
    title: "List components",
    description:
      "Lists every component/tool documented under docs/components/*.md in the " +
      "drone-hub component library, each with its slug and a one-line description " +
      "extracted from that doc's own opening summary blockquote. Read fresh from " +
      "disk on every call.",
    inputSchema: {},
  },
  async () => {
    const components = await listComponents();
    return textResult(JSON.stringify(components, null, 2));
  },
);

server.registerTool(
  "get_component_docs",
  {
    title: "Get component docs",
    description:
      "Returns the full raw markdown of docs/components/<slug>.md for one component, " +
      "read directly from disk. Use list_components first to discover valid slugs.",
    inputSchema: {
      slug: z
        .string()
        .describe('Component slug, e.g. "layer-viewer" or "video-tour" (matches the docs/components/<slug>.md filename).'),
    },
  },
  async ({ slug }) => {
    try {
      const content = await getComponentDocs(slug);
      return textResult(content);
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "get_component_usage",
  {
    title: "Get component usage snippet",
    description:
      "Returns just the usage code snippet from docs/components/<slug>.md (not the " +
      "whole page) — the fenced code block under its \"## Usage\" section, or the " +
      "doc's first ```tsx block if there's no \"## Usage\" heading. Errors clearly if " +
      "the doc has no fenced usage snippet at all.",
    inputSchema: {
      slug: z
        .string()
        .describe('Component slug, e.g. "model3d" or "file-upload" (matches the docs/components/<slug>.md filename).'),
    },
  },
  async ({ slug }) => {
    try {
      const { lang, code } = await getComponentUsage(slug);
      return textResult(`\`\`\`${lang}\n${code}\n\`\`\``);
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
