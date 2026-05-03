#!/usr/bin/env node
/**
 * AgentVault MCP Server.
 * Exposes on-chain spending-controlled vault operations as MCP tools
 * for AI agents (Claude Desktop, Cursor, etc.).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { VaultManager } from "./vault.js";
import { tools as toolDefs } from "./tools.js";

async function main() {
  const vm = new VaultManager();
  const tools = toolDefs(vm);

  const server = new Server(
    {
      name: "agentpay-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: zodToJsonSchema(def.inputSchema as any) as any,
    })),
  }));

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = (tools as any)[req.params.name];
    if (!def) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    try {
      const args = def.inputSchema.parse(req.params.arguments ?? {});
      return await def.handler(args);
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[agentpay-mcp] Server started on stdio");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
