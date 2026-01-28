/**
 * Omnis Dashboard - Entry Point
 *
 * Supports both stdio and HTTP transports.
 * Usage:
 *   node dist/index.js --stdio   # For MCP client integration
 *   node dist/index.js           # For HTTP transport (default)
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import express from "express";
import cors from "cors";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function main() {
  const isStdio = process.argv.includes("--stdio");

  if (isStdio) {
    // Stdio transport for MCP client integration
    console.error("[omnis-dashboard] Starting in stdio mode...");

    const server = createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.error("[omnis-dashboard] Server connected via stdio");
  } else {
    // HTTP transport for development and testing
    console.log(`[omnis-dashboard] Starting HTTP server on port ${PORT}...`);

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // MCP over HTTP (Streamable HTTP transport)
    // Note: Full implementation requires @modelcontextprotocol/sdk HTTP transport
    // For now, provide a basic endpoint for testing
    app.post("/mcp", async (_req, res) => {
      // TODO: Implement Streamable HTTP transport
      // See: https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-server-react/main.ts
      res.status(501).json({
        error: "HTTP transport not fully implemented. Use --stdio for MCP client integration.",
      });
    });

    app.listen(PORT, () => {
      console.log(`[omnis-dashboard] HTTP server listening on http://localhost:${PORT}`);
      console.log(`[omnis-dashboard] Health check: http://localhost:${PORT}/health`);
      console.log(`[omnis-dashboard] For MCP integration, use: --stdio`);
    });
  }
}

main().catch((error) => {
  console.error("[omnis-dashboard] Fatal error:", error);
  process.exit(1);
});
